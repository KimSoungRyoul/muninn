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

package v1beta1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// HuginnIssue 은 이벤트 페이로드 1건을 표현한다(설계서 §3.2).
// Muninn API(Gateway)가 dedup 통과 후 K8s API 에 생성하고, Operator 의 watch 가 감지한다(§2.2).

// EventSource 는 트리거 출처.
// +kubebuilder:validation:Enum=grafana;airflow;argocd;manual
type EventSource string

// NormalizedEvent 는 Muninn 표준형 이벤트(§4.3). 원본은 payloadSecretRef Secret 에 보존.
type NormalizedEvent struct {
	ID          string      `json:"id"`
	Source      EventSource `json:"source"`
	Severity    Severity    `json:"severity"`
	Fingerprint string      `json:"fingerprint"`
	// +optional
	Title string `json:"title,omitempty"`
	// +optional
	ReceivedAt *metav1.Time `json:"receivedAt,omitempty"`
	// payloadSecretRef: 원본 alert JSON(민감정보 가능) Secret 이름
	// +optional
	PayloadSecretRef string `json:"payloadSecretRef,omitempty"`
	// payload: 정규화 요약(키-값)
	// +optional
	Payload map[string]string `json:"payload,omitempty"`
}

// InheritedGuardrails 는 HuginnAgent.spec.guardrails 에서 복사한 한도 스냅샷.
// Muninn API/Gateway 가 Issue 생성 시 채운다(operator 는 Issue 을 만들지 않음).
type InheritedGuardrails struct {
	// +kubebuilder:validation:Minimum=1
	MaxIterations int32 `json:"maxIterations"`
	// +kubebuilder:validation:Minimum=0
	MaxCostUsd int32 `json:"maxCostUsd"`
	// maxTokens: 토큰 예산 상한(0=무제한). Operator 가 Run.status.maxTokens 로 복사.
	// +kubebuilder:validation:Minimum=0
	// +optional
	MaxTokens int64 `json:"maxTokens,omitempty"`
}

// BackoffPolicy 는 재시도 간 대기 증가 방식(operator-design §2.1: Issue controller 가 RequeueAfter 로 구현).
// +kubebuilder:validation:Enum=exponential;linear;none
type BackoffPolicy string

// RetryPolicy 는 세션의 재시도 정책.
type RetryPolicy struct {
	// maxRuns: 세션이 만들 수 있는 Run 총개수 상한(operator-design §2.1).
	// Job backoffLimit 이 아니라 attempt 별 HuginnRun 생성 상한이다.
	// +kubebuilder:default=3
	// +kubebuilder:validation:Minimum=1
	MaxRuns int32 `json:"maxRuns"`
	// +kubebuilder:default=exponential
	// +optional
	Backoff BackoffPolicy `json:"backoff,omitempty"`
}

// HuginnIssueSpec defines the desired state of HuginnIssue.
type HuginnIssueSpec struct {
	// agentRef: 부모 HuginnAgent 의 metadata.name(도메인상 "Application").
	// +kubebuilder:validation:MinLength=1
	AgentRef string `json:"agentRef"`

	// event: 정규화된 이벤트 페이로드(§4.3)
	Event NormalizedEvent `json:"event"`

	// goal: event 단위 불변 컨텍스트(§8.6)
	Goal string `json:"goal"`

	// issuingUser: manual(대화형/CopilotKit) 트리거로 이슈를 개시한 운영자(감사용).
	// webhook(grafana/airflow/argocd) 출처면 비운다.
	// +optional
	IssuingUser string `json:"issuingUser,omitempty"`
	// userPrompt: manual 트리거의 원본 운영자 프롬프트(감사·재실행). webhook 이면 비운다.
	// +optional
	UserPrompt string `json:"userPrompt,omitempty"`
	// recalledMemoryIds: 위임 직전 Muninn API 가 회상한 기억 id(감사 추적 + 에이전트 seed).
	// 설계 §3.1/§7 — 회상한 근거 기억을 이슈에 동봉한다.
	// +optional
	RecalledMemoryIds []string `json:"recalledMemoryIds,omitempty"`

	// inheritedGuardrails: HuginnAgent.spec.guardrails 에서 복사(§3.2)
	InheritedGuardrails InheritedGuardrails `json:"inheritedGuardrails"`
	// inheritedBindings: HuginnAgent.spec.bindings 스냅샷
	// +optional
	InheritedBindings *Bindings `json:"inheritedBindings,omitempty"`
	// identity: HuginnAgent 에서 복사
	Identity Identity `json:"identity"`

	// retryPolicy: 재시도 상한/백오프
	// +optional
	RetryPolicy RetryPolicy `json:"retryPolicy,omitempty"`

	// suspend: true 면 Operator 가 활성 Run 들을 취소시킨다(operator-design §2.3)
	// +optional
	Suspend bool `json:"suspend,omitempty"`
}

// IssuePhase 는 세션 거시 상태(§3.4). Run 들의 phase 집계로 산출.
// +kubebuilder:validation:Enum=Pending;Running;AwaitingApproval;Succeeded;Failed;Cancelled
type IssuePhase string

const (
	IssuePending          IssuePhase = "Pending"
	IssueRunning          IssuePhase = "Running"
	IssueAwaitingApproval IssuePhase = "AwaitingApproval"
	IssueSucceeded        IssuePhase = "Succeeded"
	IssueFailed           IssuePhase = "Failed"
	IssueCancelled        IssuePhase = "Cancelled"
)

// HuginnIssueStatus defines the observed state of HuginnIssue.
type HuginnIssueStatus struct {
	// +optional
	Phase IssuePhase `json:"phase,omitempty"`
	// runRefs: 생성된 HuginnRun 이름들(attempt 순)
	// +optional
	RunRefs []string `json:"runRefs,omitempty"`
	// dedupCount: 같은 fingerprint 누적(§4.4). Muninn API 가 갱신.
	// +optional
	DedupCount int32 `json:"dedupCount,omitempty"`
	// outcome: 완료 시 "PR #842" / "Issue #143". Agent→API 가 갱신.
	// +optional
	Outcome string `json:"outcome,omitempty"`
	// observedRuns: 지금까지 생성한 Run 수(재시도 상한 판정용; Operator 소유)
	// +optional
	ObservedRuns int32 `json:"observedRuns,omitempty"`
	// approval: AwaitingApproval 시 승인 메타 집계(§6.4)
	// +optional
	Approval *ApprovalStatus `json:"approval,omitempty"`

	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=hissue
// +kubebuilder:printcolumn:name="Agent",type=string,JSONPath=`.spec.agentRef`
// +kubebuilder:printcolumn:name="Severity",type=string,JSONPath=`.spec.event.severity`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Runs",type=integer,JSONPath=`.status.observedRuns`
// +kubebuilder:printcolumn:name="Dedup",type=integer,JSONPath=`.status.dedupCount`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// HuginnIssue is the Schema for the huginnissues API
type HuginnIssue struct {
	metav1.TypeMeta `json:",inline"`
	// +optional
	metav1.ObjectMeta `json:"metadata,omitempty"`

	// +required
	Spec HuginnIssueSpec `json:"spec"`
	// +optional
	Status HuginnIssueStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// HuginnIssueList contains a list of HuginnIssue
type HuginnIssueList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []HuginnIssue `json:"items"`
}

func init() {
	SchemeBuilder.Register(&HuginnIssue{}, &HuginnIssueList{})
}
