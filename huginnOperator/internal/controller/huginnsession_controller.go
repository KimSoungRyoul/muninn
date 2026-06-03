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
	sessionRefIndexKey = "spec.sessionRef"
	defaultMaxRuns     = 3
	baseBackoff        = 30 * time.Second
)

// HuginnSessionReconciler reconciles a HuginnSession object.
// 책임(operator-design §1, §2.1): attempt 별 HuginnRun 생성/재시도(maxRuns), run phase 집계→session phase,
// suspend cascade, 승인 집계.
type HuginnSessionReconciler struct {
	client.Client
	Scheme         *runtime.Scheme
	MemoryEndpoint string
	APIEndpoint    string
}

// +kubebuilder:rbac:groups=muninn.io,resources=huginnsessions,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=muninn.io,resources=huginnsessions/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=muninn.io,resources=huginnsessions/finalizers,verbs=update
// +kubebuilder:rbac:groups=muninn.io,resources=huginnruns,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=muninn.io,resources=huginnagents,verbs=get;list;watch

func (r *HuginnSessionReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var session muninniov1beta1.HuginnSession
	if err := r.Get(ctx, req.NamespacedName, &session); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}
	if !session.DeletionTimestamp.IsZero() {
		return ctrl.Result{}, nil
	}

	// 부모 HuginnAgent 확인(Run 빌드에 필요).
	var agent muninniov1beta1.HuginnAgent
	if err := r.Get(ctx, client.ObjectKey{Namespace: session.Namespace, Name: session.Spec.AgentRef}, &agent); err != nil {
		if apierrors.IsNotFound(err) {
			base := session.DeepCopy()
			session.Status.Phase = muninniov1beta1.SessionFailed
			setSessionCondition(&session, "Reconciled", metav1.ConditionFalse, "AgentNotFound",
				fmt.Sprintf("agentRef %q 를 찾을 수 없음", session.Spec.AgentRef))
			return r.patchStatus(ctx, base, &session)
		}
		return ctrl.Result{}, err
	}

	// ownerRef 보강(API 가 누락한 경우; Agent.Owns(Session) 동작 보장).
	if requeue, err := r.ensureOwnerRef(ctx, &session, &agent); err != nil || requeue {
		return ctrl.Result{Requeue: requeue}, err
	}

	base := session.DeepCopy()

	// 취소 cascade(operator-design §2.3).
	if session.Spec.Suspend {
		if err := r.suspendRuns(ctx, &session); err != nil {
			return ctrl.Result{}, err
		}
		session.Status.Phase = muninniov1beta1.SessionCancelled
		setSessionCondition(&session, "Reconciled", metav1.ConditionTrue, "Suspended", "세션 취소(suspend)")
		return r.patchStatus(ctx, base, &session)
	}

	// 자식 Run 목록(attempt 오름차순).
	var runList muninniov1beta1.HuginnRunList
	if err := r.List(ctx, &runList, client.InNamespace(session.Namespace),
		client.MatchingFields{sessionRefIndexKey: session.Name}); err != nil {
		return ctrl.Result{}, err
	}
	runs := runList.Items
	sort.Slice(runs, func(i, j int) bool { return runs[i].Spec.Attempt < runs[j].Spec.Attempt })

	// 최초 Run 생성.
	if len(runs) == 0 {
		if err := r.createRun(ctx, &session, &agent, 1); err != nil {
			return ctrl.Result{}, err
		}
		log.Info("최초 Run 생성", "attempt", 1)
		session.Status.Phase = muninniov1beta1.SessionPending
		session.Status.ObservedRuns = 1
		setSessionCondition(&session, "Reconciled", metav1.ConditionTrue, "RunCreated", "attempt 1 Run 생성됨")
		return r.patchStatus(ctx, base, &session)
	}

	maxRuns := session.Spec.RetryPolicy.MaxRuns
	if maxRuns <= 0 {
		maxRuns = defaultMaxRuns
	}

	// phase 집계.
	session.Status.RunRefs = runNames(runs)
	session.Status.ObservedRuns = int32(len(runs))
	session.Status.Approval = nil

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
		session.Status.Phase = muninniov1beta1.SessionAwaitingApproval
		if awaitingRun != nil {
			session.Status.Approval = awaitingRun.Status.Approval
		}
		setSessionCondition(&session, "Approved", metav1.ConditionFalse, "AwaitingApproval", "운영자 승인 대기")
	case anyActive:
		session.Status.Phase = muninniov1beta1.SessionRunning
		setSessionCondition(&session, "Reconciled", metav1.ConditionTrue, "Running", "에이전트 실행 중")
	case latest.Status.Phase == muninniov1beta1.RunSucceeded:
		session.Status.Phase = muninniov1beta1.SessionSucceeded
		session.Status.Outcome = latest.Status.Output
		setSessionCondition(&session, "OutputReady", metav1.ConditionTrue, "Succeeded", "실행 완료")
	case latest.Status.Phase == muninniov1beta1.RunCancelled:
		session.Status.Phase = muninniov1beta1.SessionCancelled
		setSessionCondition(&session, "Reconciled", metav1.ConditionTrue, "Cancelled", "취소됨")
	case latest.Status.Phase == muninniov1beta1.RunFailed:
		// 재시도 판정(operator-design §2.1): maxRuns 미만이면 backoff 후 다음 attempt 생성.
		if int32(len(runs)) < maxRuns {
			if wait, ready := backoffReady(latest, session.Spec.RetryPolicy.Backoff); !ready {
				session.Status.Phase = muninniov1beta1.SessionRunning
				if _, err := r.patchStatus(ctx, base, &session); err != nil {
					return ctrl.Result{}, err
				}
				return ctrl.Result{RequeueAfter: wait}, nil
			}
			next := latest.Spec.Attempt + 1
			if err := r.createRun(ctx, &session, &agent, next); err != nil {
				return ctrl.Result{}, err
			}
			log.Info("재시도 Run 생성", "attempt", next)
			session.Status.Phase = muninniov1beta1.SessionRunning
			session.Status.ObservedRuns = int32(len(runs)) + 1
			setSessionCondition(&session, "Reconciled", metav1.ConditionTrue, "Retrying",
				fmt.Sprintf("attempt %d 재시도", next))
		} else {
			session.Status.Phase = muninniov1beta1.SessionFailed
			setSessionCondition(&session, "Reconciled", metav1.ConditionFalse, "MaxRunsExhausted",
				fmt.Sprintf("maxRuns(%d) 소진", maxRuns))
		}
	}

	return r.patchStatus(ctx, base, &session)
}

// ensureOwnerRef 는 Session 에 부모 Agent 의 controller ownerRef 를 보강한다.
func (r *HuginnSessionReconciler) ensureOwnerRef(ctx context.Context, session *muninniov1beta1.HuginnSession,
	agent *muninniov1beta1.HuginnAgent) (bool, error) {
	for _, o := range session.OwnerReferences {
		if o.UID == agent.UID {
			return false, nil
		}
	}
	if err := controllerutil.SetControllerReference(agent, session, r.Scheme); err != nil {
		return false, err
	}
	if err := r.Update(ctx, session); err != nil {
		return false, err
	}
	return true, nil
}

func (r *HuginnSessionReconciler) suspendRuns(ctx context.Context, session *muninniov1beta1.HuginnSession) error {
	var runList muninniov1beta1.HuginnRunList
	if err := r.List(ctx, &runList, client.InNamespace(session.Namespace),
		client.MatchingFields{sessionRefIndexKey: session.Name}); err != nil {
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

func (r *HuginnSessionReconciler) createRun(ctx context.Context, session *muninniov1beta1.HuginnSession,
	agent *muninniov1beta1.HuginnAgent, attempt int32) error {
	memEndpoint := orDefault(r.MemoryEndpoint, defaultMemoryEndpoint)
	apiEndpoint := orDefault(r.APIEndpoint, defaultAPIEndpoint)

	run := &muninniov1beta1.HuginnRun{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-a%d", session.Name, attempt),
			Namespace: session.Namespace,
			Labels:    sessionChildLabels(session, agent),
		},
		Spec: muninniov1beta1.HuginnRunSpec{
			SessionRef:              session.Name,
			Attempt:                 attempt,
			TimeoutSeconds:          3600,
			TTLSecondsAfterFinished: 86400,
			JobTemplate:             buildJobTemplate(agent, session, memEndpoint, apiEndpoint),
		},
	}
	if err := controllerutil.SetControllerReference(session, run, r.Scheme); err != nil {
		return err
	}
	if err := r.Create(ctx, run); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

func (r *HuginnSessionReconciler) patchStatus(ctx context.Context, base, session *muninniov1beta1.HuginnSession) (ctrl.Result, error) {
	if err := r.Status().Patch(ctx, session, client.MergeFrom(base)); err != nil {
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

func sessionChildLabels(session *muninniov1beta1.HuginnSession, agent *muninniov1beta1.HuginnAgent) map[string]string {
	out := map[string]string{LabelSession: session.Name}
	for _, k := range []string{LabelWorkspace, LabelAgent} {
		if v, ok := session.Labels[k]; ok {
			out[k] = v
		}
	}
	// API 가 라벨을 누락한 경우 권위 소스(spec)에서 보강 — workspace 격리 selector 가 끊기지 않도록(§6.1).
	if _, ok := out[LabelAgent]; !ok {
		out[LabelAgent] = session.Spec.AgentRef
	}
	if _, ok := out[LabelWorkspace]; !ok && agent.Spec.WorkspaceID != "" {
		out[LabelWorkspace] = agent.Spec.WorkspaceID
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

func setSessionCondition(s *muninniov1beta1.HuginnSession, condType string, status metav1.ConditionStatus, reason, msg string) {
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
func (r *HuginnSessionReconciler) SetupWithManager(mgr ctrl.Manager) error {
	// HuginnRun 을 spec.sessionRef 로 인덱싱(자식 Run 조회).
	if err := mgr.GetFieldIndexer().IndexField(context.Background(), &muninniov1beta1.HuginnRun{},
		sessionRefIndexKey, func(obj client.Object) []string {
			return []string{obj.(*muninniov1beta1.HuginnRun).Spec.SessionRef}
		}); err != nil {
		return err
	}
	return ctrl.NewControllerManagedBy(mgr).
		For(&muninniov1beta1.HuginnSession{}).
		Owns(&muninniov1beta1.HuginnRun{}).
		Named("huginnsession").
		Complete(r)
}
