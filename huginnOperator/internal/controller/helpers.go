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
	claudeMountPath    = "/root/.claude" // 그림 pvc(~/.claude). 프로젝트 설정/세션만(인증 아님; §5.1)
	agentSkillCmd      = "/usr/local/bin/claude_skill.sh"

	agentSecretName  = "agent-secrets" // ANTHROPIC_API_KEY 소스(§5.1)
	anthropicKeyName = "anthropic-api-key"

	serviceAccountName = "huginn-agent" // 자기 namespace Secret/CM 만 read(§6.1)

	defaultMemoryEndpoint = "http://muninn-memory.muninn.svc:8080"
	defaultAPIEndpoint    = "http://muninn-api.muninn.svc:8080"
	defaultAPIBaseURL     = "https://muninn-api.platform.local"
)

// pvcNameForAgent 은 앱별 격리 PVC 이름(§5.5 MVP=A).
func pvcNameForAgent(agentName string) string {
	return "pvc-claude-" + agentName
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
	env := []corev1.EnvVar{
		{Name: "MUNINN_GOAL", Value: issue.Spec.Goal},
		{Name: "MUNINN_GLOBAL_SYSTEM_PROMPT_REF", Value: "configmap/muninn-global-prompt"},
		{Name: "MUNINN_TEAM_SETTINGS_REF", Value: "configmap/muninn-team-settings"},
		{Name: "MUNINN_GUARDRAILS", Value: fmt.Sprintf(`{"maxIterations":%d,"maxCostUsd":%d,"maxTokens":%d}`, g.MaxIterations, g.MaxCostUsd, g.MaxTokens)},
		{Name: "MUNINN_MEMORY_ENDPOINT", Value: memoryEndpoint},
		{Name: "MUNINN_API_ENDPOINT", Value: apiEndpoint},
		// 인증: env(Secret)로만(§5.1, §6.2)
		{Name: "ANTHROPIC_API_KEY", ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: agentSecretName},
				Key:                  anthropicKeyName,
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
	}
}
