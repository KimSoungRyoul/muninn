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
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

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
	// HITL 진입 트리거(CONTRACT §C1): PR 정책의 승인 요구를 MUNINN_GUARDRAILS 로 직렬화하는지 검증용.
	agent.Spec.Source.PR = &muninniov1beta1.PRPolicy{RequireApprovalOnWorkflowChange: true}

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
	if jt.AgentPVCName != "pvc-agent-ai-router-svc" {
		t.Errorf("agentPVCName = %q", jt.AgentPVCName)
	}
	// AgentSubPath=Issue 이름: 앱 PVC 안에서 Issue별 에이전트 홈 격리(§5.5).
	if jt.AgentSubPath != "issue-1" {
		t.Errorf("agentSubPath = %q, want issue-1", jt.AgentSubPath)
	}
	if jt.ServiceAccountName != serviceAccountName {
		t.Errorf("serviceAccountName = %q", jt.ServiceAccountName)
	}
	if len(jt.Command) != 1 || jt.Command[0] != agentSkillCmd {
		t.Errorf("command = %v", jt.Command)
	}

	// 단순 Value env 들은 표로 한 번에 검증
	// (MUNINN_GUARDRAILS 는 maxIterations/maxCostUsd/maxTokens + requireApproval 모두 포함해야 함 — 리뷰 수정 #1, CONTRACT §C1).
	// requireApproval=true 는 agent.Spec.Source.PR.RequireApprovalOnWorkflowChange 에서 직렬화된 것(HITL 트리거 배선).
	for _, tc := range []struct{ name, want string }{
		{"MUNINN_GUARDRAILS", `{"maxIterations":3,"maxCostUsd":5,"maxTokens":100000,"requireApproval":true}`},
		// MUNINN_APPROVAL_TIMEOUT: HITL 승인 timeout(초) = web TTL(90m) + grace(300s) = 5700(Q7, §10-2).
		{"MUNINN_APPROVAL_TIMEOUT", "5700"},
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
	// MUNINN_API_TOKEN: 런타임이 Muninn API 를 인증(§5.6). 동일 패턴(agent-secrets, optional).
	assertOptionalSecretRef(t, jt.Env, "MUNINN_API_TOKEN", agentSecretName, muninnAPITokenKeyName)

	if gh, ok := envByName(jt.Env, "GITHUB_PAT"); !ok || gh.ValueFrom == nil || gh.ValueFrom.SecretKeyRef.Name != "gh-pat" {
		t.Error("GITHUB_PAT secretKeyRef(gh-pat) 누락")
	}

	// §3 게이트웨이 필드 미설정(기본 fixture) → 게이트웨이 env 가 하나도 없어야 한다.
	for _, name := range []string{"ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_AUTH_TOKEN"} {
		if _, ok := envByName(jt.Env, name); ok {
			t.Errorf("게이트웨이 미설정인데 %s 가 주입됨", name)
		}
	}
}

// TestAgentRoleRules: SA 최소권한 Role(§6.2-5) 의 보안 불변식 — read-only 진단(pods/log·deployments)만,
// secrets/configmaps 는 절대 포함하지 않는다(워크스페이스 내 자격 탈취 표면 차단).
func TestAgentRoleRules(t *testing.T) {
	rules := agentRoleRules()
	hasPodsLog, hasDeploy := false, false
	for _, r := range rules {
		for _, res := range r.Resources {
			if res == "secrets" || res == "configmaps" {
				t.Errorf("agent Role 에 금지 리소스 %q 포함(자격 탈취 표면)", res)
			}
			if res == "pods/log" {
				hasPodsLog = true
			}
			if res == "deployments" {
				hasDeploy = true
			}
		}
		// 모든 verb 는 read-only.
		for _, v := range r.Verbs {
			switch v {
			case "get", "list", "watch":
			default:
				t.Errorf("agent Role 에 비-read verb %q 포함(read-only 위반)", v)
			}
		}
	}
	if !hasPodsLog || !hasDeploy {
		t.Errorf("agent Role 에 pods/log·deployments read 가 있어야 함 (pods/log=%v deployments=%v)", hasPodsLog, hasDeploy)
	}
}

// TestResolveAgentForRun: effectiveRuntime 동결(§5·§10-9) + image 기본값(§10-5) 해소를 검증한다.
func TestResolveAgentForRun(t *testing.T) {
	const ccImg, hsImg = "ghcr/agent-runtime:dev", "ghcr/huginn-self:dev"

	// 1) runtime/image 둘 다 이미 확정 → 그대로(사본 불필요, 동일 포인터).
	a, _ := testFixtures()
	a.Spec.Agent.Runtime = "claude-code"
	if got := resolveAgentForRun(a, "claude-code", ccImg, hsImg); got != a {
		t.Error("변경 없을 땐 원본 포인터를 그대로 반환해야 함")
	}

	// 2) agent.image 비고 runtime 비면 → claude-code 기본 이미지.
	a2, _ := testFixtures()
	a2.Spec.Agent.Image = ""
	if got := resolveAgentForRun(a2, "", ccImg, hsImg); got.Spec.Agent.Image != ccImg || effectiveRuntimeOf(got) != "claude-code" {
		t.Errorf("image=%q runtime=%q, want %q/claude-code", got.Spec.Agent.Image, effectiveRuntimeOf(got), ccImg)
	}

	// 3) effRuntime=huginn-self(동결) + image 비면 → huginn-self 기본 이미지 + runtime 동결.
	a3, _ := testFixtures()
	a3.Spec.Agent.Image = ""
	a3.Spec.Agent.Runtime = "claude-code" // 라이브 agent 는 claude-code 인데...
	got := resolveAgentForRun(a3, "huginn-self", ccImg, hsImg) // ...동결값 huginn-self 가 우선
	if got.Spec.Agent.Runtime != "huginn-self" || got.Spec.Agent.Image != hsImg {
		t.Errorf("동결 runtime=%q image=%q, want huginn-self/%s", got.Spec.Agent.Runtime, got.Spec.Agent.Image, hsImg)
	}
	if a3.Spec.Agent.Runtime != "claude-code" {
		t.Error("원본 agent 가 변형됨(사본이어야 함)")
	}

	// 4) image 명시는 기본값보다 우선.
	a4, _ := testFixtures()
	a4.Spec.Agent.Image = "custom:1"
	if got := resolveAgentForRun(a4, "huginn-self", ccImg, hsImg); got.Spec.Agent.Image != "custom:1" {
		t.Errorf("명시 image 가 무시됨: %q", got.Spec.Agent.Image)
	}
}

// TestBuildJobTemplateHuginnSelf: §4 백엔드 분기 — runtime=huginn-self 면 command/mountPath/env 가
// huginn-self 용으로 바뀌고, 게이트웨이 env(ANTHROPIC_*)는 주입되지 않아야 한다.
func TestBuildJobTemplateHuginnSelf(t *testing.T) {
	agent, issue := testFixtures()
	agent.Spec.Agent.Runtime = "huginn-self"
	agent.Spec.Agent.BaseURL = "https://llm-gateway.example.com"
	agent.Spec.Agent.Model = "gemma-4-31B-it"
	agent.Spec.Agent.AuthStyle = "openai"

	jt := buildJobTemplate(agent, issue, "http://mem", "http://api")

	if len(jt.Command) != 1 || jt.Command[0] != huginnSelfCmd {
		t.Errorf("command = %v, want [%s]", jt.Command, huginnSelfCmd)
	}
	if jt.MountPath != huginnMountPath {
		t.Errorf("mountPath = %q, want %q", jt.MountPath, huginnMountPath)
	}
	if e, ok := envByName(jt.Env, "MUNINN_BASE_URL"); !ok || e.Value != "https://llm-gateway.example.com" {
		t.Errorf("MUNINN_BASE_URL = %q (ok=%v)", e.Value, ok)
	}
	if e, ok := envByName(jt.Env, "MUNINN_MODEL"); !ok || e.Value != "gemma-4-31B-it" {
		t.Errorf("MUNINN_MODEL = %q (ok=%v)", e.Value, ok)
	}
	if e, ok := envByName(jt.Env, "MUNINN_AUTH_STYLE"); !ok || e.Value != "openai" {
		t.Errorf("MUNINN_AUTH_STYLE = %q (ok=%v)", e.Value, ok)
	}
	assertOptionalSecretRef(t, jt.Env, "MUNINN_LLM_API_KEY", agentSecretName, anthropicAuthTokenKeyName)
	// 게이트웨이 env(claude-code 전용)는 huginn-self 에 주입되지 않는다.
	for _, name := range []string{"ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_AUTH_TOKEN"} {
		if _, ok := envByName(jt.Env, name); ok {
			t.Errorf("huginn-self 인데 게이트웨이 env %s 가 주입됨", name)
		}
	}
	// claude-code 기본은 여전히 claude_skill.sh + ~/.claude.
	cc, _ := testFixtures()
	jtcc := buildJobTemplate(cc, issue, "http://mem", "http://api")
	if jtcc.Command[0] != agentSkillCmd || jtcc.MountPath != claudeMountPath {
		t.Errorf("claude-code 분기 회귀: command=%v mountPath=%q", jtcc.Command, jtcc.MountPath)
	}
}

// TestGatewayEnv: §3 게이트웨이 경유 env 주입(baseUrl/model/authStyle)을 검증한다.
func TestGatewayEnv(t *testing.T) {
	agent, issue := testFixtures()
	agent.Spec.Agent.BaseURL = "https://llm-gateway.example.com"
	agent.Spec.Agent.Model = "gemma-4-31B-it"
	agent.Spec.Agent.AuthStyle = "bearer"

	jt := buildJobTemplate(agent, issue, "http://mem", "http://api")

	if e, ok := envByName(jt.Env, "ANTHROPIC_BASE_URL"); !ok || e.Value != "https://llm-gateway.example.com" {
		t.Errorf("ANTHROPIC_BASE_URL = %q (ok=%v), want https://llm-gateway.example.com", e.Value, ok)
	}
	if e, ok := envByName(jt.Env, "ANTHROPIC_MODEL"); !ok || e.Value != "gemma-4-31B-it" {
		t.Errorf("ANTHROPIC_MODEL = %q (ok=%v), want gemma-4-31B-it", e.Value, ok)
	}
	// authStyle=bearer → ANTHROPIC_AUTH_TOKEN 은 agent-secrets/anthropic-auth-token optional secretKeyRef.
	assertOptionalSecretRef(t, jt.Env, "ANTHROPIC_AUTH_TOKEN", agentSecretName, anthropicAuthTokenKeyName)

	// authStyle 이 bearer 가 아니면 ANTHROPIC_AUTH_TOKEN 미주입(기존 api-key/oauth 사용).
	agent.Spec.Agent.AuthStyle = "anthropic"
	jt2 := buildJobTemplate(agent, issue, "http://mem", "http://api")
	if _, ok := envByName(jt2.Env, "ANTHROPIC_AUTH_TOKEN"); ok {
		t.Error("authStyle=anthropic 인데 ANTHROPIC_AUTH_TOKEN 이 주입됨")
	}
	if _, ok := envByName(jt2.Env, "ANTHROPIC_BASE_URL"); !ok {
		t.Error("authStyle=anthropic 라도 baseUrl 설정 시 ANTHROPIC_BASE_URL 은 주입돼야 함")
	}

	// runtime=huginn-self 는 §3 분기 대상이 아님 → 게이트웨이 env 미주입(§4 별도 분기).
	agent.Spec.Agent.Runtime = "huginn-self"
	agent.Spec.Agent.AuthStyle = "bearer"
	jt3 := buildJobTemplate(agent, issue, "http://mem", "http://api")
	for _, name := range []string{"ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_AUTH_TOKEN"} {
		if _, ok := envByName(jt3.Env, name); ok {
			t.Errorf("runtime=huginn-self 인데 게이트웨이 env %s 가 주입됨", name)
		}
	}
}

// TestWithResumeSession 은 재시도 attempt 의 세션 resume 배선을 검증한다(§5.5).
// sessionID 가 있으면 MUNINN_RESUME_SESSION_ID env 가 덧붙고, 비면(직전 attempt 가 보고 전에
// 죽은 경우) JobTemplate 이 그대로여야 한다 — 빈 env 주입은 runner 의 새-세션 기본 동작을 가린다.
func TestWithResumeSession(t *testing.T) {
	agent, issue := testFixtures()
	jt := buildJobTemplate(agent, issue, "http://mem", "http://api")
	baseEnvLen := len(jt.Env)

	resumed := withResumeSession(jt, "0a1b2c3d-e4f5-6789-abcd-ef0123456789")
	e, ok := envByName(resumed.Env, "MUNINN_RESUME_SESSION_ID")
	if !ok || e.Value != "0a1b2c3d-e4f5-6789-abcd-ef0123456789" {
		t.Errorf("MUNINN_RESUME_SESSION_ID = %+v(ok=%v), want 직전 sessionId", e, ok)
	}

	fresh := withResumeSession(buildJobTemplate(agent, issue, "http://mem", "http://api"), "")
	if _, ok := envByName(fresh.Env, "MUNINN_RESUME_SESSION_ID"); ok {
		t.Error("sessionID 빈 값엔 MUNINN_RESUME_SESSION_ID 가 없어야 한다(새 세션)")
	}
	if len(fresh.Env) != baseEnvLen {
		t.Errorf("빈 sessionID 가 env 를 변형: len=%d, want %d", len(fresh.Env), baseEnvLen)
	}
}

// TestLastSessionID 는 재시도 시 resume 할 세션 선택 규칙을 고정한다(§5.5, 리뷰 LOW-1):
// attempt 오름차순에서 뒤에서부터 첫 non-empty sessionId — 직전 attempt 가 init 전에 죽어
// 세션을 못 남겼어도 그 이전 attempt 의 세션 체인을 잇고, 전부 비면 새 세션("").
func TestLastSessionID(t *testing.T) {
	mkRun := func(attempt int32, sid string) muninniov1beta1.HuginnRun {
		var r muninniov1beta1.HuginnRun
		r.Spec.Attempt = attempt
		r.Status.SessionID = sid
		return r
	}
	cases := []struct {
		name string
		runs []muninniov1beta1.HuginnRun
		want string
	}{
		{"빈 목록", nil, ""},
		{"전부 미보고", []muninniov1beta1.HuginnRun{mkRun(1, ""), mkRun(2, "")}, ""},
		{"직전 attempt 우선", []muninniov1beta1.HuginnRun{mkRun(1, "sid-1"), mkRun(2, "sid-2")}, "sid-2"},
		{"직전 미보고 → 한 단계 폴백", []muninniov1beta1.HuginnRun{mkRun(1, "sid-1"), mkRun(2, "")}, "sid-1"},
	}
	for _, tc := range cases {
		if got := lastSessionID(tc.runs); got != tc.want {
			t.Errorf("%s: lastSessionID = %q, want %q", tc.name, got, tc.want)
		}
	}
}

// TestBuildJobTemplateRequireApprovalDefault 은 PR 정책이 없거나 false 면 requireApproval:false 로
// 직렬화됨을 검증한다(HITL 트리거 기본 off — CONTRACT §C1).
func TestBuildJobTemplateRequireApprovalDefault(t *testing.T) {
	agent, issue := testFixtures()
	agent.Spec.Source.PR = nil // PR 정책 미설정 → 승인 게이트 off
	jt := buildJobTemplate(agent, issue, "http://mem", "http://api")
	e, ok := envByName(jt.Env, "MUNINN_GUARDRAILS")
	if !ok {
		t.Fatal("MUNINN_GUARDRAILS env 누락")
	}
	want := `{"maxIterations":3,"maxCostUsd":5,"maxTokens":100000,"requireApproval":false}`
	if e.Value != want {
		t.Errorf("MUNINN_GUARDRAILS = %q, want %q", e.Value, want)
	}
}

// TestRunTimeoutSeconds 는 승인 게이트 유무에 따른 Job activeDeadline(=Run.Spec.TimeoutSeconds) 상향을
// 검증한다(CONTRACT §C-HITL, 리뷰 HIGH). requireApproval=true 면 승인 timeout(90m)+작업예산 이상(7200s)으로,
// 아니면 기본 3600s(60m)여야 한다 — 60~90m 사이 승인이 activeDeadline 에 SIGKILL 당하는 모순 방지.
func TestRunTimeoutSeconds(t *testing.T) {
	agent, _ := testFixtures() // PR.RequireApprovalOnWorkflowChange = true
	if got := runTimeoutSeconds(agent); got != approvalRunTimeoutSeconds {
		t.Errorf("requireApproval=true: timeout = %d, want %d", got, approvalRunTimeoutSeconds)
	}
	// 승인 timeout(env) 이상이어야 SIGKILL 모순이 닫힌다.
	if approvalRunTimeoutSeconds < approvalTimeoutSeconds {
		t.Errorf("approvalRunTimeoutSeconds(%d) 는 approvalTimeoutSeconds(%d) 이상이어야 함",
			approvalRunTimeoutSeconds, approvalTimeoutSeconds)
	}

	agent.Spec.Source.PR = nil // 승인 게이트 off
	if got := runTimeoutSeconds(agent); got != defaultRunTimeoutSeconds {
		t.Errorf("PR 정책 없음: timeout = %d, want %d", got, defaultRunTimeoutSeconds)
	}

	agent.Spec.Source.PR = &muninniov1beta1.PRPolicy{RequireApprovalOnWorkflowChange: false}
	if got := runTimeoutSeconds(agent); got != defaultRunTimeoutSeconds {
		t.Errorf("requireApproval=false: timeout = %d, want %d", got, defaultRunTimeoutSeconds)
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
		Image:        "img:1",
		Env:          []corev1.EnvVar{{Name: "X", Value: "y"}},
		AgentPVCName: "pvc-agent-app",
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
		ps.Volumes[0].PersistentVolumeClaim.ClaimName != "pvc-agent-app" {
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
	// 격리 baseline(§6.2-5): SA 토큰 자동마운트 차단(공격 표면 축소) + 컨테이너 레벨 seccomp.
	if ps.AutomountServiceAccountToken == nil || *ps.AutomountServiceAccountToken {
		t.Error("automountServiceAccountToken 은 false 여야 함(SA Role 미바인딩 — 공격 표면)")
	}
	if c.SecurityContext.SeccompProfile == nil || c.SecurityContext.SeccompProfile.Type != corev1.SeccompProfileTypeRuntimeDefault {
		t.Error("컨테이너 seccompProfile=RuntimeDefault 미설정")
	}

	// AgentPVCName 비면 볼륨/마운트/init 미부착.
	ps2 := expandPodSpec(muninniov1beta1.JobTemplate{Image: "img:2"})
	if len(ps2.Volumes) != 0 || len(ps2.Containers[0].VolumeMounts) != 0 || len(ps2.InitContainers) != 0 {
		t.Error("AgentPVCName 비었는데 볼륨/init 이 부착됨")
	}
}

// TestExpandPodSpecSubPath 는 Issue별 subPath 마운트와 그 디렉토리 선생성 initContainer 를 검증한다(§5.5).
// (TestExpandPodSpec 와 분리 — gocyclo 복잡도 한계 회피, 관심사도 분리.)
func TestExpandPodSpecSubPath(t *testing.T) {
	ps := expandPodSpec(muninniov1beta1.JobTemplate{
		Image: "img:1", AgentPVCName: "pvc-agent-app", AgentSubPath: "issue-7",
	})

	// 메인 컨테이너: 앱 PVC 안 Issue별 하위 경로를 ~/.claude 로 마운트(§5.5 격리).
	mounts := ps.Containers[0].VolumeMounts
	if len(mounts) != 1 || mounts[0].MountPath != claudeMountPath || mounts[0].SubPath != "issue-7" {
		t.Errorf("main volumeMount = %+v, want SubPath=issue-7", mounts)
	}

	// subPath 디렉토리 선생성 initContainer(리뷰 R1): PVC 루트를 agentStoreInitPath 에 (subPath 없이)
	// 마운트하고 AgentSubPath 디렉토리를 mkdir → uid 1000 쓰기 가능 보장.
	if len(ps.InitContainers) != 1 {
		t.Fatalf("initContainers = %d, want 1 (subPath 선생성)", len(ps.InitContainers))
	}
	ic := ps.InitContainers[0]
	if ic.Image != "img:1" {
		t.Errorf("init image = %q, want img:1 (동일 이미지 재사용)", ic.Image)
	}
	if len(ic.VolumeMounts) != 1 || ic.VolumeMounts[0].MountPath != agentStoreInitPath || ic.VolumeMounts[0].SubPath != "" {
		t.Errorf("init volumeMount = %+v (PVC 루트를 subPath 없이 마운트해야 함)", ic.VolumeMounts)
	}
	if e, ok := envByName(ic.Env, "AGENT_HOME_DIR"); !ok || e.Value != agentStoreInitPath+"/issue-7" {
		t.Errorf("init AGENT_HOME_DIR = %+v, want %s/issue-7", ic.Env, agentStoreInitPath)
	}
	if ic.SecurityContext == nil || ic.SecurityContext.AllowPrivilegeEscalation == nil || *ic.SecurityContext.AllowPrivilegeEscalation {
		t.Error("init allowPrivilegeEscalation 은 false 여야 함(비-root 하드닝)")
	}
	// init 리소스 요청 명시(리뷰 R2): LimitRange-strict 네임스페이스 거부/BestEffort QoS 방지.
	if len(ic.Resources.Requests) == 0 {
		t.Error("init container 에 리소스 requests 가 명시돼야 함(LimitRange 대비)")
	}

	// 레거시(PVC 있고 SubPath 비어있음): PVC 루트 마운트(SubPath ""), init 미부착 — 하위호환.
	ps3 := expandPodSpec(muninniov1beta1.JobTemplate{Image: "img:3", AgentPVCName: "pvc-legacy"})
	if len(ps3.Containers[0].VolumeMounts) != 1 || ps3.Containers[0].VolumeMounts[0].SubPath != "" {
		t.Errorf("레거시 SubPath 는 빈값(루트 마운트)이어야 함: %+v", ps3.Containers[0].VolumeMounts)
	}
	if len(ps3.InitContainers) != 0 {
		t.Errorf("레거시(SubPath 빈값)엔 init 미부착이어야 함: %d", len(ps3.InitContainers))
	}
}

// runWithFinishedAt 은 backoffReady 테스트용 실패 Run 픽스처(attempt + finishedAt offset).
func runWithFinishedAt(attempt int32, finishedAgo time.Duration) *muninniov1beta1.HuginnRun {
	run := &muninniov1beta1.HuginnRun{}
	run.Spec.Attempt = attempt
	ft := metav1.NewTime(time.Now().Add(-finishedAgo))
	run.Status.FinishedAt = &ft
	return run
}

// TestBackoffReady 는 재시도 backoff 의 클램프/overflow 가드를 검증한다(리뷰 MEDIUM, 순수 함수).
func TestBackoffReady(t *testing.T) {
	// none 정책: 항상 즉시 ready.
	if _, ready := backoffReady(runWithFinishedAt(3, 0), muninniov1beta1.BackoffPolicy("none")); !ready {
		t.Error("none 정책은 즉시 ready 여야 함")
	}
	// finishedAt nil: 즉시 ready.
	if _, ready := backoffReady(&muninniov1beta1.HuginnRun{}, "exponential"); !ready {
		t.Error("finishedAt nil 은 즉시 ready 여야 함")
	}
	// 큰 attempt(overflow 유발 가능): delay 가 음수가 되지 않고 maxBackoff 이하로 클램프되어야 함.
	// finishedAt 이 방금이면 not-ready, 대기시간은 (0, maxBackoff] 범위.
	wait, ready := backoffReady(runWithFinishedAt(64, 0), "exponential")
	if ready {
		t.Error("방금 끝난 큰 attempt 는 backoff 대기여야 함(overflow 로 즉시 ready 되면 버그)")
	}
	if wait <= 0 || wait > maxBackoff {
		t.Errorf("backoff wait = %v, want (0, %v]", wait, maxBackoff)
	}
	// 충분히 오래 전 종료면 ready.
	if _, ready := backoffReady(runWithFinishedAt(2, maxBackoff+time.Minute), "exponential"); !ready {
		t.Error("maxBackoff 초과 경과면 ready 여야 함")
	}
}

// TestWebhookURLFor 는 status.webhookUrl 이 실 수신 라우트 POST /api/hooks/{app} 와 정합하는지 검증한다(§4.5).
// `/api` 접두가 빠지면 복사한 URL 이 404 가 나므로 회귀 방지로 고정한다.
func TestWebhookURLFor(t *testing.T) {
	// 커스텀 base: /api/hooks/{name} 경로로 발급.
	if got, want := webhookURLFor("https://muninn.example.com", "billing-api"), "https://muninn.example.com/api/hooks/billing-api"; got != want {
		t.Errorf("webhookURLFor(custom) = %q, want %q", got, want)
	}
	// 빈 base: defaultAPIBaseURL 로 폴백하되 경로는 동일하게 /api/hooks/{name}.
	if got, want := webhookURLFor("", "payments"), defaultAPIBaseURL+"/api/hooks/payments"; got != want {
		t.Errorf("webhookURLFor(default) = %q, want %q", got, want)
	}
}
