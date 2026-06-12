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

package v1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// HuginnRun 은 세션 내부의 실제 에이전트 실행 1회를 표현한다(설계서 §3.3).
// Operator 가 이 CR 에 대응하는 K8s Job(→ Pod)을 backoffLimit=0 으로 만든다.
// 재시도는 Job 이 아니라 Issue controller 가 새 attempt Run 을 만들어 수행한다(operator-design §2.1).

// JobTemplate 은 에이전트 Pod 의 실행 recipe(큐레이트된 필드 서브셋).
// Issue controller 가 Agent+Issue 컨텍스트로 채우고, Run controller 가 full corev1.PodSpec 으로 확장한다.
// full PodSpec 을 임베드하지 않는 이유: CRD OpenAPI 스키마가 ~590KB 로 폭증해 client-side apply
// 256KB 어노테이션 한도를 넘기 때문(슬림화로 ~30KB). 고정 필드(restartPolicy/volumeMount/containerName)는
// Run controller 가 부여한다.
type JobTemplate struct {
	// image: 에이전트 런타임 컨테이너 이미지(HuginnAgent.spec.agent.image)
	// +kubebuilder:validation:MinLength=1
	Image string `json:"image"`
	// command: 엔트리포인트(비면 기본 ["/usr/local/bin/claude_skill.sh"])
	// +optional
	Command []string `json:"command,omitempty"`
	// env: 주입 컨텍스트 + 인증(secretKeyRef). Issue 생성 시점 스냅샷(§5.1).
	// +optional
	Env []corev1.EnvVar `json:"env,omitempty"`
	// resources: 컨테이너 리소스(비면 Run controller 가 §5.1 기본값 부여)
	// +optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
	// serviceAccountName: 비면 기본 huginn-agent(§6.1)
	// +optional
	ServiceAccountName string `json:"serviceAccountName,omitempty"`
	// claudePVCName: ~/.claude 로 마운트할 앱별 PVC(§5.5). 비면 볼륨 미마운트.
	// +optional
	ClaudePVCName string `json:"claudePVCName,omitempty"`
}

// HuginnRunSpec defines the desired state of HuginnRun.
// 생성 후 불변(non-idempotent 실행 계약, 핵심 계약 #2): issueRef/attempt/jobTemplate 는
// Job 생성 후 갱신해도 Pod 에 반영되지 않으므로(controller 는 Job 을 갱신하지 않음) CEL 로 immutable 강제한다.
type HuginnRunSpec struct {
	// issueRef: 부모 HuginnIssue 의 metadata.name
	// +kubebuilder:validation:MinLength=1
	// +kubebuilder:validation:XValidation:rule="self == oldSelf",message="issueRef is immutable"
	IssueRef string `json:"issueRef"`
	// attempt: 1부터. 재시도 시 새 Run(attempt N+1)으로 증가.
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:XValidation:rule="self == oldSelf",message="attempt is immutable"
	Attempt int32 `json:"attempt"`

	// timeoutSeconds → Job.spec.activeDeadlineSeconds (기본 3600)
	// +kubebuilder:default=3600
	// +kubebuilder:validation:Minimum=1
	// +optional
	TimeoutSeconds int64 `json:"timeoutSeconds,omitempty"`
	// ttlSecondsAfterFinished → Job.spec.ttlSecondsAfterFinished (기본 86400)
	// +kubebuilder:default=86400
	// +kubebuilder:validation:Minimum=0
	// +optional
	TTLSecondsAfterFinished int32 `json:"ttlSecondsAfterFinished,omitempty"`

	// jobTemplate: Pod 실행 recipe. Job 생성 후 불변(갱신해도 Pod 미반영; 위 주석 참고).
	// +kubebuilder:validation:XValidation:rule="self == oldSelf",message="jobTemplate is immutable"
	JobTemplate JobTemplate `json:"jobTemplate"`

	// suspend: true 면 Operator 가 Job 을 삭제하고 phase=Cancelled 로 전이(operator-design §2.3).
	// 승인 거절/사용자 취소 시 Muninn API 가 set 한다.
	// +optional
	Suspend bool `json:"suspend,omitempty"`
}

// RunPhase 는 Run 의 실행 상태(§3.4).
// +kubebuilder:validation:Enum=Queued;Pending;Running;AwaitingApproval;Succeeded;Failed;Cancelled
type RunPhase string

const (
	RunQueued           RunPhase = "Queued"
	RunPending          RunPhase = "Pending"
	RunRunning          RunPhase = "Running"
	RunAwaitingApproval RunPhase = "AwaitingApproval"
	RunSucceeded        RunPhase = "Succeeded"
	RunFailed           RunPhase = "Failed"
	RunCancelled        RunPhase = "Cancelled"
)

// RecalledMemory 는 회상된 기억 단편(§5.6). Muninn API 가 recall-report 로 갱신.
type RecalledMemory struct {
	ID string `json:"id"`
	// score: 0~1 정규화 점수(decimal 문자열로 표기해 CRD float 모호성 회피)
	// +optional
	Score string `json:"score,omitempty"`
	// +optional
	Reason string `json:"reason,omitempty"`
}

// ApprovalReason 은 승인 필요 사유 1건(§6.4).
type ApprovalReason struct {
	Type string `json:"type"`
	// +optional
	Detail string `json:"detail,omitempty"`
}

// ApprovalState 는 승인 결정 상태.
// +kubebuilder:validation:Enum=Pending;Approved;Rejected;Expired
type ApprovalState string

const (
	ApprovalPending  ApprovalState = "Pending"
	ApprovalApproved ApprovalState = "Approved"
	ApprovalRejected ApprovalState = "Rejected"
	ApprovalExpired  ApprovalState = "Expired"
)

// ApprovalStatus 는 Human-in-the-loop 승인 메타(§6.4). Muninn API 소유.
type ApprovalStatus struct {
	// +optional
	Reasons []ApprovalReason `json:"reasons,omitempty"`
	// +optional
	State ApprovalState `json:"state,omitempty"`
	// +optional
	RequestedAt *metav1.Time `json:"requestedAt,omitempty"`
	// +optional
	ExpiresAt *metav1.Time `json:"expiresAt,omitempty"`
	// +optional
	DecidedBy string `json:"decidedBy,omitempty"`
	// decidedAt: 승인/거절 결정 시각(ISO8601). Muninn API(approve/reject route)가 기록(§6.4).
	// +optional
	DecidedAt *metav1.Time `json:"decidedAt,omitempty"`
	// reason: 거절 사유(reject 시). Muninn API 가 기록(§6.4).
	// +optional
	Reason string `json:"reason,omitempty"`
}

// HuginnRunStatus defines the observed state of HuginnRun.
// 필드 소유권(operator-design §2.2): Operator = phase/startedAt/finishedAt/duration/jobName/caps/conditions,
// Agent→API = step/cost/tokens/recalledMemoryIds/output, API = AwaitingApproval 전이/approval.
type HuginnRunStatus struct {
	// +optional
	Phase RunPhase `json:"phase,omitempty"`

	// --- Agent→API 소유(실행 진행 메트릭). Operator 는 절대 덮어쓰지 않음 ---
	// +optional
	Step int32 `json:"step,omitempty"`
	// +optional
	Cost string `json:"cost,omitempty"` // decimal USD 문자열(예: "0.18")
	// +optional
	Tokens int64 `json:"tokens,omitempty"`
	// +optional
	RecalledMemoryIDs []RecalledMemory `json:"recalledMemoryIds,omitempty"`
	// +optional
	Output string `json:"output,omitempty"`

	// --- Operator 소유(생성 시 세션 상속 복사 / lifecycle) ---
	// +optional
	MaxStep int32 `json:"maxStep,omitempty"`
	// +optional
	MaxCostUsd int32 `json:"maxCostUsd,omitempty"`
	// +optional
	MaxTokens int64 `json:"maxTokens,omitempty"`
	// jobName: Operator 가 만든 Job 이름
	// +optional
	JobName string `json:"jobName,omitempty"`
	// +optional
	StartedAt *metav1.Time `json:"startedAt,omitempty"`
	// +optional
	FinishedAt *metav1.Time `json:"finishedAt,omitempty"`
	// +optional
	DurationSeconds int64 `json:"durationSeconds,omitempty"`

	// --- API 소유 ---
	// +optional
	Approval *ApprovalStatus `json:"approval,omitempty"`

	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:storageversion
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=hrun
// +kubebuilder:printcolumn:name="Issue",type=string,JSONPath=`.spec.issueRef`
// +kubebuilder:printcolumn:name="Attempt",type=integer,JSONPath=`.spec.attempt`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Step",type=integer,JSONPath=`.status.step`
// +kubebuilder:printcolumn:name="Cost",type=string,JSONPath=`.status.cost`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// HuginnRun is the Schema for the huginnruns API
type HuginnRun struct {
	metav1.TypeMeta `json:",inline"`
	// +optional
	metav1.ObjectMeta `json:"metadata,omitempty"`

	// +required
	Spec HuginnRunSpec `json:"spec"`
	// +optional
	Status HuginnRunStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// HuginnRunList contains a list of HuginnRun
type HuginnRunList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []HuginnRun `json:"items"`
}

func init() {
	SchemeBuilder.Register(&HuginnRun{}, &HuginnRunList{})
}
