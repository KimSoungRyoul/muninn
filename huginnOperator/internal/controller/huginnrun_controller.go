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
	"path"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	apimeta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
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
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
}

// recordEvent 는 Recorder 가 배선됐을 때만 K8s Event 를 발행한다(테스트에서 nil 허용).
func (r *HuginnRunReconciler) recordEvent(run *muninniov1beta1.HuginnRun, eventType, reason, msg string) {
	if r.Recorder != nil {
		r.Recorder.Event(run, eventType, reason, msg)
	}
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

	// 취소 경로(operator-design §2.3): suspend=true 면 Job 삭제 + phase=Cancelled.
	// 취소는 실행 중 부작용을 멈추는 안전장치이므로 caps 복사/Job 보장보다 먼저 처리한다 —
	// 거절(reject)이 spec.suspend=true 를 패치했는데 Issue Get(caps) 이 transient 에러로 막혀
	// 취소 전파가 지연되는 일을 피한다(리뷰 LOW).
	if run.Spec.Suspend && !isRunTerminal(run.Status.Phase) {
		if err := r.deleteJob(ctx, &run); err != nil {
			return ctrl.Result{}, err
		}
		r.markFinished(&run, muninniov1beta1.RunCancelled)
		setRunCondition(&run, "Cancelled", metav1.ConditionTrue, "Suspended", "spec.suspend=true 로 취소됨")
		r.recordEvent(&run, corev1.EventTypeNormal, "Cancelled", "spec.suspend=true 로 취소됨")
		return r.patchStatus(ctx, base, &run)
	}

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
			// 부모 Issue 가 없음(cascade GC 중인 고아 Run). caps 도 회계 의미도 없고,
			// 이 시점에 Job 을 만들면 곧 GC 될 Run 에 비멱등 에이전트 실행을 잠깐이라도 띄운다(리뷰 LOW).
			// → sentinel(MaxStep=1) 로 가드만 닫지 않고, Job 미생성 상태에서 즉시 Failed 로 종료한다.
			log.Info("부모 Issue 없음 — Job 미생성, Run 을 Failed 로 종료", "issue", run.Spec.IssueRef)
			r.markFinished(&run, muninniov1beta1.RunFailed)
			setRunCondition(&run, "Failed", metav1.ConditionTrue, "IssueNotFound",
				fmt.Sprintf("부모 Issue %q 없음 — 실행하지 않음", run.Spec.IssueRef))
			r.recordEvent(&run, corev1.EventTypeWarning, "IssueNotFound",
				fmt.Sprintf("부모 Issue %q 없음 — Run 종료", run.Spec.IssueRef))
			return r.patchStatus(ctx, base, &run)
		default:
			// transient API 에러: caps 미복사 상태로 Job 을 만들지 않도록 requeue 한다(§2.2).
			return ctrl.Result{}, err
		}
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
		// 비터미널 Run 인데 Job 이 없다 — 두 경우를 구분한다(리뷰 HIGH):
		//   (1) status.jobName != "" → 한 번 만들었던 Job 이 사라짐(운영자 delete/TTL 만료 중 operator 다운 등).
		//       에이전트 실행은 non-idempotent(핵심 계약 #2)이므로 같은 attempt 를 절대 재실행하지 않는다.
		//       Failed(reason=JobLost) 로 종료시켜 Issue 컨트롤러의 정규 재시도(새 attempt, maxRuns/backoff)로 넘긴다.
		//   (2) status.jobName == "" → 최초 생성. 이 분기만 createJob 한다('Run=정확히 1 attempt=Job 1개' 불변식).
		if run.Status.JobName != "" {
			// 결과 불확정 구분(리뷰 LOW): 에이전트가 이미 종료 신호를 보고했는데(status.output 채워짐)
			// Job 이 사라졌다면, 이는 '실패해서 Job 이 죽은 것'이 아니라 'Job 이 Complete 된 뒤
			// TTL 정리되었고 그사이 operator 가 다운'된 정황일 수 있다. 비멱등 계약상 재실행은
			// 여전히 금지(Failed 로 닫아 Issue 의 정규 재시도로 넘김)하되, 운영자가 Issue outcome 으로
			// 성공/실패를 구분할 수 있도록 condition message 에 '결과 불확정' 과 보고값을 명시한다.
			reported := run.Status.Output != ""
			msg := fmt.Sprintf("Job %q 가 사라짐 — 비멱등 재실행 금지, Issue 가 새 attempt 로 재시도", run.Status.JobName)
			if reported {
				msg = fmt.Sprintf("Job %q 가 사라짐 — 에이전트가 이미 결과(output=%q)를 보고함. "+
					"결과 불확정(TTL 정리 후 성공 Job 일 가능성); 비멱등 재실행 금지, Issue outcome 으로 판정",
					run.Status.JobName, run.Status.Output)
			}
			log.Info("Job 소실 감지(비터미널 Run) — 재생성하지 않고 Failed 로 종료",
				"job", run.Status.JobName, "agentReported", reported)
			r.markFinished(&run, muninniov1beta1.RunFailed)
			setRunCondition(&run, "Failed", metav1.ConditionTrue, "JobLost", msg)
			r.recordEvent(&run, corev1.EventTypeWarning, "JobLost", msg)
			return r.patchStatus(ctx, base, &run)
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
		r.recordEvent(&run, corev1.EventTypeNormal, "JobCreated", fmt.Sprintf("에이전트 Job %q 생성됨", jobName))
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
		// 활성 상태. AwaitingApproval(API 소유 전이)은 보존한다(§2.2) — 단, 승인 완료는 예외.
		if run.Status.Phase == muninniov1beta1.RunAwaitingApproval {
			// 승인 후 phase 복귀(리뷰 MEDIUM): web 의 approve 경로(incidents.ts approveRun)는
			// status.approval.state=Approved 만 패치하고 phase 는 건드리지 않는다. Job 이 아직
			// 살아 있으면(에이전트가 승인 후 작업 계속) operator 가 Running 으로 복귀시켜야
			// 콘솔/집계가 AwaitingApproval 에 고착되지 않는다(§2.2 보존 가드의 명시적 예외).
			if run.Status.Approval != nil && run.Status.Approval.State == muninniov1beta1.ApprovalApproved {
				run.Status.Phase = muninniov1beta1.RunRunning
				setRunCondition(run, "Running", metav1.ConditionTrue, "Approved", "승인됨 — 실행 재개")
				r.recordEvent(run, corev1.EventTypeNormal, "Approved", "운영자 승인 — phase 를 Running 으로 복귀")
				return
			}
			// 아직 미승인(Pending) — API 소유 전이 존중, 보존만 한다.
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
		// 컨테이너 하드닝: 권한 상승 차단 + 모든 capability 드롭(비-root 런타임) + seccomp(컨테이너 레벨도
		// 명시 — pod 레벨에 이미 있으나 PSS restricted 정합·명시성). readOnlyRootFilesystem 은 runner 가
		// $HOME/.npm·.config·/tmp 등에 쓰므로 emptyDir 커버리지(2단계 롤아웃) 확정 후 별도 적용(§6.2-6 잔여).
		SecurityContext: &corev1.SecurityContext{
			AllowPrivilegeEscalation: ptr.To(false),
			Capabilities:             &corev1.Capabilities{Drop: []corev1.Capability{"ALL"}},
			SeccompProfile:           &corev1.SeccompProfile{Type: corev1.SeccompProfileTypeRuntimeDefault},
		},
	}
	// 에이전트 홈 마운트 경로(§2.4): JobTemplate.MountPath(runtime별)를 쓰고, 비면 claude-code 기본 폴백(하위호환).
	mountPath := jt.MountPath
	if mountPath == "" {
		mountPath = claudeMountPath
	}
	var volumes []corev1.Volume
	var initContainers []corev1.Container
	if jt.AgentPVCName != "" {
		// SubPath(=Issue 이름, buildJobTemplate)로 앱 PVC 안 Issue별 하위 경로를 에이전트 홈으로 마운트한다(§5.5).
		// 비면(레거시 JobTemplate) PVC 루트를 마운트 — 기존 동작 보존.
		container.VolumeMounts = []corev1.VolumeMount{{
			Name: agentVolumeName, MountPath: mountPath, SubPath: jt.AgentSubPath,
		}}
		volumes = []corev1.Volume{{
			Name: agentVolumeName,
			VolumeSource: corev1.VolumeSource{
				PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: jt.AgentPVCName},
			},
		}}
		// subPath 디렉토리는 kubelet 이 pod 마운트 시 생성하는데, fsGroup chown(볼륨 attach 1회) 이후라
		// root:root 0755 로 만들어질 수 있다(k8s subPath+fsGroup gap). 그러면 비-root(uid 1000) 런타임이
		// ~/.claude 하위에 transcript/settings 를 못 써 resume 이 조용히 깨진다(리뷰 R1). initContainer 가
		// PVC 루트(여기는 fsGroup 으로 그룹쓰기 가능)를 마운트해 subPath 디렉토리를 미리 만들어 소유권을
		// uid/fsGroup 1000 으로 잡는다 → main 컨테이너의 subPath 마운트가 쓰기 가능해진다. 비-root 하드닝과
		// 정합(pod SecurityContext 의 RunAsUser/fsGroup 1000 이 init 에도 적용; root 승격 없음). 멱등(mkdir -p).
		if jt.AgentSubPath != "" {
			initContainers = []corev1.Container{{
				Name:    agentHomeInitContainerName,
				Image:   jt.Image,
				Command: []string{"sh", "-c", `mkdir -p "$AGENT_HOME_DIR"`},
				Env: []corev1.EnvVar{{
					Name: "AGENT_HOME_DIR", Value: path.Join(agentStoreInitPath, jt.AgentSubPath),
				}},
				VolumeMounts: []corev1.VolumeMount{{Name: agentVolumeName, MountPath: agentStoreInitPath}},
				// 작은 명시 요청/제한(리뷰 R2): requests 가 없으면 LimitRange-strict 네임스페이스가 pod 를
				// 거부하거나 init 단계 QoS 가 BestEffort 가 된다. mkdir 한 번이라 최소값으로 충분.
				Resources: initContainerResources(),
				SecurityContext: &corev1.SecurityContext{
					AllowPrivilegeEscalation: ptr.To(false),
					Capabilities:             &corev1.Capabilities{Drop: []corev1.Capability{"ALL"}},
				},
			}}
		}
	}
	return corev1.PodSpec{
		RestartPolicy:      corev1.RestartPolicyNever,
		ServiceAccountName: sa,
		InitContainers:     initContainers,
		Containers:         []corev1.Container{container},
		Volumes:            volumes,
		// 격리 baseline(§6.2-5): SA 토큰 자동마운트를 끈 fail-closed 상태. huginn-agent SA 에는 최소권한
		// Role(pods/log·deployments read, secrets 제외)이 바인딩돼 있으나(ensureAgentRBAC), 도구 루프(kubectl_ro)가
		// 아직 없는 text-only 단계에선 토큰을 마운트할 이유가 없고, 마운트하면 prompt-injection 시 그 Role 권한이
		// 노출되는 공격 표면이 된다(docs/review SECURITY HIGH). 도구 루프 도입 시 토큰 자동마운트를 runtime 별로
		// 재개방하거나 KUBECONFIG Secret 마운트로 전환한다 — Role 인프라는 ensureAgentRBAC 로 이미 준비돼 있다.
		AutomountServiceAccountToken: ptr.To(false),
		// SIGTERM(축출/타임아웃) 시 runner.py 가 terminal 보고(final/failed/terminalKind)를 보낼 예산을
		// 확보한다. runner 의 SIGTERM 보고 예산(기본 ~20s) + 여유 → 60s. K8s 기본 30s 는 API 지연 시
		// terminal 보고가 SIGKILL 로 잘려 incident 가 'running' 으로 고착될 수 있다(리뷰 MEDIUM).
		TerminationGracePeriodSeconds: ptr.To(int64(60)),
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
	// MUNINN_WORKSPACE: 멀티테넌시 경계(CONTRACT §C3, "workspace = namespace 단일 진실원천").
	// runner.py 가 메모리 store/recall 페이로드에 workspace 로 동봉해 테넌트 간 기억 누수를 막는다.
	// 격리 경계의 단일 진실원천은 run.Namespace 다 — webhook off 환경(run-kind 등 defaulter 미동작)에서도
	// 라벨 누락/변조에 무관하게 namespace 로 격리가 닫히도록 namespace 를 우선한다.
	// muninn.io/workspace 라벨은 selector 보조일 뿐이며, namespace 가 빈 비정상 경로에서만 폴백한다.
	workspace := run.Namespace
	if workspace == "" {
		workspace = run.Labels[LabelWorkspace]
	}
	return []corev1.EnvVar{
		{Name: "MUNINN_RUN_NAME", Value: run.Name},
		{Name: "MUNINN_ISSUE_NAME", Value: run.Spec.IssueRef},
		{Name: "MUNINN_AGENT_NAME", Value: run.Labels[LabelAgent]}, // 앱(HuginnAgent) — 메모리 scope
		{Name: "MUNINN_NAMESPACE", Value: run.Namespace},
		{Name: "MUNINN_WORKSPACE", Value: workspace},
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
	// AlreadyExists 흡수(리뷰 LOW): status 패치 실패 후 재조회 시 캐시에 Job 이 아직 안 보여
	// NotFound→createJob 으로 들어와도, 결정적 이름 덕에 같은 Job 이라 에러 requeue 없이 넘긴다
	// (Issue 컨트롤러 createRun 과 동일 패턴으로 통일).
	if err := r.Create(ctx, job); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

func (r *HuginnRunReconciler) deleteJob(ctx context.Context, run *muninniov1beta1.HuginnRun) error {
	var job batchv1.Job
	if err := r.Get(ctx, client.ObjectKey{Namespace: run.Namespace, Name: run.Name}, &job); err != nil {
		return client.IgnoreNotFound(err)
	}
	policy := metav1.DeletePropagationBackground
	return client.IgnoreNotFound(r.Delete(ctx, &job, &client.DeleteOptions{PropagationPolicy: &policy}))
}

// patchStatus 는 Operator 소유 필드만 merge-patch 로 반영한다 → Agent→API 소유 필드 보존(§2.2).
// optimistic lock(리뷰 HIGH): base(reconcile 시작 시 캐시 스냅샷)가 stale 이면 409 conflict 로
// 거부되어 requeue 된다. 이로써 API 가 직전에 쓴 phase=AwaitingApproval 등을 stale 캐시 기반
// Pending→Running 계산이 역전시키는 race 를 막는다(신선한 캐시로 재판정).
func (r *HuginnRunReconciler) patchStatus(ctx context.Context, base, run *muninniov1beta1.HuginnRun) (ctrl.Result, error) {
	if err := r.Status().Patch(ctx, run, client.MergeFromWithOptions(base,
		client.MergeFromWithOptimisticLock{})); err != nil {
		if apierrors.IsConflict(err) {
			// 다른 writer(API/Agent)가 그사이 status 를 갱신 — 충돌은 정상 동작이므로 조용히 requeue.
			return ctrl.Result{Requeue: true}, nil
		}
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
