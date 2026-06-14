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

// HuginnAgent 은 운영 대상 1개를 표현한다(설계서 §3.1).
// Muninn UI 의 "새 Application 등록" 위저드가 이 spec 으로 직렬화된다.

// AppKind 는 운영 대상 워크로드 종류(배포 도구 자동 선택의 UX 힌트; 권위는 spec.bindings).
// +kubebuilder:validation:Enum=triton;fastapi;airflow;other
type AppKind string

// AppOutput 은 에이전트 결과 형식.
// +kubebuilder:validation:Enum=pull_request;github_issue
type AppOutput string

// Severity 는 이벤트 심각도.
// +kubebuilder:validation:Enum=info;warning;error;critical
type Severity string

// PRApprovalTriggers 는 PR 출력 시 인간 승인이 필요한 조건(설계서 §6.4).
type PRApprovalTriggers struct {
	// onDependencyChange: 의존성 파일 변경 시 승인 필요
	// +optional
	OnDependencyChange bool `json:"onDependencyChange,omitempty"`
	// onLargeDiff: diff 가 lines 초과 시 승인 필요
	// +optional
	OnLargeDiff *LargeDiffTrigger `json:"onLargeDiff,omitempty"`
	// onWorkflowChange: .github/workflows/** 변경 시 승인 필요
	// +optional
	OnWorkflowChange bool `json:"onWorkflowChange,omitempty"`
	// onGuardrailNearLimit: cost/tokens 가 percent% 도달 시 승인 필요
	// +optional
	OnGuardrailNearLimit *GuardrailNearLimitTrigger `json:"onGuardrailNearLimit,omitempty"`
}

type LargeDiffTrigger struct {
	// +kubebuilder:default=200
	// +kubebuilder:validation:Minimum=1
	Lines int32 `json:"lines"`
}

type GuardrailNearLimitTrigger struct {
	// +kubebuilder:default=60
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=100
	Percent int32 `json:"percent"`
}

// PRPolicy 는 PR 출력 정책(설계서 §6.2).
type PRPolicy struct {
	// draft: 항상 draft 로 생성(강제). 기본 true.
	// +kubebuilder:default=true
	// +optional
	Draft bool `json:"draft,omitempty"`
	// +optional
	Labels []string `json:"labels,omitempty"`
	// +optional
	RequireApprovalOnWorkflowChange bool `json:"requireApprovalOnWorkflowChange,omitempty"`
	// +optional
	ApprovalTriggers *PRApprovalTriggers `json:"approvalTriggers,omitempty"`
}

// SourceSpec 은 GitHub 연결(모든 앱 필수).
type SourceSpec struct {
	// +kubebuilder:default=github
	// +optional
	Provider string `json:"provider,omitempty"`
	// repo: "owner/name" 형식
	// +kubebuilder:validation:Pattern=`^[^/]+/[^/]+$`
	Repo string `json:"repo"`
	// +kubebuilder:default=main
	// +optional
	DefaultBranch string `json:"defaultBranch,omitempty"`
	// +optional
	PR *PRPolicy `json:"pr,omitempty"`
	// secretRef: fine-grained PAT Secret 이름(특정 repo, PR 생성만; §6.2)
	// +optional
	SecretRef string `json:"secretRef,omitempty"`
}

// TriggerSpec 은 이벤트 진입 정책.
type TriggerSpec struct {
	// severityThreshold 미만 alert 는 Gateway 가 drop(§4.1)
	// +kubebuilder:default=warning
	// +optional
	SeverityThreshold Severity `json:"severityThreshold,omitempty"`
}

// Guardrails 는 안전 한도(SDK 파라미터로 집행; §5.4).
type Guardrails struct {
	// maxIterations → SDK max_turns
	// +kubebuilder:default=12
	// +kubebuilder:validation:Minimum=1
	// +optional
	MaxIterations int32 `json:"maxIterations,omitempty"`
	// maxCostUsd → SDK max_budget_usd (cost 는 예상치). MVP 는 정수 USD 로 단순화(float 직렬화 회피).
	// +kubebuilder:default=5
	// +kubebuilder:validation:Minimum=0
	// +optional
	MaxCostUsd int32 `json:"maxCostUsd,omitempty"`
	// maxTokens: 토큰 예산 상한(0=무제한). onGuardrailNearLimit 트리거(§6.4)가 cost/tokens 한도로 참조.
	// Operator 가 Run 생성 시 status.maxTokens 로 복사(operator-design §2.2).
	// +kubebuilder:validation:Minimum=0
	// +optional
	MaxTokens int64 `json:"maxTokens,omitempty"`
	// dailyRunCap: 24h 슬라이딩 윈도우 Run 상한
	// +kubebuilder:default=50
	// +kubebuilder:validation:Minimum=0
	// +optional
	DailyRunCap int32 `json:"dailyRunCap,omitempty"`
}

// ToolBinding 은 단일 Platform Tool 인스턴스 바인딩(§8.5).
type ToolBinding struct {
	// instance: platform_tool.name(UNIQUE) → Gateway 가 tool_id 로 매핑
	Instance string `json:"instance"`
	// config: 도구별 추가 설정(dashboardUid/defaultQuery/defaultService/defaultFilter 등)
	// +optional
	Config map[string]string `json:"config,omitempty"`
}

// MetricsBinding 은 Prometheus 호환 메트릭 백엔드(pluggable; 그림=Mimir).
type MetricsBinding struct {
	// +kubebuilder:default=mimir
	// +optional
	Backend  string `json:"backend,omitempty"`
	Instance string `json:"instance"`
	// +optional
	Config map[string]string `json:"config,omitempty"`
}

// Bindings 는 에이전트가 사용할 Platform Tool(MCP 서버) 집합. 모든 Issue 의 기본값 source(§3.1).
type Bindings struct {
	// +optional
	Deployment *DeploymentBindings `json:"deployment,omitempty"`
	// +optional
	Observability *ObservabilityBindings `json:"observability,omitempty"`
	// +optional
	Registry *RegistryBindings `json:"registry,omitempty"`
}

type DeploymentBindings struct {
	// +optional
	ArgoCD *ToolBinding `json:"argocd,omitempty"`
	// +optional
	Airflow *ToolBinding `json:"airflow,omitempty"`
}

type ObservabilityBindings struct {
	// +optional
	Grafana *ToolBinding `json:"grafana,omitempty"`
	// +optional
	Loki *ToolBinding `json:"loki,omitempty"`
	// +optional
	Tempo *ToolBinding `json:"tempo,omitempty"`
	// +optional
	Metrics *MetricsBinding `json:"metrics,omitempty"`
}

type RegistryBindings struct {
	// +optional
	Harbor *ToolBinding `json:"harbor,omitempty"`
}

// Identity 는 관측 신호 ↔ 워크로드 매핑(Issue 으로 상속).
type Identity struct {
	// +optional
	OtelServiceName string `json:"otelServiceName,omitempty"`
	K8sNamespace    string `json:"k8sNamespace"`
	// +optional
	K8sLabels map[string]string `json:"k8sLabels,omitempty"`
}

// AgentSpec 은 에이전트 런타임 설정.
type AgentSpec struct {
	// +kubebuilder:default=claude-code
	// +optional
	Runtime string `json:"runtime,omitempty"`
	// soulRef: SOUL.md(ConfigMap 이름). Operator 가 Run 생성 시 MUNINN_SOUL_REF 로 주입(§8.3)
	// +optional
	SoulRef string `json:"soulRef,omitempty"`
	// image: agent-runtime 컨테이너 이미지
	Image string `json:"image"`
}

// HuginnAgentSpec defines the desired state of HuginnAgent.
type HuginnAgentSpec struct {
	// workspaceId: 멀티테넌시 경계(§3.1). required & immutable. admission webhook 가 멤버십 보조 검증.
	// +kubebuilder:validation:XValidation:rule="self == oldSelf",message="workspaceId is immutable"
	// +kubebuilder:validation:MinLength=1
	WorkspaceID string `json:"workspaceId"`

	// +optional
	DisplayName string `json:"displayName,omitempty"`
	// +optional
	Description string `json:"description,omitempty"`

	// kind: 배포 바인딩 자동 결정의 UX 힌트(저장은 명시적 spec.bindings)
	Kind AppKind `json:"kind"`
	// output: 결과 형식
	Output AppOutput `json:"output"`

	Source     SourceSpec  `json:"source"`
	Trigger    TriggerSpec `json:"trigger"`
	Guardrails Guardrails  `json:"guardrails"`
	// +optional
	Bindings *Bindings `json:"bindings,omitempty"`
	Identity Identity  `json:"identity"`
	Agent    AgentSpec `json:"agent"`
}

// MemoryCount 는 회상 가능한 기억 단편 수(status 요약).
type MemoryCount struct {
	// +optional
	App int32 `json:"app,omitempty"`
	// +optional
	GlobalShared int32 `json:"globalShared,omitempty"`
}

// AppPhase 는 Application 의 거시 상태.
// +kubebuilder:validation:Enum=Pending;Ready;Degraded
type AppPhase string

const (
	AppPending  AppPhase = "Pending"
	AppReady    AppPhase = "Ready"
	AppDegraded AppPhase = "Degraded"
)

// HuginnAgentStatus defines the observed state of HuginnAgent.
type HuginnAgentStatus struct {
	// webhookUrl: Operator 가 발급(§4.5). https://{muninn-api-fqdn}/api/hooks/{name}
	// +optional
	WebhookURL string `json:"webhookUrl,omitempty"`
	// +optional
	Phase AppPhase `json:"phase,omitempty"`
	// activeIssues: reconcile 마다 계산(phase∈{Pending,Running,AwaitingApproval} 세션 수; §8.4)
	// +optional
	ActiveIssues int32 `json:"activeIssues,omitempty"`
	// +optional
	LastEventAt *metav1.Time `json:"lastEventAt,omitempty"`
	// +optional
	MemoryCount *MemoryCount `json:"memoryCount,omitempty"`

	// conditions: K8s 표준(Ready 등)
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:deprecatedversion:warning="muninn.io/v1beta1 is deprecated; migrate to muninn.io/v1"
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=happ
// +kubebuilder:printcolumn:name="Workspace",type=string,JSONPath=`.spec.workspaceId`
// +kubebuilder:printcolumn:name="Kind",type=string,JSONPath=`.spec.kind`
// +kubebuilder:printcolumn:name="Output",type=string,JSONPath=`.spec.output`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Active",type=integer,JSONPath=`.status.activeIssues`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// HuginnAgent is the Schema for the huginnagents API
type HuginnAgent struct {
	metav1.TypeMeta `json:",inline"`
	// +optional
	metav1.ObjectMeta `json:"metadata,omitempty"`

	// +required
	Spec HuginnAgentSpec `json:"spec"`
	// +optional
	Status HuginnAgentStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// HuginnAgentList contains a list of HuginnAgent
type HuginnAgentList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []HuginnAgent `json:"items"`
}

func init() {
	SchemeBuilder.Register(&HuginnAgent{}, &HuginnAgentList{})
}
