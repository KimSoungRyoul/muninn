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
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/utils/ptr"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

// 공통 라벨/어노테이션/이름 규약(설계서 §6.1, §5.1, 예제 YAML).
const (
	LabelWorkspace   = "muninn.io/workspace"
	LabelAgent       = "muninn.io/agent"
	LabelIssue       = "muninn.io/issue"
	LabelFingerprint = "muninn.io/event-fingerprint"
	AnnotationGoal   = "muninn.io/goal"

	agentContainerName = "agent"
	claudeVolumeName   = "claude-home"
	// claudeMountPath: agent-runtime 이미지는 비-root(node uid 1000)로 동작하므로 ~/.claude=/home/node/.claude.
	// 프로젝트 설정/세션만 공유(인증 아님; §5.1).
	claudeMountPath = "/home/node/.claude"
	agentSkillCmd   = "/usr/local/bin/claude_skill.sh"

	// claudeHomeInitContainerName / claudeStoreInitPath: subPath(~/.claude) 디렉토리를 미리 만드는
	// initContainer 배선(§5.5, 리뷰 R1). init 은 PVC 루트(fsGroup 으로 그룹쓰기 가능)를 claudeStoreInitPath
	// 에 마운트해 ClaudeSubPath 디렉토리를 mkdir -p 한다 — kubelet 이 root 소유로 만들어 uid 1000 쓰기가
	// 막히는 subPath+fsGroup gap 을 회피한다.
	claudeHomeInitContainerName = "claude-home-init"
	claudeStoreInitPath         = "/claude-store"

	// agentRunAsUser: agent-runtime 이미지의 비-root 사용자(node). PVC fsGroup/securityContext 에 사용.
	agentRunAsUser int64 = 1000

	agentSecretName   = "agent-secrets" // 인증 키 소스(§5.1)
	anthropicKeyName  = "anthropic-api-key"
	oauthTokenKeyName = "claude-code-oauth-token" // OAuth 인증 대안(Pro/Max/team)
	// muninnAPITokenKeyName: 런타임이 Muninn API(보고/승인/메모리)를 인증할 토큰. agent-secrets 의 키.
	muninnAPITokenKeyName = "muninn-api-token"

	serviceAccountName = "huginn-agent" // 자기 namespace Secret/CM 만 read(§6.1)

	defaultMemoryEndpoint = "http://muninn-memory.muninn.svc:8080"
	defaultAPIEndpoint    = "http://muninn-api.muninn.svc:8080"
	defaultAPIBaseURL     = "https://muninn-api.platform.local"

	// approvalTimeoutSeconds: HITL 승인 게이트의 권위 timeout(초). web 의 승인 TTL(incidents.ts
	// approvalTtlMinutes 기본 90m)·runner._approval_timeout_seconds 기본(5400)과 정합하는 단일 소스다
	// (CONTRACT §C-HITL). operator 가 이 값을 MUNINN_APPROVAL_TIMEOUT env 로 주입해 runner 가 동일 값을
	// 쓰게 하고, requireApproval=true Run 의 Job activeDeadline 도 이 값 이상으로 잡는다.
	approvalTimeoutSeconds int64 = 5400
	// defaultRunTimeoutSeconds: 승인 게이트가 없는 일반 Run 의 Job activeDeadline(=60m).
	defaultRunTimeoutSeconds int64 = 3600
	// approvalRunTimeoutSeconds: requireApproval=true Run 의 Job activeDeadline(=120m).
	// 승인 timeout(90m) + 승인 후 실제 작업 예산(약 30m) 이상이어야, 운영자가 60~90m 사이 승인해도
	// Pod 가 activeDeadline 로 SIGKILL 당하지 않는다(CONTRACT §C-HITL, 리뷰 HIGH). 즉
	// activeDeadline >= approvalTimeout + 작업예산 을 보장한다.
	approvalRunTimeoutSeconds int64 = 7200
)

// webhookURLFor 는 HuginnAgent 의 status.webhookUrl 을 발급한다(§4.5). 경로는 실제 Muninn API
// 수신 라우트(muninnWeb `app/api/hooks/[app]/route.ts` = POST /api/hooks/{app})와 정합한다 —
// `/api` 접두가 빠지면 사용자가 status.webhookUrl 을 그대로 복사해 Grafana 등에 꽂을 때 404 가 난다.
// base 가 비면 defaultAPIBaseURL(placeholder FQDN)을 쓴다.
func webhookURLFor(base, agentName string) string {
	return fmt.Sprintf("%s/api/hooks/%s", orDefault(base, defaultAPIBaseURL), agentName)
}

// runTimeoutSeconds 는 Run 의 Job activeDeadlineSeconds(=Spec.TimeoutSeconds)를 결정한다.
// agent 의 PR 정책이 승인 게이트를 켜면(requireApprovalOnWorkflowChange) 승인 대기(최대 90m)가
// 60m activeDeadline 에 SIGKILL 당하는 모순을 막기 위해 7200s 로 상향한다(CONTRACT §C-HITL).
func runTimeoutSeconds(agent *muninniov1beta1.HuginnAgent) int64 {
	if pr := agent.Spec.Source.PR; pr != nil && pr.RequireApprovalOnWorkflowChange {
		return approvalRunTimeoutSeconds
	}
	return defaultRunTimeoutSeconds
}

// pvcNameForAgent 은 앱별 격리 PVC 이름(§5.5 MVP=A).
func pvcNameForAgent(agentName string) string {
	return "pvc-claude-" + agentName
}

// withResumeSession 은 직전 attempt 의 Claude Code 세션을 잇는 env 를 JobTemplate 에 덧붙인다(§5.5).
// sessionID 는 직전(실패한) Run 의 status.sessionId(Agent→API 소유)다. 세션 transcript 는 앱별
// ~/.claude PVC 에 남아 있고 모든 Run 의 cwd(/workspace)가 동일하므로 같은 프로젝트로 resume 된다.
// resume 범위는 같은 Issue 의 attempt 간으로 한정한다 — Issue 간 컨텍스트 오염을 막고,
// 사건 간 연속성은 메모리(recall/CLAUDE.md)가 담당한다. 비면(에이전트가 보고 전에 죽음) 새 세션.
func withResumeSession(jt muninniov1beta1.JobTemplate, sessionID string) muninniov1beta1.JobTemplate {
	if sessionID == "" {
		return jt
	}
	// Env 는 새 backing array 로 복사 후 append(리뷰 LOW-2) — 호출자가 같은 JobTemplate 을
	// 재사용해도 이 helper 가 호출자 쪽 slice 를 변형하지 않는다.
	jt.Env = append(append([]corev1.EnvVar(nil), jt.Env...),
		corev1.EnvVar{Name: "MUNINN_RESUME_SESSION_ID", Value: sessionID})
	return jt
}

// initContainerResources 는 subPath 선생성 initContainer(claude-home-init)의 최소 리소스다(리뷰 R2).
// mkdir 한 번이라 아주 작게 잡되, requests 를 명시해 LimitRange-strict 네임스페이스의 pod 거부를 막고
// init 단계 QoS 가 BestEffort 로 떨어지지 않게 한다.
func initContainerResources() corev1.ResourceRequirements {
	return corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("10m"),
			corev1.ResourceMemory: resource.MustParse("16Mi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("100m"),
			corev1.ResourceMemory: resource.MustParse("64Mi"),
		},
	}
}

// defaultAgentResources 는 권장 기본 리소스(§5.1).
func defaultAgentResources() corev1.ResourceRequirements {
	return corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("500m"),
			corev1.ResourceMemory: resource.MustParse("512Mi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("2000m"),
			corev1.ResourceMemory: resource.MustParse("2Gi"),
		},
	}
}

// buildJobTemplate 은 HuginnAgent + HuginnIssue 컨텍스트로 큐레이트된 실행 recipe 를 만든다(operator-design §2.4, §5.1).
// full corev1.PodSpec 대신 슬림한 JobTemplate 을 반환한다(CRD 스키마 폭증 회피). 인증 키는 env(Secret)로만 주입(§5.1, §6.2).
func buildJobTemplate(agent *muninniov1beta1.HuginnAgent, issue *muninniov1beta1.HuginnIssue,
	memoryEndpoint, apiEndpoint string) muninniov1beta1.JobTemplate {

	g := issue.Spec.InheritedGuardrails
	// HITL 진입 트리거(CONTRACT §C1, 리뷰 HIGH): agent 의 PR 정책
	// source.pr.requireApprovalOnWorkflowChange 를 MUNINN_GUARDRAILS JSON 의
	// "requireApproval" 키로 직렬화한다. runner._require_approval() 가 이 키를 읽어
	// 위험작업 직전 승인 게이트를 켠다 — operator 만 이 키를 채우면 HITL 루프가 실제 작동한다.
	// (CRD 필드명 requireApprovalOnWorkflowChange ↔ runner 키 requireApproval 의 경계는 여기서 고정.)
	requireApproval := false
	if pr := agent.Spec.Source.PR; pr != nil {
		requireApproval = pr.RequireApprovalOnWorkflowChange
	}
	env := []corev1.EnvVar{
		{Name: "MUNINN_GOAL", Value: issue.Spec.Goal},
		{Name: "MUNINN_GLOBAL_SYSTEM_PROMPT_REF", Value: "configmap/muninn-global-prompt"},
		{Name: "MUNINN_TEAM_SETTINGS_REF", Value: "configmap/muninn-team-settings"},
		{Name: "MUNINN_GUARDRAILS", Value: fmt.Sprintf(`{"maxIterations":%d,"maxCostUsd":%d,"maxTokens":%d,"requireApproval":%t}`,
			g.MaxIterations, g.MaxCostUsd, g.MaxTokens, requireApproval)},
		// MUNINN_APPROVAL_TIMEOUT: HITL 승인 게이트 timeout 의 단일 소스(초). web TTL·runner 기본과 정합시켜
		// runner._approval_timeout_seconds 가 동일 값을 쓰게 한다(CONTRACT §C-HITL). requireApproval 여부와
		// 무관하게 항상 주입 — 게이트가 켜지면(MUNINN_REQUIRE_APPROVAL/guardrails) 이 값으로 폴링 timeout 을 잡고,
		// 같은 값 이상으로 잡힌 Job activeDeadline(runTimeoutSeconds) 안에 들어오도록 한다.
		{Name: "MUNINN_APPROVAL_TIMEOUT", Value: fmt.Sprintf("%d", approvalTimeoutSeconds)},
		{Name: "MUNINN_MEMORY_ENDPOINT", Value: memoryEndpoint},
		{Name: "MUNINN_API_ENDPOINT", Value: apiEndpoint},
		// 인증: env(Secret)로만(§5.1, §6.2). API 키 또는 OAuth 토큰 중 하나면 충분 →
		// 둘 다 optional 로 주입하고 "최소 하나 존재"는 런타임(claude_skill.sh)이 강제한다.
		{Name: "ANTHROPIC_API_KEY", ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: agentSecretName},
				Key:                  anthropicKeyName,
				Optional:             ptr.To(true),
			},
		}},
		{Name: "CLAUDE_CODE_OAUTH_TOKEN", ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: agentSecretName},
				Key:                  oauthTokenKeyName,
				Optional:             ptr.To(true),
			},
		}},
		// MUNINN_API_TOKEN: 런타임이 Muninn API(보고/승인/메모리) 호출을 인증하는 토큰(§5.6).
		// 인증 키와 동일 패턴(agent-secrets, optional) — 미배포 환경에서도 Pod 가 뜨도록 optional.
		{Name: "MUNINN_API_TOKEN", ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: agentSecretName},
				Key:                  muninnAPITokenKeyName,
				Optional:             ptr.To(true),
			},
		}},
	}
	if agent.Spec.Agent.SoulRef != "" {
		env = append(env, corev1.EnvVar{Name: "MUNINN_SOUL_REF", Value: "configmap/" + agent.Spec.Agent.SoulRef})
	}
	if issue.Spec.Event.PayloadSecretRef != "" {
		env = append(env, corev1.EnvVar{Name: "MUNINN_EVENT_PAYLOAD_REF", Value: "secret/" + issue.Spec.Event.PayloadSecretRef})
	}
	if agent.Spec.Source.SecretRef != "" {
		env = append(env, corev1.EnvVar{Name: "GITHUB_PAT", ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: agent.Spec.Source.SecretRef},
				Key:                  "token",
			},
		}})
	}

	return muninniov1beta1.JobTemplate{
		Image:              agent.Spec.Agent.Image,
		Command:            []string{agentSkillCmd},
		Env:                env,
		Resources:          defaultAgentResources(),
		ServiceAccountName: serviceAccountName,
		ClaudePVCName:      pvcNameForAgent(agent.Name),
		// ClaudeSubPath=Issue 이름: 앱 PVC 안에서 Issue별 하위 경로를 ~/.claude 로 마운트한다(§5.5).
		// resume 경계가 Issue 이므로(withResumeSession), 영속 경계도 Issue 로 맞춰 transcript/설정을
		// 물리 격리한다 → 같은 앱의 다른 Issue 가 ~/.claude(settings·projects)를 동시에 더럽히지 않는다.
		// 같은 Issue 의 attempt 들은 같은 subPath 를 공유하므로 세션 resume 이 그대로 동작한다.
		ClaudeSubPath: issue.Name,
	}
}
