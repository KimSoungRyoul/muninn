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
	if jt.ClaudePVCName != "pvc-claude-ai-router-svc" {
		t.Errorf("claudePVCName = %q", jt.ClaudePVCName)
	}
	// ClaudeSubPath=Issue 이름: 앱 PVC 안에서 Issue별 ~/.claude 격리(§5.5).
	if jt.ClaudeSubPath != "issue-1" {
		t.Errorf("claudeSubPath = %q, want issue-1", jt.ClaudeSubPath)
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
		// MUNINN_APPROVAL_TIMEOUT: HITL 승인 timeout 단일 소스(초) — web TTL·runner 기본(5400)과 정합(CONTRACT §C-HITL).
		{"MUNINN_APPROVAL_TIMEOUT", "5400"},
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
		Image:         "img:1",
		Env:           []corev1.EnvVar{{Name: "X", Value: "y"}},
		ClaudePVCName: "pvc-claude-app",
		ClaudeSubPath: "issue-7",
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
	// SubPath=Issue 이름: 앱 PVC 안에서 Issue별 하위 경로를 ~/.claude 로 마운트(§5.5 격리).
	if c.VolumeMounts[0].SubPath != "issue-7" {
		t.Errorf("volumeMount.SubPath = %q, want issue-7", c.VolumeMounts[0].SubPath)
	}
	if len(ps.Volumes) != 1 || ps.Volumes[0].PersistentVolumeClaim == nil ||
		ps.Volumes[0].PersistentVolumeClaim.ClaimName != "pvc-claude-app" {
		t.Errorf("PVC volume = %+v", ps.Volumes)
	}
	// subPath 디렉토리 선생성 initContainer(리뷰 R1): PVC 루트를 claudeStoreInitPath 에 (subPath 없이)
	// 마운트하고 ClaudeSubPath 디렉토리를 mkdir 한다 → uid 1000 쓰기 가능 보장.
	if len(ps.InitContainers) != 1 {
		t.Fatalf("initContainers = %d, want 1 (subPath 선생성)", len(ps.InitContainers))
	}
	ic := ps.InitContainers[0]
	if ic.Image != "img:1" {
		t.Errorf("init image = %q, want img:1 (동일 이미지 재사용)", ic.Image)
	}
	if len(ic.VolumeMounts) != 1 || ic.VolumeMounts[0].MountPath != claudeStoreInitPath || ic.VolumeMounts[0].SubPath != "" {
		t.Errorf("init volumeMount = %+v (PVC 루트를 subPath 없이 마운트해야 함)", ic.VolumeMounts)
	}
	if e, ok := envByName(ic.Env, "CLAUDE_HOME_DIR"); !ok || e.Value != claudeStoreInitPath+"/issue-7" {
		t.Errorf("init CLAUDE_HOME_DIR = %+v, want %s/issue-7", ic.Env, claudeStoreInitPath)
	}
	if ic.SecurityContext == nil || ic.SecurityContext.AllowPrivilegeEscalation == nil || *ic.SecurityContext.AllowPrivilegeEscalation {
		t.Error("init allowPrivilegeEscalation 은 false 여야 함(비-root 하드닝)")
	}
	// init 리소스 요청 명시(리뷰 R2): LimitRange-strict 네임스페이스 거부/BestEffort QoS 방지.
	if len(ic.Resources.Requests) == 0 {
		t.Error("init container 에 리소스 requests 가 명시돼야 함(LimitRange 대비)")
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

	// ClaudePVCName 비면 볼륨/마운트/init 미부착.
	ps2 := expandPodSpec(muninniov1beta1.JobTemplate{Image: "img:2"})
	if len(ps2.Volumes) != 0 || len(ps2.Containers[0].VolumeMounts) != 0 || len(ps2.InitContainers) != 0 {
		t.Error("ClaudePVCName 비었는데 볼륨/init 이 부착됨")
	}

	// 레거시 JobTemplate(PVC 있고 SubPath 비어있음): PVC 루트 마운트(SubPath ""), init 미부착 — 하위호환.
	ps3 := expandPodSpec(muninniov1beta1.JobTemplate{Image: "img:3", ClaudePVCName: "pvc-legacy"})
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
