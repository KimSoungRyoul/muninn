// Package runtimeapi 는 Agent→API 보고/회상 페이로드의 순수 DTO·빌더다(SPI 계약, operator-design §2.2a).
//
// 이 빌더들은 huginnAgentRuntime/agent/runner.py 의 build_report_patch / build_recall_payload 와
// 바이트 동형이어야 한다 — 같은 골든(huginnAgentRuntime/agent/conformance/golden_report_payloads.json)을
// Python producer 와 Go producer 가 동시에 통과해 cross-language drift 를 닫는다(codegen 부재 → conformance
// 가 단일 방어선, 설계 §4.5). k8s import 없음(Q5).
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
		id, ok := m["id"]
		if !ok || id == nil || id == "" {
			continue
		}
		item := map[string]any{"id": id}
		if s, ok := m["score"]; ok && s != nil {
			item["score"] = scoreToString(s)
		}
		out = append(out, item)
	}
	return out
}

// scoreToString 은 Python str(score) 와 동일하게 score 를 문자열화한다. JSON 수치는 float64 로 들어오며
// 정수값(예: 3.0)은 "3" 으로(불필요한 .0 제거), 그 외는 최소 자리수로 표현한다.
func scoreToString(s any) string {
	if f, ok := s.(float64); ok {
		if f == float64(int64(f)) {
			return fmt.Sprintf("%d", int64(f))
		}
		return fmt.Sprintf("%g", f)
	}
	return fmt.Sprintf("%v", s)
}
