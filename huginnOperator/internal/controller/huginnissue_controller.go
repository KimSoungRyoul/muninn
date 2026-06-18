/*
Copyright 2026.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package controller

import (
	"context"
	"fmt"
	"sort"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	apimeta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

const (
	issueRefIndexKey = "spec.issueRef"
	defaultMaxRuns   = 3
	baseBackoff      = 30 * time.Second
	// maxBackoff: 지수 backoff 상한 클램프(리뷰 MEDIUM). 큰 maxRuns/attempt 에서도 수백 일·overflow 방지.
	maxBackoff = 15 * time.Minute
	// agentGracePeriod: Issue 생성 후 이 시간 내 AgentNotFound 는 캐시 지연으로 보고 requeue(리뷰 MEDIUM).
	agentGracePeriod = 5 * time.Minute
	// agentRequeueAfter: AgentNotFound grace 기간 중 재시도 간격.
	agentRequeueAfter = 15 * time.Second
)

// HuginnIssueReconciler reconciles a HuginnIssue object.
// 책임(operator-design §1, §2.1): attempt 별 HuginnRun 생성/재시도(maxRuns), run phase 집계→issue phase,
// suspend cascade, 승인 집계.
type HuginnIssueReconciler struct {
	client.Client
	Scheme         *runtime.Scheme
	MemoryEndpoint string
	APIEndpoint    string
	// ClaudeCodeImage/HuginnSelfImage: agent.image 가 비었을 때 쓸 runtime 별 기본 이미지(§10-5,
	// --claude-code-image/--huginn-self-image). 둘 다 비고 agent.image 도 비면 Run 생성을 거부한다.
	ClaudeCodeImage string
	HuginnSelfImage string
}

// +kubebuilder:rbac:groups=muninn.io,resources=huginnissues,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=muninn.io,resources=huginnissues/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=muninn.io,resources=huginnissues/finalizers,verbs=update
// +kubebuilder:rbac:groups=muninn.io,resources=huginnruns,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=muninn.io,resources=huginnagents,verbs=get;list;watch

func (r *HuginnIssueReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var issue muninniov1beta1.HuginnIssue
	if err := r.Get(ctx, req.NamespacedName, &issue); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}
	if !issue.DeletionTimestamp.IsZero() {
		return ctrl.Result{}, nil
	}

	// 부모 HuginnAgent 확인(Run 빌드에 필요).
	var agent muninniov1beta1.HuginnAgent
	if err := r.Get(ctx, client.ObjectKey{Namespace: issue.Namespace, Name: issue.Spec.AgentRef}, &agent); err != nil {
		if apierrors.IsNotFound(err) {
			// AgentNotFound 는 영구 Failed 로 박지 않는다(리뷰 MEDIUM): web 이 Agent 생성 직후 Issue 를
			// 위임하면 operator 의 Agent informer 캐시가 Issue 이벤트보다 늦게 동기화될 수 있다(watch 순서 미보장).
			// 생성 후 grace 기간(agentGracePeriod) 내에는 condition 만 남기고 requeue 로 Agent 출현을 기다린다.
			// grace 경과 후에만 Failed(터미널)로 확정해 level-based reconcile 원칙을 지킨다.
			base := issue.DeepCopy()
			if time.Since(issue.CreationTimestamp.Time) < agentGracePeriod {
				setIssueCondition(&issue, "Reconciled", metav1.ConditionFalse, "AgentNotFound",
					fmt.Sprintf("agentRef %q 미발견 — 캐시 동기화 대기", issue.Spec.AgentRef))
				if _, err := r.patchStatus(ctx, base, &issue); err != nil {
					return ctrl.Result{}, err
				}
				return ctrl.Result{RequeueAfter: agentRequeueAfter}, nil
			}
			issue.Status.Phase = muninniov1beta1.IssueFailed
			setIssueCondition(&issue, "Reconciled", metav1.ConditionFalse, "AgentNotFound",
				fmt.Sprintf("agentRef %q 를 찾을 수 없음(grace 경과)", issue.Spec.AgentRef))
			return r.patchStatus(ctx, base, &issue)
		}
		return ctrl.Result{}, err
	}

	// ownerRef 보강(API 가 누락한 경우; Agent.Owns(Issue) 동작 보장).
	if requeue, err := r.ensureOwnerRef(ctx, &issue, &agent); err != nil || requeue {
		return ctrl.Result{Requeue: requeue}, err
	}

	base := issue.DeepCopy()

	// 취소 cascade(operator-design §2.3).
	if issue.Spec.Suspend {
		if err := r.suspendRuns(ctx, &issue); err != nil {
			return ctrl.Result{}, err
		}
		issue.Status.Phase = muninniov1beta1.IssueCancelled
		setIssueCondition(&issue, "Reconciled", metav1.ConditionTrue, "Suspended", "세션 취소(suspend)")
		return r.patchStatus(ctx, base, &issue)
	}

	// 자식 Run 목록(attempt 오름차순).
	var runList muninniov1beta1.HuginnRunList
	if err := r.List(ctx, &runList, client.InNamespace(issue.Namespace),
		client.MatchingFields{issueRefIndexKey: issue.Name}); err != nil {
		return ctrl.Result{}, err
	}
	runs := runList.Items
	sort.Slice(runs, func(i, j int) bool { return runs[i].Spec.Attempt < runs[j].Spec.Attempt })

	// 최초 Run 생성(resume 없음 — 새 세션).
	if len(runs) == 0 {
		// effectiveRuntime 동결(§5·§10-9, record-first): Run 을 만들기 *전* 에 백엔드를 status 에 1회 기록한다.
		// createRun 이 create 와 status patch 사이에 죽어도, 다음 reconcile 이 동결값을 보고 같은 백엔드로
		// attempt 를 잇는다(라이브 agent.runtime 재스냅샷 race·cross-backend resume 손상 방지).
		if issue.Status.EffectiveRuntime == "" {
			issue.Status.EffectiveRuntime = effectiveRuntimeOf(&agent)
			if err := r.Status().Patch(ctx, &issue, client.MergeFrom(base)); err != nil {
				if apierrors.IsConflict(err) {
					return ctrl.Result{Requeue: true}, nil
				}
				return ctrl.Result{}, err
			}
			base = issue.DeepCopy() // 이후 patchStatus 의 optimistic lock 이 stale RV 로 409 나지 않게 갱신.
		}
		if err := r.createRun(ctx, &issue, &agent, 1, ""); err != nil {
			return ctrl.Result{}, err
		}
		log.Info("최초 Run 생성", "attempt", 1, "effectiveRuntime", issue.Status.EffectiveRuntime)
		issue.Status.Phase = muninniov1beta1.IssuePending
		issue.Status.ObservedRuns = 1
		setIssueCondition(&issue, "Reconciled", metav1.ConditionTrue, "RunCreated", "attempt 1 Run 생성됨")
		return r.patchStatus(ctx, base, &issue)
	}

	maxRuns := issue.Spec.RetryPolicy.MaxRuns
	if maxRuns <= 0 {
		maxRuns = defaultMaxRuns
	}

	// phase 집계.
	issue.Status.RunRefs = runNames(runs)
	issue.Status.ObservedRuns = int32(len(runs))
	issue.Status.Approval = nil

	anyActive, anyAwaiting := false, false
	var awaitingRun *muninniov1beta1.HuginnRun
	for i := range runs {
		switch runs[i].Status.Phase {
		case muninniov1beta1.RunQueued, muninniov1beta1.RunPending, muninniov1beta1.RunRunning:
			anyActive = true
		case muninniov1beta1.RunAwaitingApproval:
			anyAwaiting = true
			awaitingRun = &runs[i]
		}
	}
	latest := &runs[len(runs)-1]

	switch {
	case anyAwaiting:
		issue.Status.Phase = muninniov1beta1.IssueAwaitingApproval
		if awaitingRun != nil {
			issue.Status.Approval = awaitingRun.Status.Approval
		}
		setIssueCondition(&issue, "Approved", metav1.ConditionFalse, "AwaitingApproval", "운영자 승인 대기")
	case anyActive:
		issue.Status.Phase = muninniov1beta1.IssueRunning
		setIssueCondition(&issue, "Reconciled", metav1.ConditionTrue, "Running", "에이전트 실행 중")
	case latest.Status.Phase == muninniov1beta1.RunSucceeded:
		issue.Status.Phase = muninniov1beta1.IssueSucceeded
		// outcome 이중 writer 제거(리뷰 HIGH): outcome 은 Agent→API 소유 필드다(types §141,
		// report route 가 "PR #842" 같은 정제된 값을 기록). operator 는 run.Status.Output(원문)으로
		// 덮어쓰지 않는다 — 비어 있을 때만 보수적으로 채워 핑퐁을 막는다.
		if issue.Status.Outcome == "" {
			issue.Status.Outcome = latest.Status.Output
		}
		setIssueCondition(&issue, "OutputReady", metav1.ConditionTrue, "Succeeded", "실행 완료")
	case latest.Status.Phase == muninniov1beta1.RunCancelled:
		issue.Status.Phase = muninniov1beta1.IssueCancelled
		setIssueCondition(&issue, "Reconciled", metav1.ConditionTrue, "Cancelled", "취소됨")
	case latest.Status.Phase == muninniov1beta1.RunFailed:
		// 재시도 판정(operator-design §2.1): maxRuns 미만이면 backoff 후 다음 attempt 생성.
		if int32(len(runs)) < maxRuns {
			if wait, ready := backoffReady(latest, issue.Spec.RetryPolicy.Backoff); !ready {
				// backoff 대기 중에는 활성 Run 이 없으므로 phase=Running 으로 표기하지 않는다(리뷰 MEDIUM):
				// §6 의 'Running=활성 Run 존재' 의미·countActiveIssues 집계 왜곡을 막는다. Pending 으로 두고
				// condition reason=BackoffWaiting 으로 재시도 대기 중임을 명시한다.
				issue.Status.Phase = muninniov1beta1.IssuePending
				setIssueCondition(&issue, "Reconciled", metav1.ConditionFalse, "BackoffWaiting",
					fmt.Sprintf("재시도 backoff 대기(%s 후)", wait.Round(time.Second)))
				if _, err := r.patchStatus(ctx, base, &issue); err != nil {
					return ctrl.Result{}, err
				}
				return ctrl.Result{RequeueAfter: wait}, nil
			}
			next := latest.Spec.Attempt + 1
			// 가장 최근에 보고된 Claude 세션을 이어받는다(§5.5 resume, 리뷰 LOW-1). 직전 attempt 가
			// 세션 보고 전에 죽었어도(init 전 크래시 등) 그 이전 attempt 의 transcript 는 PVC 에 남아
			// 있으므로 뒤에서부터 첫 non-empty sessionId 를 고른다. 전부 비면 새 세션.
			if err := r.createRun(ctx, &issue, &agent, next, lastSessionID(runs)); err != nil {
				return ctrl.Result{}, err
			}
			log.Info("재시도 Run 생성", "attempt", next)
			issue.Status.Phase = muninniov1beta1.IssueRunning
			issue.Status.ObservedRuns = int32(len(runs)) + 1
			setIssueCondition(&issue, "Reconciled", metav1.ConditionTrue, "Retrying",
				fmt.Sprintf("attempt %d 재시도", next))
		} else {
			issue.Status.Phase = muninniov1beta1.IssueFailed
			setIssueCondition(&issue, "Reconciled", metav1.ConditionFalse, "MaxRunsExhausted",
				fmt.Sprintf("maxRuns(%d) 소진", maxRuns))
		}
	}

	return r.patchStatus(ctx, base, &issue)
}

// ensureOwnerRef 는 Issue 에 부모 Agent 의 controller ownerRef 를 보강한다.
func (r *HuginnIssueReconciler) ensureOwnerRef(ctx context.Context, issue *muninniov1beta1.HuginnIssue,
	agent *muninniov1beta1.HuginnAgent) (bool, error) {
	for _, o := range issue.OwnerReferences {
		if o.UID == agent.UID {
			return false, nil
		}
	}
	if err := controllerutil.SetControllerReference(agent, issue, r.Scheme); err != nil {
		return false, err
	}
	if err := r.Update(ctx, issue); err != nil {
		return false, err
	}
	return true, nil
}

func (r *HuginnIssueReconciler) suspendRuns(ctx context.Context, issue *muninniov1beta1.HuginnIssue) error {
	var runList muninniov1beta1.HuginnRunList
	if err := r.List(ctx, &runList, client.InNamespace(issue.Namespace),
		client.MatchingFields{issueRefIndexKey: issue.Name}); err != nil {
		return err
	}
	for i := range runList.Items {
		run := &runList.Items[i]
		if run.Spec.Suspend || isRunTerminal(run.Status.Phase) {
			continue
		}
		patch := client.MergeFrom(run.DeepCopy())
		run.Spec.Suspend = true
		if err := r.Patch(ctx, run, patch); err != nil {
			return err
		}
	}
	return nil
}

// createRun 은 attempt 번째 HuginnRun 을 만든다. resumeSessionID 가 있으면(재시도 attempt 한정)
// MUNINN_RESUME_SESSION_ID env 로 주입해 runner 가 직전 attempt 의 Claude 세션을 resume 한다(§5.5).
func (r *HuginnIssueReconciler) createRun(ctx context.Context, issue *muninniov1beta1.HuginnIssue,
	agent *muninniov1beta1.HuginnAgent, attempt int32, resumeSessionID string) error {
	memEndpoint := orDefault(r.MemoryEndpoint, defaultMemoryEndpoint)
	apiEndpoint := orDefault(r.APIEndpoint, defaultAPIEndpoint)

	// 백엔드 동결(§5·§10-9) + 이미지 기본값(§10-5): effectiveRuntime(최초 attempt 에서 기록된 동결값)을
	// 우선 쓰고, agent.image 가 비면 operator 기본 이미지로 채운 사본으로 JobTemplate 을 빌드한다.
	// 이로써 진행 중 agent.runtime 변경이 같은 Issue 의 후속 attempt 백엔드를 바꾸지 못한다(resume 일치 가드).
	resolved := resolveAgentForRun(agent, issue.Status.EffectiveRuntime, r.ClaudeCodeImage, r.HuginnSelfImage)
	if resolved.Spec.Agent.Image == "" {
		return fmt.Errorf("MissingImage: agent %q 의 image 가 비어 있고 runtime=%q 의 operator 기본 이미지도 미설정(--claude-code-image/--huginn-self-image)",
			agent.Name, effectiveRuntimeOf(resolved))
	}

	run := &muninniov1beta1.HuginnRun{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-a%d", issue.Name, attempt),
			Namespace: issue.Namespace,
			Labels:    issueChildLabels(issue, agent),
		},
		Spec: muninniov1beta1.HuginnRunSpec{
			IssueRef: issue.Name,
			Attempt:  attempt,
			// activeDeadline: 승인 게이트가 켜진 Run 은 7200s(승인 timeout 90m + 작업예산)로 상향해
			// 60~90m 사이 승인이 60m activeDeadline 에 SIGKILL 당하는 모순을 막는다(CONTRACT §C-HITL).
			TimeoutSeconds:          runTimeoutSeconds(agent),
			TTLSecondsAfterFinished: 86400,
			JobTemplate:             withResumeSession(buildJobTemplate(resolved, issue, memEndpoint, apiEndpoint), resumeSessionID),
		},
	}
	if err := controllerutil.SetControllerReference(issue, run, r.Scheme); err != nil {
		return err
	}
	if err := r.Create(ctx, run); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// patchStatus 는 Issue status 를 merge-patch 한다. optimistic lock(리뷰 HIGH): base 가 stale 이면
// 409 conflict→requeue 로 신선한 캐시에서 재집계 — API 가 직접 쓴 issue.status.phase(예: report route 의
// AwaitingApproval)를 stale run 캐시 기반 집계가 역전시키는 race 를 막는다.
func (r *HuginnIssueReconciler) patchStatus(ctx context.Context, base, issue *muninniov1beta1.HuginnIssue) (ctrl.Result, error) {
	if err := r.Status().Patch(ctx, issue, client.MergeFromWithOptions(base,
		client.MergeFromWithOptimisticLock{})); err != nil {
		if apierrors.IsConflict(err) {
			return ctrl.Result{Requeue: true}, nil
		}
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, nil
}

// backoffReady 는 직전 실패 Run 의 finishedAt 기준으로 재시도 대기를 판정한다(§2.1).
// 지수 backoff 의 shift overflow/폭주 가드(리뷰 MEDIUM): attempt 가 커지면 1<<(attempt-1) 이
// int64 overflow(attempt≥64 에서 음수)로 'elapsed>=delay 항상 참'→backoff 없는 즉시 재시도 루프가
// 된다. shift 전에 attempt 를 안전 상한으로 클램프하고, 최종 delay 도 maxBackoff 로 클램프한다.
func backoffReady(latest *muninniov1beta1.HuginnRun, policy muninniov1beta1.BackoffPolicy) (time.Duration, bool) {
	if latest.Status.FinishedAt == nil || policy == muninniov1beta1.BackoffPolicy("none") {
		return 0, true
	}
	var delay time.Duration
	switch policy {
	case muninniov1beta1.BackoffPolicy("linear"):
		delay = baseBackoff * time.Duration(latest.Spec.Attempt)
	default: // exponential
		// shift 폭(attempt-1)을 [0,16] 으로 클램프 — maxBackoff 를 넘기는 시점이면 어차피 상한에 도달한다.
		// baseBackoff=30s, maxBackoff=15m 기준 shift 5 이면 16m 로 상한 초과 → 6 으로 충분.
		// 1<<16 * 30s 도 한참 maxBackoff 초과 — overflow 없이 안전.
		shift := max(0, min(latest.Spec.Attempt-1, 16))
		delay = baseBackoff * time.Duration(int64(1)<<uint(shift))
	}
	if delay > maxBackoff || delay <= 0 {
		delay = maxBackoff
	}
	elapsed := time.Since(latest.Status.FinishedAt.Time)
	if elapsed >= delay {
		return 0, true
	}
	return delay - elapsed, false
}

func issueChildLabels(issue *muninniov1beta1.HuginnIssue, agent *muninniov1beta1.HuginnAgent) map[string]string {
	out := map[string]string{LabelIssue: issue.Name}
	for _, k := range []string{LabelWorkspace, LabelAgent, LabelFingerprint} {
		if v, ok := issue.Labels[k]; ok {
			out[k] = v
		}
	}
	// API 가 라벨을 누락한 경우 권위 소스(spec)에서 보강 — 격리/dedup selector 가 끊기지 않도록(§4.4, §6.1).
	if _, ok := out[LabelAgent]; !ok {
		out[LabelAgent] = issue.Spec.AgentRef
	}
	if _, ok := out[LabelWorkspace]; !ok && agent.Spec.WorkspaceID != "" {
		out[LabelWorkspace] = agent.Spec.WorkspaceID
	}
	if _, ok := out[LabelFingerprint]; !ok && issue.Spec.Event.Fingerprint != "" {
		out[LabelFingerprint] = issue.Spec.Event.Fingerprint
	}
	return out
}

// lastSessionID 는 attempt 오름차순 정렬된 runs 에서 가장 최근의 non-empty sessionId 를 반환한다(§5.5).
// sessionId 는 Agent→API 소유라 init 전에 죽은 attempt 는 비어 있다 — 그 경우 한 단계 더 거슬러
// 올라가 살아 있는 세션 체인을 잇는다(리뷰 LOW-1). 전부 비면 빈 문자열(새 세션).
func lastSessionID(runs []muninniov1beta1.HuginnRun) string {
	for i := len(runs) - 1; i >= 0; i-- {
		if sid := runs[i].Status.SessionID; sid != "" {
			return sid
		}
	}
	return ""
}

func runNames(runs []muninniov1beta1.HuginnRun) []string {
	names := make([]string, len(runs))
	for i := range runs {
		names[i] = runs[i].Name
	}
	return names
}

func setIssueCondition(s *muninniov1beta1.HuginnIssue, condType string, status metav1.ConditionStatus, reason, msg string) {
	apimeta.SetStatusCondition(&s.Status.Conditions, metav1.Condition{
		Type:               condType,
		Status:             status,
		Reason:             reason,
		Message:            msg,
		ObservedGeneration: s.Generation,
	})
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

// SetupWithManager sets up the controller with the Manager.
func (r *HuginnIssueReconciler) SetupWithManager(mgr ctrl.Manager) error {
	// HuginnRun 을 spec.issueRef 로 인덱싱(자식 Run 조회).
	if err := mgr.GetFieldIndexer().IndexField(context.Background(), &muninniov1beta1.HuginnRun{},
		issueRefIndexKey, func(obj client.Object) []string {
			return []string{obj.(*muninniov1beta1.HuginnRun).Spec.IssueRef}
		}); err != nil {
		return err
	}
	return ctrl.NewControllerManagedBy(mgr).
		For(&muninniov1beta1.HuginnIssue{}).
		Owns(&muninniov1beta1.HuginnRun{}).
		Named("huginnissue").
		Complete(r)
}
