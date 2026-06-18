// huginn-self 런타임 엔트리포인트(설계 §4). 모드:
//
//	run(기본)  env(MUNINN_*)로 자체 Go agent loop 실행 — 비-Claude 모델을 OpenAI 호환 API 로 직접 구동.
//	selftest   API 호출 없이 배선 검증 후 {ok,checks} 출력하고 exit(0/1). claude-code selftest 와 출력 동형(§2.6).
//
// 인증: 모델 API 키는 env(MUNINN_LLM_API_KEY 또는 ANTHROPIC_AUTH_TOKEN, Secret 주입). huginn-self 는
// OAuth 불가 → API 키 필수(§2.1). terminal 보고 1회 보장: 정상/예외/SIGTERM 모든 경로(§2.6).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/KimSoungRyoul/muninn/huginnSelfRuntime/agent"
	"github.com/KimSoungRyoul/muninn/huginnSelfRuntime/llm"
	"github.com/KimSoungRyoul/muninn/huginnSelfRuntime/spi"
)

func logf(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "[huginn-self] "+format+"\n", a...)
}

func env(name string) string { return strings.TrimSpace(os.Getenv(name)) }

func envOr(name, def string) string {
	if v := env(name); v != "" {
		return v
	}
	return def
}

func truthy(name string) bool {
	switch strings.ToLower(env(name)) {
	case "1", "true", "yes":
		return true
	}
	return false
}

func isSelftest(args []string) bool {
	for _, a := range args {
		if a == "selftest" || a == "--selftest" {
			return true
		}
	}
	return truthy("MUNINN_SELFTEST") || env("ANTHROPIC_API_KEY") == "SELFTEST" || env("MUNINN_LLM_API_KEY") == "SELFTEST"
}

func homeDir() string {
	if h := env("HOME"); h != "" {
		return filepath.Join(h, ".huginn")
	}
	if h, err := os.UserHomeDir(); err == nil {
		return filepath.Join(h, ".huginn")
	}
	return "/home/node/.huginn"
}

func llmAPIKey() string {
	if k := env("MUNINN_LLM_API_KEY"); k != "" {
		return k
	}
	return env("ANTHROPIC_AUTH_TOKEN") // 게이트웨이 bearer 토큰 재사용(authStyle=bearer/openai 공용).
}

func parseGuardrails() (maxTurns int, maxBudget float64, requireApproval bool) {
	maxTurns, maxBudget = 12, 0
	raw := env("MUNINN_GUARDRAILS")
	if raw == "" {
		return
	}
	var g struct {
		MaxIterations   int     `json:"maxIterations"`
		MaxCostUsd      float64 `json:"maxCostUsd"`
		RequireApproval bool    `json:"requireApproval"`
	}
	if err := json.Unmarshal([]byte(raw), &g); err != nil {
		logf("WARN: MUNINN_GUARDRAILS 파싱 실패: %v → 기본 한도", err)
		return
	}
	if g.MaxIterations > 0 {
		maxTurns = g.MaxIterations
	}
	return maxTurns, g.MaxCostUsd, g.RequireApproval
}

func secondsEnv(name string, def float64) time.Duration {
	if v := env(name); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return time.Duration(f * float64(time.Second))
		}
	}
	return time.Duration(def * float64(time.Second))
}

func buildConfig() agent.Config {
	maxTurns, maxBudget, reqApproval := parseGuardrails()
	if truthy("MUNINN_REQUIRE_APPROVAL") {
		reqApproval = true
	}
	return agent.Config{
		Goal:            env("MUNINN_GOAL"),
		PRMode:          envOr("MUNINN_PR_MODE", "dry-run"),
		MaxTurns:        maxTurns,
		MaxBudgetUSD:    maxBudget,
		RequireApproval: reqApproval,
		ApprovalTimeout: secondsEnv("MUNINN_APPROVAL_TIMEOUT", 5700),
		ApprovalPoll:    secondsEnv("MUNINN_APPROVAL_POLL_SECONDS", 10),
		ResumeSessionID: env("MUNINN_RESUME_SESSION_ID"),
		HomeDir:         homeDir(),
	}
}

func buildLLM() *llm.Client {
	maxTok := 1024
	if v := env("MUNINN_MAX_OUTPUT_TOKENS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxTok = n
		}
	}
	return &llm.Client{
		BaseURL:   envOr("MUNINN_BASE_URL", env("ANTHROPIC_BASE_URL")),
		Model:     envOr("MUNINN_MODEL", env("ANTHROPIC_MODEL")),
		APIKey:    llmAPIKey(),
		MaxTokens: maxTok,
		HTTP:      &http.Client{},
	}
}

func main() {
	os.Exit(run(os.Args[1:]))
}

// run 은 named return(code)을 쓴다 — recover 가 패닉을 잡았을 때 code 를 1 로 설정해 os.Exit(1) 하기 위함.
// unnamed 이면 패닉 복구 후 zero value(0)가 반환돼 컨테이너가 exit 0 → Job 이 Succeeded 로 오기록된다
// (claude-code runner.py 는 예외 시 1 반환). cross-backend Job 종료 시맨틱(§2.6)을 일치시킨다.
func run(args []string) (code int) {
	if isSelftest(args) {
		return selftest()
	}
	cfg := buildConfig()
	if cfg.Goal == "" {
		logf("ERROR: MUNINN_GOAL is required")
		return 1
	}
	chat := buildLLM()
	if chat.BaseURL == "" || chat.Model == "" || chat.APIKey == "" {
		logf("ERROR: huginn-self 는 MUNINN_BASE_URL·MUNINN_MODEL·모델 API 키(MUNINN_LLM_API_KEY/ANTHROPIC_AUTH_TOKEN)가 필요합니다")
		return 1
	}
	api := spi.NewFromEnv(logf)
	r := agent.New(cfg, api, chat, logf)

	// SIGTERM/SIGINT → ctx 취소 → 루프가 빠져나오고, terminal 보고는 grace 예산 내로 보장한다(§2.6).
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	sigtermBudget := secondsEnv("MUNINN_SIGTERM_REPORT_BUDGET", 20)
	// 패닉 경로에서도 terminal 보고 1회 보장(최후 방어선).
	defer func() {
		if rec := recover(); rec != nil {
			logf("ERROR: panic: %v — terminal 보고", rec)
			r.FinalizeOnAbort(fmt.Sprintf("panic: %v", rec), sigtermBudget)
			code = 1 // 패닉 복구 시 exit 1 — Job 이 Failed 로 닫히게(Succeeded 오기록 방지).
		}
	}()

	exit := r.Run(ctx)
	if ctx.Err() != nil {
		// 취소(SIGTERM/timeout) — 정상 경로에서 terminal 을 못 보냈으면 grace 내로 보장(거절 선점 확인 포함).
		logf("WARN: 취소 감지 — terminal 보고 보장(grace %.0fs)", sigtermBudget.Seconds())
		r.FinalizeOnAbort("cancelled", sigtermBudget)
	}
	return exit
}

// selftest 는 API 호출 없이 배선을 검증한다(§2.6, claude-code selftest 와 출력 동형).
func selftest() int {
	report := map[string]any{"mode": "selftest", "backend": "huginn-self", "ok": true}
	checks := map[string]any{}

	// 1) 운영 CLI 존재(§9 — 슬림 Go + 운영 CLI). 현재 text-only PoC 라 도구 미사용 → 정보성 보고(ok 불변).
	//    read-only→mutating tool 단계(후속) 도입 시 이 체크를 ok=false 로 승격한다.
	for _, tool := range []string{"kubectl", "helm", "argocd", "gh", "git", "jq", "yq"} {
		if p, err := exec.LookPath(tool); err == nil {
			checks[tool] = p
		} else {
			checks[tool] = "absent (tool 단계 전까지 무관)"
		}
	}
	// 2) 범용 인터프리터 부재 검증(§6.2-1 — 공격 표면 축소). 있으면 경고(ok 는 유지).
	absent := map[string]any{}
	for _, t := range []string{"python3", "node", "ruby", "perl"} {
		if _, err := exec.LookPath(t); err != nil {
			absent[t] = "absent(ok)"
		} else {
			absent[t] = "PRESENT(권장 제거)"
		}
	}
	checks["interpreters_absent"] = absent

	// 3) 홈(transcript) 쓰기 가능.
	home := homeDir()
	probe := filepath.Join(home, ".selftest-write-probe")
	if err := os.MkdirAll(home, 0o755); err != nil {
		checks["home_writable"] = "NOT WRITABLE: " + err.Error()
		report["ok"] = false
	} else if err := os.WriteFile(probe, []byte("ok"), 0o644); err != nil {
		checks["home_writable"] = "NOT WRITABLE: " + err.Error()
		report["ok"] = false
	} else {
		_ = os.Remove(probe)
		checks["home_writable"] = home
	}

	// 4) SPI 보고 코드 경로(URL 조립/JSON) — 네트워크 미도달 정상(오프라인 QA).
	c := &spi.Client{APIEndpoint: "http://127.0.0.1:1", RunName: "selftest-run", HTTP: &http.Client{}, Logf: func(string, ...any) {}}
	_ = c.Report(map[string]any{"step": 0, "final": true, "failed": false}, time.Now().Add(300*time.Millisecond))
	checks["report_wiring"] = "ok (code path exercised, network not required)"

	// 5) 설정 가독(run 모드 진입 가능성 — 키 노출 없이 존재만).
	checks["config"] = map[string]any{
		"base_url_set": env("MUNINN_BASE_URL") != "" || env("ANTHROPIC_BASE_URL") != "",
		"model":        envOr("MUNINN_MODEL", env("ANTHROPIC_MODEL")),
		"api_key_set":  llmAPIKey() != "",
		"home":         home,
	}

	report["checks"] = checks
	out, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(out))
	if report["ok"].(bool) {
		return 0
	}
	return 1
}
