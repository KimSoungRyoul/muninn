// Package runtimeapi 는 Agent→API 보고/회상 페이로드의 순수 DTO·빌더다(SPI 계약, operator-design §2.2a).
//
// 이 빌더들은 huginnAgentRuntime/agent/runner.py 의 build_report_patch / build_recall_payload 와
// 바이트 동형이어야 한다 — 같은 골든(huginnAgentRuntime/agent/conformance/golden_report_payloads.json)을
// Python producer(runner)와 Go producer(huginn-self)가 동시에 통과해 cross-language *producer* drift 를
// 닫는다(codegen 부재 → conformance 가 producer 측 방어선, §4.5). muninnWeb report route(consumer) 검증은
// 후속. k8s import 없음(Q5).
package runtimeapi

import "fmt"

// BuildReportPatch 는 terminal/진행 보고 patch 를 조립한다(SPI 계약). 순수 함수.
//
// 계약 불변식(web report route / runner.py 와 동일):
//   - cost 는 소수 4자리 decimal 문자열.
//   - output 은 8000 *문자*(rune) 캡 — Python [:8000] 과 동일 시맨틱(바이트 아님).
//   - sessionId 는 비어있지 않을 때만 포함.
//   - terminalKind 는 화이트리스트 {rejected,expired,aborted} 외 값은 싣지 않는다.
//
// final 인자로 terminal(true)/진행(false) 보고를 구분한다(진행 보고는 final 키 false).
func BuildReportPatch(step int, cost float64, tokens int, output, outcome string, final, failed bool,
	sessionID, terminalKind string) map[string]any {
	out := output
	if r := []rune(output); len(r) > 8000 {
		out = string(r[:8000])
	}
	patch := map[string]any{
		"step":    step,
		"cost":    fmt.Sprintf("%.4f", cost),
		"tokens":  tokens,
		"output":  out,
		"outcome": outcome,
		"final":   final,
		"failed":  failed,
	}
	if sessionID != "" {
		patch["sessionId"] = sessionID
	}
	switch terminalKind {
	case "rejected", "expired", "aborted":
		patch["terminalKind"] = terminalKind
	}
	return patch
}

// BuildRecallPayload 는 recall 결과를 recalledMemoryIds 페이로드로 변환한다(SPI 계약). 순수 함수.
// 각 항목은 {id, score?}. id 없는/비-맵 항목은 제외, score 는 문자열로 직렬화하되 nil 이면 키 생략.
func BuildRecallPayload(recalled []any) []map[string]any {
	out := []map[string]any{}
	for _, e := range recalled {
		m, ok := e.(map[string]any)
		if !ok {
			continue
		}
		// Python build_recall_payload 의 `if m.get("id")` 와 동형: falsy id(없음/nil/""/0/false)는 drop.
		if id, ok := m["id"]; !ok || isFalsyID(id) {
			continue
		}
		item := map[string]any{"id": m["id"]}
		if s, ok := m["score"]; ok && s != nil {
			item["score"] = scoreToString(s)
		}
		out = append(out, item)
	}
	return out
}

// isFalsyID 는 Python truthiness 와 동형으로 id 의 falsy 여부를 판정한다(없음/nil/""/0/false → drop).
func isFalsyID(id any) bool {
	switch v := id.(type) {
	case nil:
		return true
	case string:
		return v == ""
	case float64:
		return v == 0
	case bool:
		return !v
	}
	return false
}

// scoreToString 은 Python str(float) 와 동형으로 score 를 문자열화한다. JSON 수치는 float64 로 들어오며,
// 정수값 float(예: 1.0)은 ".0" 을 유지해(Python str(1.0)=="1.0") cross-language 계약을 맞추고,
// 그 외는 최단 표현(%g, Python str(0.9)=="0.9")을 쓴다. (계약 한계: 점수는 float 전제 — JSON 정수 리터럴
// score 는 Go 가 항상 float64 로 파싱하므로 Python int 와 갈릴 수 있어 골든은 float 점수만 사용한다.)
func scoreToString(s any) string {
	if f, ok := s.(float64); ok {
		if f == float64(int64(f)) {
			return fmt.Sprintf("%d.0", int64(f))
		}
		return fmt.Sprintf("%g", f)
	}
	return fmt.Sprintf("%v", s)
}
