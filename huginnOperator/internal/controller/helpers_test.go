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
	"testing"

	corev1 "k8s.io/api/core/v1"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

func envByName(env []corev1.EnvVar, name string) (corev1.EnvVar, bool) {
	for _, e := range env {
		if e.Name == name {
			return e, true
		}
	}
	return corev1.EnvVar{}, false
}

func testFixtures() (*muninniov1beta1.HuginnAgent, *muninniov1beta1.HuginnIssue) {
	agent := &muninniov1beta1.HuginnAgent{}
	agent.Name = "ai-router-svc"
	agent.Spec.Agent.Image = "registry.local/agent:0.1.0"
	agent.Spec.Agent.SoulRef = "soul-ai-router-svc"
	agent.Spec.Source.SecretRef = "gh-pat"

	issue := &muninniov1beta1.HuginnIssue{}
	issue.Name = "issue-1"
	issue.Spec.Goal = "diagnose"
	issue.Spec.Event.PayloadSecretRef = "issue-1-event"
	issue.Spec.InheritedGuardrails = muninniov1beta1.InheritedGuardrails{
		MaxIterations: 3, MaxCostUsd: 5, MaxTokens: 100000,
	}
	return agent, issue
}

func TestBuildJobTemplate(t *testing.T) {
	agent, issue := testFixtures()
	jt := buildJobTemplate(agent, issue, "http://mem", "http://api")

	if jt.Image != "registry.local/agent:0.1.0" {
		t.Errorf("image = %q", jt.Image)
	}
	if jt.ClaudePVCName != "pvc-claude-ai-router-svc" {
		t.Errorf("claudePVCName = %q", jt.ClaudePVCName)
	}
	if jt.ServiceAccountName != serviceAccountName {
		t.Errorf("serviceAccountName = %q", jt.ServiceAccountName)
	}
	if len(jt.Command) != 1 || jt.Command[0] != agentSkillCmd {
		t.Errorf("command = %v", jt.Command)
	}

	// 단순 Value env 들은 표로 한 번에 검증
	// (MUNINN_GUARDRAILS 는 maxIterations/maxCostUsd/maxTokens 모두 포함해야 함 — 리뷰 수정 #1).
	for _, tc := range []struct{ name, want string }{
		{"MUNINN_GUARDRAILS", `{"maxIterations":3,"maxCostUsd":5,"maxTokens":100000}`},
		{"MUNINN_SOUL_REF", "configmap/soul-ai-router-svc"},
		{"MUNINN_EVENT_PAYLOAD_REF", "secret/issue-1-event"},
		{"MUNINN_GOAL", "diagnose"},
	} {
		e, ok := envByName(jt.Env, tc.name)
		if !ok {
			t.Errorf("%s env 누락", tc.name)
			continue
		}
		if e.Value != tc.want {
			t.Errorf("%s = %q, want %q", tc.name, e.Value, tc.want)
		}
	}

	// 인증은 env(Secret) secretKeyRef 로만 주입(§5.1, §6.2).
	// API 키/OAuth 토큰 둘 중 하나면 충분 → 둘 다 optional secretKeyRef.
	assertOptionalSecretRef(t, jt.Env, "ANTHROPIC_API_KEY", agentSecretName, anthropicKeyName)
	assertOptionalSecretRef(t, jt.Env, "CLAUDE_CODE_OAUTH_TOKEN", agentSecretName, oauthTokenKeyName)

	if gh, ok := envByName(jt.Env, "GITHUB_PAT"); !ok || gh.ValueFrom == nil || gh.ValueFrom.SecretKeyRef.Name != "gh-pat" {
		t.Error("GITHUB_PAT secretKeyRef(gh-pat) 누락")
	}
}

// assertOptionalSecretRef 는 env 가 (secret,key) 를 가리키는 optional secretKeyRef 인지 검증한다(§5.1).
func assertOptionalSecretRef(t *testing.T, env []corev1.EnvVar, envName, secret, key string) {
	t.Helper()
	e, ok := envByName(env, envName)
	if !ok || e.ValueFrom == nil || e.ValueFrom.SecretKeyRef == nil {
		t.Fatalf("%s secretKeyRef 누락", envName)
	}
	ref := e.ValueFrom.SecretKeyRef
	if ref.Name != secret || ref.Key != key {
		t.Errorf("%s ref = %+v", envName, ref)
	}
	if ref.Optional == nil || !*ref.Optional {
		t.Errorf("%s secretKeyRef 는 optional 이어야 함", envName)
	}
}

func TestExpandPodSpec(t *testing.T) {
	jt := muninniov1beta1.JobTemplate{
		Image:         "img:1",
		Env:           []corev1.EnvVar{{Name: "X", Value: "y"}},
		ClaudePVCName: "pvc-claude-app",
		// Command/Resources/ServiceAccountName 비움 → 기본값 적용 검증
	}
	ps := expandPodSpec(jt)

	if ps.RestartPolicy != corev1.RestartPolicyNever {
		t.Errorf("restartPolicy = %q", ps.RestartPolicy)
	}
	if ps.ServiceAccountName != serviceAccountName {
		t.Errorf("serviceAccountName = %q (기본값 적용 실패)", ps.ServiceAccountName)
	}
	if len(ps.Containers) != 1 {
		t.Fatalf("containers = %d", len(ps.Containers))
	}
	c := ps.Containers[0]
	if c.Name != agentContainerName || c.Image != "img:1" {
		t.Errorf("container name/image = %q/%q", c.Name, c.Image)
	}
	if len(c.Command) != 1 || c.Command[0] != agentSkillCmd {
		t.Errorf("command 기본값 미적용 = %v", c.Command)
	}
	if len(c.Resources.Requests) == 0 || len(c.Resources.Limits) == 0 {
		t.Error("resources 기본값 미적용")
	}
	if len(c.VolumeMounts) != 1 || c.VolumeMounts[0].MountPath != claudeMountPath {
		t.Errorf("volumeMount = %+v", c.VolumeMounts)
	}
	if len(ps.Volumes) != 1 || ps.Volumes[0].PersistentVolumeClaim == nil ||
		ps.Volumes[0].PersistentVolumeClaim.ClaimName != "pvc-claude-app" {
		t.Errorf("PVC volume = %+v", ps.Volumes)
	}

	// 비-root 하드닝(§5.1, §6.1): pod fsGroup/runAsNonRoot + 컨테이너 capability 드롭.
	if ps.SecurityContext == nil || ps.SecurityContext.RunAsNonRoot == nil || !*ps.SecurityContext.RunAsNonRoot {
		t.Error("pod runAsNonRoot 미설정")
	}
	if ps.SecurityContext == nil || ps.SecurityContext.FSGroup == nil || *ps.SecurityContext.FSGroup != agentRunAsUser {
		t.Errorf("pod fsGroup = %v, want %d", ps.SecurityContext.FSGroup, agentRunAsUser)
	}
	if c.SecurityContext == nil || c.SecurityContext.AllowPrivilegeEscalation == nil || *c.SecurityContext.AllowPrivilegeEscalation {
		t.Error("컨테이너 allowPrivilegeEscalation 은 false 여야 함")
	}
	if c.SecurityContext == nil || c.SecurityContext.Capabilities == nil || len(c.SecurityContext.Capabilities.Drop) == 0 {
		t.Error("컨테이너 capability 드롭 미설정")
	}

	// ClaudePVCName 비면 볼륨/마운트 미부착.
	ps2 := expandPodSpec(muninniov1beta1.JobTemplate{Image: "img:2"})
	if len(ps2.Volumes) != 0 || len(ps2.Containers[0].VolumeMounts) != 0 {
		t.Error("ClaudePVCName 비었는데 볼륨이 부착됨")
	}
}
