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
)

// HuginnIssueReconciler reconciles a HuginnIssue object.
// 책임(operator-design §1, §2.1): attempt 별 HuginnRun 생성/재시도(maxRuns), run phase 집계→issue phase,
// suspend cascade, 승인 집계.
type HuginnIssueReconciler struct {
	client.Client
	Scheme         *runtime.Scheme
	MemoryEndpoint string
	APIEndpoint    string
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
			base := issue.DeepCopy()
			issue.Status.Phase = muninniov1beta1.IssueFailed
			setIssueCondition(&issue, "Reconciled", metav1.ConditionFalse, "AgentNotFound",
				fmt.Sprintf("agentRef %q 를 찾을 수 없음", issue.Spec.AgentRef))
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

	// 최초 Run 생성.
	if len(runs) == 0 {
		if err := r.createRun(ctx, &issue, &agent, 1); err != nil {
			return ctrl.Result{}, err
		}
		log.Info("최초 Run 생성", "attempt", 1)
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
		issue.Status.Outcome = latest.Status.Output
		setIssueCondition(&issue, "OutputReady", metav1.ConditionTrue, "Succeeded", "실행 완료")
	case latest.Status.Phase == muninniov1beta1.RunCancelled:
		issue.Status.Phase = muninniov1beta1.IssueCancelled
		setIssueCondition(&issue, "Reconciled", metav1.ConditionTrue, "Cancelled", "취소됨")
	case latest.Status.Phase == muninniov1beta1.RunFailed:
		// 재시도 판정(operator-design §2.1): maxRuns 미만이면 backoff 후 다음 attempt 생성.
		if int32(len(runs)) < maxRuns {
			if wait, ready := backoffReady(latest, issue.Spec.RetryPolicy.Backoff); !ready {
				issue.Status.Phase = muninniov1beta1.IssueRunning
				if _, err := r.patchStatus(ctx, base, &issue); err != nil {
					return ctrl.Result{}, err
				}
				return ctrl.Result{RequeueAfter: wait}, nil
			}
			next := latest.Spec.Attempt + 1
			if err := r.createRun(ctx, &issue, &agent, next); err != nil {
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

func (r *HuginnIssueReconciler) createRun(ctx context.Context, issue *muninniov1beta1.HuginnIssue,
	agent *muninniov1beta1.HuginnAgent, attempt int32) error {
	memEndpoint := orDefault(r.MemoryEndpoint, defaultMemoryEndpoint)
	apiEndpoint := orDefault(r.APIEndpoint, defaultAPIEndpoint)

	run := &muninniov1beta1.HuginnRun{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-a%d", issue.Name, attempt),
			Namespace: issue.Namespace,
			Labels:    issueChildLabels(issue, agent),
		},
		Spec: muninniov1beta1.HuginnRunSpec{
			IssueRef:                issue.Name,
			Attempt:                 attempt,
			TimeoutSeconds:          3600,
			TTLSecondsAfterFinished: 86400,
			JobTemplate:             buildJobTemplate(agent, issue, memEndpoint, apiEndpoint),
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

func (r *HuginnIssueReconciler) patchStatus(ctx context.Context, base, issue *muninniov1beta1.HuginnIssue) (ctrl.Result, error) {
	if err := r.Status().Patch(ctx, issue, client.MergeFrom(base)); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, nil
}

// backoffReady 는 직전 실패 Run 의 finishedAt 기준으로 재시도 대기를 판정한다(§2.1).
func backoffReady(latest *muninniov1beta1.HuginnRun, policy muninniov1beta1.BackoffPolicy) (time.Duration, bool) {
	if latest.Status.FinishedAt == nil || policy == muninniov1beta1.BackoffPolicy("none") {
		return 0, true
	}
	var delay time.Duration
	switch policy {
	case muninniov1beta1.BackoffPolicy("linear"):
		delay = baseBackoff * time.Duration(latest.Spec.Attempt)
	default: // exponential
		delay = baseBackoff * time.Duration(int64(1)<<(latest.Spec.Attempt-1))
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
