// Package agent 는 huginn-self 의 실행 루프다(설계 §4.5). SPI 종료/보고 행위를 최우선으로 구현한다:
// terminal 보고 정확히 1회(정상/예외/SIGTERM/HITL 거절 모든 경로) · 진행 보고 · recall/store(fail-open) ·
// HITL 승인 게이트 · dry-run PR · sessionId 생성+transcript(resume preflight). 현재 text-only(도구 루프는
// 후속 — read-only→mutating). claude-code 백엔드와 동일 SPI 를 만족한다(conformance 골든 기준).
package agent

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/KimSoungRyoul/muninn/huginnSelfRuntime/internal/strutil"
	"github.com/KimSoungRyoul/muninn/huginnSelfRuntime/llm"
	"github.com/KimSoungRyoul/muninn/huginnSelfRuntime/runtimeapi"
	"github.com/KimSoungRyoul/muninn/huginnSelfRuntime/spi"
)

// Config 는 env 에서 파생된 실행 설정.
type Config struct {
	Goal            string
	PRMode          string // dry-run(기본) | live
	MaxTurns        int
	MaxBudgetUSD    float64
	RequireApproval bool
	ApprovalTimeout time.Duration
	ApprovalPoll    time.Duration
	ResumeSessionID string
	HomeDir         string // 에이전트 홈(기본 ~/.huginn) — transcript 영속(§2.4)
}

// Runner 는 한 Run 의 상태를 들고 루프를 돈다.
type Runner struct {
	cfg  Config
	api  *spi.Client
	chat *llm.Client
	logf func(string, ...any)

	sessionID   string
	step        int
	cost        float64
	tokens      int
	lastText    string
	lastOutcome string // sendFinal 이 계산한 outcome — emitResultLine 의 stdout 결과 라인과 일치시킴(관측성).
	finalSent   bool
}

// New 는 Runner 를 만든다.
func New(cfg Config, api *spi.Client, chat *llm.Client, logf func(string, ...any)) *Runner {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Runner{cfg: cfg, api: api, chat: chat, logf: logf}
}

func newSessionID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "sess-fallback"
	}
	return "sess-" + hex.EncodeToString(b)
}

// transcriptPath 는 세션 transcript 경로(§2.4, huginn-self 홈 = ~/.huginn/sessions/<id>.jsonl).
func (r *Runner) transcriptPath(id string) string {
	return filepath.Join(r.cfg.HomeDir, "sessions", id+".jsonl")
}

// hasTranscript 는 resume preflight(§2.5): 대상 세션 transcript 가 실재하는지. 없으면 새 세션 폴백.
func (r *Runner) hasTranscript(id string) bool {
	if id == "" {
		return false
	}
	_, err := os.Stat(r.transcriptPath(id))
	return err == nil
}

// appendTranscript 는 turn 메시지를 JSONL 로 append 한다(§2.5 — 매 turn 저장, resume 시 replay 가능).
func (r *Runner) appendTranscript(msg llm.Message) {
	p := r.transcriptPath(r.sessionID)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		r.logf("WARN: transcript 디렉토리 생성 실패(무시): %v", err)
		return
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		r.logf("WARN: transcript 열기 실패(무시): %v", err)
		return
	}
	defer f.Close()
	line, _ := json.Marshal(msg)
	_, _ = f.Write(append(line, '\n'))
}

func (r *Runner) systemPrompt() string {
	base := "당신은 Huginn DevOps 에이전트입니다. 주어진 운영 이벤트(goal)를 진단하고, 허용된 도구만 " +
		"사용하며, 출력 정책에 따라 결과를 만듭니다. 안전 한도(guardrails)를 절대 넘지 마세요."
	if r.cfg.PRMode == "dry-run" {
		base += " [DRY-RUN 모드] 실제 PR/Issue 를 만들지 말고, 제안 변경을 PR 계획(제목/요약/diff)으로 " +
			"마지막 메시지에 정리하세요. 이 계획이 결과로 보고됩니다."
	}
	return base
}

// approvalReasons 는 승인 요청 사유를 구성한다(최소 1건, CONTRACT §3).
func (r *Runner) approvalReasons() []map[string]any {
	summary := firstNonEmptyLine(r.cfg.Goal)
	if summary == "" {
		summary = "위험 작업(변경 적용) 전 운영자 승인 필요"
	}
	detail := fmt.Sprintf("[%s] %s — 구체 변경은 승인 후 산출됩니다.", r.cfg.PRMode, summary)
	if len(detail) > 300 {
		detail = detail[:300]
	}
	return []map[string]any{{"type": "infra-change", "detail": detail}}
}

// gateApproval 은 위험 작업 직전 HITL 게이트(CONTRACT §3). 반환 outcome:
//
//	"" → 승인됨/불필요 → 계속.  "rejected: …"/"expired"/"approval-timeout" → 정상 중단.
//
// Q7: web TTL 이 만료 권위 — runner 타임아웃(MUNINN_APPROVAL_TIMEOUT=web TTL+grace)보다 web 의 Expired 가
// 먼저 관측되어 terminalKind=expired 가 결정적. wall-clock 타임아웃은 web 미표면화 시 백스톱("aborted").
func (r *Runner) gateApproval(ctx context.Context) string {
	r.api.RequestApproval(r.approvalReasons())
	deadline := time.Now().Add(r.cfg.ApprovalTimeout)
	r.logf("승인 폴링 시작: 간격 %.0fs, 타임아웃 %.0fs", r.cfg.ApprovalPoll.Seconds(), r.cfg.ApprovalTimeout.Seconds())
	for {
		select {
		case <-ctx.Done():
			return "sigterm" // SIGTERM/취소 — Run 이 sendFinal 하지 말고 main 의 FinalizeOnAbort(거절 선점 확인)에 위임.
		default:
		}
		switch r.api.ApprovalState(time.Time{}) {
		case "Approved":
			return ""
		case "Rejected":
			return "rejected"
		case "Expired":
			return "expired"
		}
		if time.Now().After(deadline) {
			return "approval-timeout"
		}
		select {
		case <-ctx.Done():
			return "sigterm"
		case <-time.After(r.cfg.ApprovalPoll):
		}
	}
}

func gateTerminalKind(outcome string) string {
	switch {
	case strings.HasPrefix(outcome, "rejected"):
		return "rejected"
	case outcome == "expired":
		return "expired"
	case outcome == "approval-timeout":
		return "aborted"
	}
	return ""
}

// sendFinal 은 terminal 보고(final:true)를 정확히 1회 전송한다(SPI 의무). 반환: API 도달 성공 여부.
func (r *Runner) sendFinal(failed bool, abortReason, outcomeOverride, terminalKind string, deadline time.Time) bool {
	if r.finalSent {
		return true
	}
	r.finalSent = true
	output := strings.TrimSpace(r.lastText)
	outcome := outcomeOverride
	if outcome == "" {
		if !failed && output != "" {
			title := firstNonEmptyLine(output)
			if len(title) > 80 {
				title = title[:80]
			}
			if r.cfg.PRMode == "dry-run" {
				outcome = "DRY-RUN PR: " + title
			} else {
				outcome = title
			}
		}
	}
	if abortReason != "" && outcome == "" {
		outcome = "aborted: " + abortReason
	}
	r.lastOutcome = outcome // emitResultLine 이 stdout 결과 라인에 동일 outcome 을 싣도록 보관(관측성).
	patch := runtimeapi.BuildReportPatch(r.step, r.cost, r.tokens, output, outcome, true, failed, r.sessionID, terminalKind)
	ok := r.api.Report(patch, deadline)
	if !ok {
		r.logf("ERROR: 최종 보고 전송 실패 — 결과가 API 에 기록되지 않았을 수 있음")
	}
	return ok
}

// Run 은 루프를 돈다. 반환: 종료 코드. terminal 보고는 어떤 경로에서도 1회 보장(호출부 defer + 내부 guard).
func (r *Runner) Run(ctx context.Context) int {
	// 1) 세션 ID(§2.4/§2.5): resume preflight — transcript 실재 시 이어쓰기, 없으면 새 세션.
	if r.cfg.ResumeSessionID != "" && r.hasTranscript(r.cfg.ResumeSessionID) {
		r.sessionID = r.cfg.ResumeSessionID
		r.logf("session: %s (resumed)", r.sessionID)
	} else {
		if r.cfg.ResumeSessionID != "" {
			r.logf("WARN: resume 대상 transcript 미발견(%s) → 새 세션", r.cfg.ResumeSessionID)
		}
		r.sessionID = newSessionID()
		r.logf("session: %s", r.sessionID)
	}
	// 세션 ID 를 즉시 보고(다음 attempt resume 용).
	r.api.Report(map[string]any{"step": r.step, "sessionId": r.sessionID}, time.Time{})

	// 2) 회상(fail-open).
	recalled := r.api.Recall(r.cfg.Goal, 6)
	r.api.Report(map[string]any{"step": 0, "recalledMemoryIds": runtimeapi.BuildRecallPayload(recalled)}, time.Time{})

	// 3) HITL 게이트(위험 작업 전). 거절/만료/타임아웃 → 정상 중단(failed=false except timeout 백스톱).
	if r.cfg.RequireApproval {
		outcome := r.gateApproval(ctx)
		if outcome == "sigterm" {
			// SIGTERM/취소: sendFinal 을 여기서 하지 않는다 — main 의 FinalizeOnAbort 가 거절 선점(suspend→
			// SIGTERM 으로 reject 가 폴링을 선점했을 수 있음)을 1회 확인한 뒤 terminalKind=rejected|aborted 로
			// 보고한다(ctx.Err()!=nil 경로). 여기서 곧장 aborted 로 보고하면 거절을 'aborted' 로 오기록한다.
			r.logf("승인 게이트 중 취소(SIGTERM) → FinalizeOnAbort 에 위임")
			return 1
		}
		if outcome != "" {
			tk := gateTerminalKind(outcome)
			r.sendFinal(false, "", outcome, tk, time.Time{})
			r.logf("종료(승인 게이트): outcome=%q terminalKind=%q", outcome, tk)
			r.emitResultLine(true)
			return 0
		}
	}

	// 4) 메시지 구성 + 모델 호출(text-only). 도구 루프(read-only→mutating)는 후속.
	messages := []llm.Message{{Role: "system", Content: r.systemPrompt()}}
	prompt := r.cfg.Goal
	if len(recalled) > 0 {
		var facts []string
		for _, m := range recalled {
			if mm, ok := m.(map[string]any); ok {
				if f, ok := mm["fact"].(string); ok {
					facts = append(facts, "- "+f)
				}
			}
		}
		if len(facts) > 0 {
			prompt = r.cfg.Goal + "\n\n[회상된 Muninn 메모리(참고)]\n" + strings.Join(facts, "\n")
		}
	}
	messages = append(messages, llm.Message{Role: "user", Content: prompt})
	for _, m := range messages {
		r.appendTranscript(m)
	}

	// 주의(PoC): MaxBudgetUSD 는 아직 *집행하지 않는다* — 게이트웨이가 per-call cost 를 안 주면 추정이 필요한데
	// text-only PoC 범위 밖이다(cost 는 0 으로 보고). 도구 루프 단계에서 토큰×단가 추정으로 집행 예정(§2.3a).
	r.logf("live 시작: max_turns=%d, max_budget_usd=%v(미집행, PoC), pr_mode=%s, model=%s, goal=%q",
		r.cfg.MaxTurns, r.cfg.MaxBudgetUSD, r.cfg.PRMode, r.chat.Model, strutil.Truncate(r.cfg.Goal, 120))

	res, err := r.chat.Chat(ctx, messages)
	if err != nil {
		if ctx.Err() != nil {
			// SIGTERM/취소 — terminal 보고는 main 의 defer 가 grace 예산으로 보낸다.
			r.logf("WARN: 취소됨(SIGTERM/timeout): %v", err)
			return 1
		}
		r.logf("ERROR: 모델 호출 실패: %v", err)
		r.sendFinal(true, fmt.Sprintf("exception: %v", err), "", "", time.Time{})
		r.emitResultLine(false)
		return 1
	}
	r.step++
	r.tokens = res.Usage.TotalTokens
	r.lastText = res.Content
	r.appendTranscript(llm.Message{Role: "assistant", Content: res.Content})
	r.logf("assistant: %s", strutil.Truncate(res.Content, 200))
	r.api.Report(map[string]any{"step": r.step, "cost": fmt.Sprintf("%.4f", r.cost), "tokens": r.tokens}, time.Time{})

	// 5) terminal 보고 + 기억화(성공 시).
	ok := r.sendFinal(false, "", "", "", time.Time{})
	output := strings.TrimSpace(r.lastText)
	if ok && output != "" {
		fact := output
		if len([]rune(fact)) > 600 {
			fact = string([]rune(fact)[:600]) + " …"
		}
		tags := []string{"result"}
		if r.cfg.PRMode == "dry-run" {
			tags = []string{"dry-run", "pr-plan"}
		}
		r.api.StoreMemory(fact, tags)
	}
	r.emitResultLine(true)
	return 0
}

// FinalizeOnAbort 는 main 의 SIGTERM/패닉 경로에서 terminal 보고를 grace 예산 내로 보장한다(거절 선점 확인 포함).
func (r *Runner) FinalizeOnAbort(reason string, budget time.Duration) {
	if r.finalSent {
		return
	}
	deadline := time.Now().Add(budget)
	// 거절 선점(CONTRACT 항목1): suspend→SIGTERM 이 승인 폴링을 선점했을 수 있으므로 terminal 전 1회 확인.
	if r.api.ApprovalState(deadline) == "Rejected" {
		r.sendFinal(false, "", "rejected", "rejected", deadline)
		r.logf("취소 직전 조회: Rejected → terminalKind=rejected")
		return
	}
	r.sendFinal(true, reason, "", "aborted", deadline)
}

// emitResultLine 은 stdout 결과 라인을 낸다. outcome 은 sendFinal 이 계산해 둔 r.lastOutcome 를 쓴다
// (보고 patch 의 outcome 과 stdout 라인이 일치 — 관측성, Python runner 의 최종 JSON 라인과 동형).
func (r *Runner) emitResultLine(ok bool) {
	line := map[string]any{
		"mode": "live", "ok": ok, "tokens": r.tokens, "cost_usd": r.cost,
		"outcome": r.lastOutcome, "session_id": r.sessionID, "pr_mode": r.cfg.PRMode,
		"backend": "huginn-self",
	}
	b, _ := json.Marshal(line)
	fmt.Println(string(b))
}

// firstNonEmptyLine 은 첫 비어있지 않은 줄을 양끝의 '#'/공백을 떼어 반환한다(Python strip('# ') 와 동형).
func firstNonEmptyLine(s string) string {
	for _, ln := range strings.Split(s, "\n") {
		t := strings.TrimSpace(strings.Trim(ln, "# "))
		if t != "" {
			return t
		}
	}
	return ""
}
