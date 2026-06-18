package runtimeapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// SPI conformance 층2(Go producer 측, 설계 §8). huginnAgentRuntime 의 Python producer 와 *동일한*
// 골든(golden_report_payloads.json)을 huginn-self Go producer 도 통과시킨다 → 두 백엔드가 같은 Agent→API
// 계약을 만족함을 한 fixture 로 강제한다. 한쪽이 계약을 바꾸면 Python/Go 양쪽 테스트가 동시에 실패한다.

const goldenRelPath = "../../huginnAgentRuntime/agent/conformance/golden_report_payloads.json"

type goldenFile struct {
	Report []struct {
		Name string `json:"name"`
		Args struct {
			Step         int     `json:"step"`
			Cost         float64 `json:"cost"`
			Tokens       int     `json:"tokens"`
			Output       string  `json:"output"`
			Outcome      string  `json:"outcome"`
			Failed       bool    `json:"failed"`
			SessionID    string  `json:"session_id"`
			TerminalKind string  `json:"terminal_kind"`
		} `json:"args"`
		Expect map[string]any `json:"expect"`
	} `json:"report"`
	Recall []struct {
		Name   string           `json:"name"`
		Input  []any            `json:"input"`
		Expect []map[string]any `json:"expect"`
	} `json:"recall"`
}

func canon(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

func loadGolden(t *testing.T) goldenFile {
	t.Helper()
	p, err := filepath.Abs(goldenRelPath)
	if err != nil {
		t.Fatalf("abs path: %v", err)
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("골든 읽기 실패(%s): %v — Python 측과 공유하는 단일 fixture 여야 함", p, err)
	}
	var g goldenFile
	if err := json.Unmarshal(raw, &g); err != nil {
		t.Fatalf("골든 파싱: %v", err)
	}
	return g
}

func TestReportContractMatchesGolden(t *testing.T) {
	g := loadGolden(t)
	if len(g.Report) == 0 {
		t.Fatal("골든 report 케이스 없음")
	}
	for _, c := range g.Report {
		t.Run(c.Name, func(t *testing.T) {
			// 골든 report 케이스는 모두 terminal(final:true).
			got := BuildReportPatch(c.Args.Step, c.Args.Cost, c.Args.Tokens, c.Args.Output,
				c.Args.Outcome, true, c.Args.Failed, c.Args.SessionID, c.Args.TerminalKind)
			if canon(t, got) != canon(t, c.Expect) {
				t.Errorf("report 계약 불일치\n got=%s\nwant=%s", canon(t, got), canon(t, c.Expect))
			}
		})
	}
}

func TestRecallContractMatchesGolden(t *testing.T) {
	g := loadGolden(t)
	if len(g.Recall) == 0 {
		t.Fatal("골든 recall 케이스 없음")
	}
	for _, c := range g.Recall {
		t.Run(c.Name, func(t *testing.T) {
			got := BuildRecallPayload(c.Input)
			if canon(t, got) != canon(t, c.Expect) {
				t.Errorf("recall 계약 불일치\n got=%s\nwant=%s", canon(t, got), canon(t, c.Expect))
			}
		})
	}
}

func TestReportPatchInvariants(t *testing.T) {
	// output 8000 rune 캡.
	long := make([]rune, 9000)
	for i := range long {
		long[i] = 'x'
	}
	p := BuildReportPatch(0, 0, 0, string(long), "", true, false, "", "")
	if got := len([]rune(p["output"].(string))); got != 8000 {
		t.Errorf("output rune 캡 = %d, want 8000", got)
	}
	// cost 소수 4자리.
	p = BuildReportPatch(0, 1.23456, 0, "", "", true, false, "", "")
	if p["cost"] != "1.2346" {
		t.Errorf("cost = %v, want 1.2346", p["cost"])
	}
	// terminalKind 화이트리스트 밖 → 미포함.
	p = BuildReportPatch(0, 0, 0, "", "", true, true, "", "evil")
	if _, ok := p["terminalKind"]; ok {
		t.Error("evil terminalKind 가 포함됨(화이트리스트 위반)")
	}
	// 진행 보고(final:false).
	p = BuildReportPatch(2, 0, 5, "", "", false, false, "sess-1", "")
	if p["final"] != false || p["sessionId"] != "sess-1" {
		t.Errorf("진행 보고 patch 불일치: %v", p)
	}
}
