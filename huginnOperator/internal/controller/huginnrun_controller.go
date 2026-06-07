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
	"os"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	apimeta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/utils/ptr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

// HuginnRunReconciler reconciles a HuginnRun object.
// 책임(operator-design §1): Run→Job(backoffLimit=0) 생성, Job 상태→Run.phase 매핑,
// 상속 caps 복사, suspend→취소. 진행 메트릭(step/cost/tokens)은 Agent→API 소유라 건드리지 않는다(§2.2).
type HuginnRunReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=muninn.io,resources=huginnruns,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=muninn.io,resources=huginnruns/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=muninn.io,resources=huginnruns/finalizers,verbs=update
// +kubebuilder:rbac:groups=muninn.io,resources=huginnissues,verbs=get;list;watch
// +kubebuilder:rbac:groups=batch,resources=jobs,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=pods,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch

func (r *HuginnRunReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var run muninniov1beta1.HuginnRun
	if err := r.Get(ctx, req.NamespacedName, &run); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// 삭제 중이면 cascade GC 에 맡긴다(MVP, finalizer 비활성; operator-design §3).
	if !run.DeletionTimestamp.IsZero() {
		return ctrl.Result{}, nil
	}

	base := run.DeepCopy()

	// 상속 caps 1회 복사(Operator 소유): issue.inheritedGuardrails → status.maxStep/maxCostUsd/maxTokens.
	// 가드는 maxStep 으로만 닫는다 — maxStep(=maxIterations, Minimum=1)은 복사 후 항상 ≥1 이라 정확히 1회만 실행된다.
	// (maxCostUsd/maxTokens 는 0 이 정당값이라 OR 가드로 쓰면 재실행됨.)
	if run.Status.MaxStep == 0 {
		var issue muninniov1beta1.HuginnIssue
		switch err := r.Get(ctx, client.ObjectKey{Namespace: run.Namespace, Name: run.Spec.IssueRef}, &issue); {
		case err == nil:
			run.Status.MaxStep = issue.Spec.InheritedGuardrails.MaxIterations
			run.Status.MaxCostUsd = issue.Spec.InheritedGuardrails.MaxCostUsd
			run.Status.MaxTokens = issue.Spec.InheritedGuardrails.MaxTokens
		case apierrors.IsNotFound(err):
			// 부모 Issue 가 이미 사라짐(cascade GC 중일 수 있음) — caps 복사 불가.
			// MaxStep 을 sentinel(1, CRD Minimum=1)로 닫아, 매 reconcile 마다 Issue
			// 재조회·로그가 반복되지 않게 한다(가드는 MaxStep 으로만 닫힌다; 위 주석 참고).
			log.Info("부모 Issue 없음 — 상속 caps 미복사, MaxStep=1 로 고정", "issue", run.Spec.IssueRef)
			run.Status.MaxStep = 1
		default:
			// transient API 에러: caps 미복사 상태로 Job 을 만들지 않도록 requeue 한다(§2.2).
			return ctrl.Result{}, err
		}
	}

	// 취소 경로(operator-design §2.3): suspend=true 면 Job 삭제 + phase=Cancelled.
	if run.Spec.Suspend && !isRunTerminal(run.Status.Phase) {
		if err := r.deleteJob(ctx, &run); err != nil {
			return ctrl.Result{}, err
		}
		r.markFinished(&run, muninniov1beta1.RunCancelled)
		setRunCondition(&run, "Cancelled", metav1.ConditionTrue, "Suspended", "spec.suspend=true 로 취소됨")
		return r.patchStatus(ctx, base, &run)
	}

	// Job 보장(없으면 생성).
	var job batchv1.Job
	jobName := run.Name
	err := r.Get(ctx, client.ObjectKey{Namespace: run.Namespace, Name: jobName}, &job)
	switch {
	case apierrors.IsNotFound(err):
		if isRunTerminal(run.Status.Phase) {
			// 이미 종료된 Run 의 Job 이 TTL 로 사라진 경우 — 재생성하지 않는다.
			return ctrl.Result{}, nil
		}
		if err := r.createJob(ctx, &run); err != nil {
			return ctrl.Result{}, err
		}
		log.Info("Job 생성", "job", jobName)
		run.Status.JobName = jobName
		if run.Status.Phase == "" {
			run.Status.Phase = muninniov1beta1.RunQueued
		}
		setRunCondition(&run, "JobCreated", metav1.ConditionTrue, "Created", "에이전트 Job 생성됨")
		return r.patchStatus(ctx, base, &run)
	case err != nil:
		return ctrl.Result{}, err
	}

	// Job 상태 → Run.phase 매핑(operator-design §6).
	r.mapJobToRunStatus(&run, &job)
	return r.patchStatus(ctx, base, &run)
}

// mapJobToRunStatus 는 관찰한 Job 상태를 Run.status(Operator 소유 필드)로 반영한다.
func (r *HuginnRunReconciler) mapJobToRunStatus(run *muninniov1beta1.HuginnRun, job *batchv1.Job) {
	run.Status.JobName = job.Name
	if run.Status.StartedAt == nil && job.Status.StartTime != nil {
		run.Status.StartedAt = job.Status.StartTime
	}

	switch {
	case jobConditionTrue(job, batchv1.JobComplete):
		r.markFinished(run, muninniov1beta1.RunSucceeded)
		setRunCondition(run, "Succeeded", metav1.ConditionTrue, "JobComplete", "에이전트 실행 완료")
	case jobConditionTrue(job, batchv1.JobFailed):
		r.markFinished(run, muninniov1beta1.RunFailed)
		setRunCondition(run, "Failed", metav1.ConditionTrue, jobFailureReason(job), "에이전트 Job 실패")
	default:
		// 활성 상태. AwaitingApproval(API 소유)은 보존한다(§2.2).
		if run.Status.Phase == muninniov1beta1.RunAwaitingApproval {
			return
		}
		if (job.Status.Ready != nil && *job.Status.Ready > 0) || job.Status.Active > 0 {
			run.Status.Phase = muninniov1beta1.RunRunning
			setRunCondition(run, "Running", metav1.ConditionTrue, "AgentRunning", "에이전트 실행 중")
		} else {
			run.Status.Phase = muninniov1beta1.RunPending
			setRunCondition(run, "Running", metav1.ConditionFalse, "PodPending", "Pod 시작 대기")
		}
	}
}

// markFinished 는 종료 phase 와 finishedAt/duration 을 설정한다(Operator 소유).
func (r *HuginnRunReconciler) markFinished(run *muninniov1beta1.HuginnRun, phase muninniov1beta1.RunPhase) {
	run.Status.Phase = phase
	if run.Status.FinishedAt == nil {
		now := metav1.Now()
		run.Status.FinishedAt = &now
		if run.Status.StartedAt != nil {
			run.Status.DurationSeconds = int64(now.Sub(run.Status.StartedAt.Time).Seconds())
		}
	}
}

// expandPodSpec 은 큐레이트된 JobTemplate 을 full corev1.PodSpec 으로 확장한다(고정 필드는 여기서 부여).
func expandPodSpec(jt muninniov1beta1.JobTemplate) corev1.PodSpec {
	command := jt.Command
	if len(command) == 0 {
		command = []string{agentSkillCmd}
	}
	sa := jt.ServiceAccountName
	if sa == "" {
		sa = serviceAccountName
	}
	resources := jt.Resources
	if len(resources.Requests) == 0 && len(resources.Limits) == 0 {
		resources = defaultAgentResources()
	}
	container := corev1.Container{
		Name:      agentContainerName,
		Image:     jt.Image,
		Command:   command,
		Resources: resources,
		Env:       jt.Env,
		// 컨테이너 하드닝: 권한 상승 차단 + 모든 capability 드롭(비-root 런타임).
		SecurityContext: &corev1.SecurityContext{
			AllowPrivilegeEscalation: ptr.To(false),
			Capabilities:             &corev1.Capabilities{Drop: []corev1.Capability{"ALL"}},
		},
	}
	var volumes []corev1.Volume
	if jt.ClaudePVCName != "" {
		container.VolumeMounts = []corev1.VolumeMount{{Name: claudeVolumeName, MountPath: claudeMountPath}}
		volumes = []corev1.Volume{{
			Name: claudeVolumeName,
			VolumeSource: corev1.VolumeSource{
				PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: jt.ClaudePVCName},
			},
		}}
	}
	return corev1.PodSpec{
		RestartPolicy:      corev1.RestartPolicyNever,
		ServiceAccountName: sa,
		Containers:         []corev1.Container{container},
		Volumes:            volumes,
		// 비-root 강제 + PVC(~/.claude) 를 node(uid 1000)가 쓰도록 fsGroup 지정. seccomp=RuntimeDefault.
		SecurityContext: &corev1.PodSecurityContext{
			RunAsNonRoot:   ptr.To(true),
			RunAsUser:      ptr.To(agentRunAsUser),
			RunAsGroup:     ptr.To(agentRunAsUser),
			FSGroup:        ptr.To(agentRunAsUser),
			SeccompProfile: &corev1.SeccompProfile{Type: corev1.SeccompProfileTypeRuntimeDefault},
		},
	}
}

// runScopedEnv 는 Run 확정 시점에만 알 수 있는 식별/모드 env 다(agent-runtime 의 보고·dry-run PR 용).
// buildJobTemplate(Issue 단위)에서는 Run 이름을 모르므로, Job 생성 시점에 여기서 덧붙인다.
// agent-runtime(runner.py)은 MUNINN_RUN_NAME 으로 자신의 Run 을 알고 MUNINN_API_ENDPOINT 에 보고한다.
func runScopedEnv(run *muninniov1beta1.HuginnRun) []corev1.EnvVar {
	prMode := os.Getenv("MUNINN_PR_MODE")
	if prMode == "" {
		prMode = "dry-run" // MVP: 실제 gh pr create 대신 diff/요약만 생성(설계 §8). 실 PR 은 후속.
	}
	return []corev1.EnvVar{
		{Name: "MUNINN_RUN_NAME", Value: run.Name},
		{Name: "MUNINN_ISSUE_NAME", Value: run.Spec.IssueRef},
		{Name: "MUNINN_AGENT_NAME", Value: run.Labels[LabelAgent]}, // 앱(HuginnAgent) — 메모리 scope
		{Name: "MUNINN_NAMESPACE", Value: run.Namespace},
		{Name: "MUNINN_ATTEMPT", Value: fmt.Sprintf("%d", run.Spec.Attempt)},
		{Name: "MUNINN_PR_MODE", Value: prMode},
	}
}

func (r *HuginnRunReconciler) createJob(ctx context.Context, run *muninniov1beta1.HuginnRun) error {
	podSpec := expandPodSpec(run.Spec.JobTemplate)
	// Run 단위 식별/모드 env 주입(보고·dry-run). 컨테이너는 항상 1개(expandPodSpec).
	if len(podSpec.Containers) > 0 {
		podSpec.Containers[0].Env = append(podSpec.Containers[0].Env, runScopedEnv(run)...)
	}
	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      run.Name,
			Namespace: run.Namespace,
			Labels:    childLabels(run.Labels),
		},
		Spec: batchv1.JobSpec{
			// backoffLimit=0: Pod-level 재시도 비활성. 재시도는 Issue 이 새 attempt Run 으로 수행(§2.1).
			BackoffLimit:            ptr.To[int32](0),
			ActiveDeadlineSeconds:   nonZero(run.Spec.TimeoutSeconds),
			TTLSecondsAfterFinished: ptr.To(run.Spec.TTLSecondsAfterFinished),
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: childLabels(run.Labels)},
				Spec:       podSpec,
			},
		},
	}
	if err := controllerutil.SetControllerReference(run, job, r.Scheme); err != nil {
		return err
	}
	return r.Create(ctx, job)
}

func (r *HuginnRunReconciler) deleteJob(ctx context.Context, run *muninniov1beta1.HuginnRun) error {
	var job batchv1.Job
	if err := r.Get(ctx, client.ObjectKey{Namespace: run.Namespace, Name: run.Name}, &job); err != nil {
		return client.IgnoreNotFound(err)
	}
	policy := metav1.DeletePropagationBackground
	return client.IgnoreNotFound(r.Delete(ctx, &job, &client.DeleteOptions{PropagationPolicy: &policy}))
}

// patchStatus 는 Operator 소유 필드만 MergeFrom 패치로 반영한다 → Agent→API 소유 필드 보존(§2.2).
func (r *HuginnRunReconciler) patchStatus(ctx context.Context, base, run *muninniov1beta1.HuginnRun) (ctrl.Result, error) {
	if err := r.Status().Patch(ctx, run, client.MergeFrom(base)); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, nil
}

func isRunTerminal(p muninniov1beta1.RunPhase) bool {
	return p == muninniov1beta1.RunSucceeded || p == muninniov1beta1.RunFailed || p == muninniov1beta1.RunCancelled
}

func jobConditionTrue(job *batchv1.Job, t batchv1.JobConditionType) bool {
	for _, c := range job.Status.Conditions {
		if c.Type == t && c.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

func jobFailureReason(job *batchv1.Job) string {
	for _, c := range job.Status.Conditions {
		if c.Type == batchv1.JobFailed && c.Status == corev1.ConditionTrue && c.Reason != "" {
			return c.Reason
		}
	}
	return "JobFailed"
}

func setRunCondition(run *muninniov1beta1.HuginnRun, condType string, status metav1.ConditionStatus, reason, msg string) {
	apimeta.SetStatusCondition(&run.Status.Conditions, metav1.Condition{
		Type:               condType,
		Status:             status,
		Reason:             reason,
		Message:            msg,
		ObservedGeneration: run.Generation,
	})
}

// childLabels 는 부모 라벨 중 식별 라벨만 자식에 전파한다.
func childLabels(in map[string]string) map[string]string {
	out := map[string]string{}
	for _, k := range []string{LabelWorkspace, LabelAgent, LabelIssue, LabelFingerprint} {
		if v, ok := in[k]; ok {
			out[k] = v
		}
	}
	return out
}

func nonZero(v int64) *int64 {
	if v <= 0 {
		return nil
	}
	return ptr.To(v)
}

// SetupWithManager sets up the controller with the Manager.
func (r *HuginnRunReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&muninniov1beta1.HuginnRun{}).
		Owns(&batchv1.Job{}).
		Named("huginnrun").
		Complete(r)
}
