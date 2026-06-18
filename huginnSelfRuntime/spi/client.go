// Package spi 는 Agent→API/메모리 HTTP 계약(설계 §8)을 stdlib 로 구현한다. runner.py 의 _http_json/
// _report/_recall/_store_memory/_poll_approval 과 동형 — report 는 멱등·재시도, terminal 은 더 끈질기게,
// recall/store 는 fail-open(실패해도 루프를 막지 않음).
package spi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Client 는 Muninn API/메모리 엔드포인트로의 보고/회상/저장/승인 폴링을 담당한다.
type Client struct {
	APIEndpoint    string
	MemoryEndpoint string
	RunName        string
	IssueName      string
	AgentName      string
	Workspace      string
	APIToken       string
	HTTP           *http.Client
	Logf           func(string, ...any)
}

func env(name string) string { return strings.TrimSpace(os.Getenv(name)) }

// NewFromEnv 는 MUNINN_* env 에서 Client 를 구성한다(operator 주입 계약, 설계 §2.1).
func NewFromEnv(logf func(string, ...any)) *Client {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Client{
		APIEndpoint:    env("MUNINN_API_ENDPOINT"),
		MemoryEndpoint: env("MUNINN_MEMORY_ENDPOINT"),
		RunName:        env("MUNINN_RUN_NAME"),
		IssueName:      env("MUNINN_ISSUE_NAME"),
		AgentName:      env("MUNINN_AGENT_NAME"),
		Workspace:      env("MUNINN_WORKSPACE"),
		APIToken:       env("MUNINN_API_TOKEN"),
		HTTP:           &http.Client{},
		Logf:           logf,
	}
}

// httpJSON 은 JSON 요청 후 응답(map)을 반환한다. 실패해도 루프를 막지 않도록 에러를 반환만 한다.
// retries 는 *추가* 재시도(총 시도 = retries+1). deadline 이 0 이 아니면 잔여 예산으로 per-attempt
// timeout 을 캡한다(SIGTERM grace 내 terminal 보고용, runner.py 동형).
func (c *Client) httpJSON(method, url string, body any, retries int, deadline time.Time) (map[string]any, error) {
	if url == "" {
		return nil, nil
	}
	var payload []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		payload = b
	}
	attempts := retries + 1
	if attempts < 1 {
		attempts = 1
	}
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		timeout := 10 * time.Second
		if !deadline.IsZero() {
			remaining := time.Until(deadline)
			if remaining <= 0 {
				c.Logf("WARN: HTTP %s %s deadline 초과 — 재시도 중단", method, url)
				break
			}
			if remaining < timeout {
				timeout = remaining
			}
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(payload))
		if err != nil {
			cancel()
			return nil, err
		}
		req.Header.Set("content-type", "application/json")
		if c.APIToken != "" {
			req.Header.Set("authorization", "Bearer "+c.APIToken)
		}
		resp, err := c.HTTP.Do(req)
		if err == nil {
			raw, _ := io.ReadAll(resp.Body)
			status := resp.StatusCode
			resp.Body.Close()
			cancel()
			// 비-2xx 는 실패로 취급한다(net/http 는 4xx/5xx 라도 err==nil — runner.py urllib 은 HTTPError raise).
			// 이 검사가 없으면 5xx + 유효 JSON 이 '성공'으로 처리되어 terminal 보고 재시도가 누락되고
			// Report 가 거짓 성공(true)을 반환해 incident 가 running 에 고착된다(SPI §2.6 exactly-once 도달 위반).
			if status/100 != 2 {
				lastErr = fmt.Errorf("HTTP %d: %s", status, truncateStr(string(raw), 300))
			} else {
				if len(raw) == 0 {
					raw = []byte("{}")
				}
				var out map[string]any
				if jerr := json.Unmarshal(raw, &out); jerr != nil {
					lastErr = jerr
				} else {
					return out, nil
				}
			}
		} else {
			cancel()
			lastErr = err
		}
		if attempt+1 < attempts {
			backoff := time.Duration(500*(1<<attempt)) * time.Millisecond
			if backoff > 8*time.Second {
				backoff = 8 * time.Second
			}
			if !deadline.IsZero() && time.Until(deadline)-backoff <= 0 {
				c.Logf("WARN: HTTP %s %s 실패 → deadline 임박, 재시도 중단: %v", method, url, lastErr)
				break
			}
			c.Logf("WARN: HTTP %s %s 실패(시도 %d/%d): %v → %.1fs 후 재시도", method, url, attempt+1, attempts, lastErr, backoff.Seconds())
			time.Sleep(backoff)
		}
	}
	c.Logf("WARN: HTTP %s %s 최종 실패: %v", method, url, lastErr)
	return nil, lastErr
}

// Report 는 진행/terminal 보고를 POST 한다(Agent→API 소유 필드). terminal(final:true)은 더 끈질기게
// 재시도하고, deadline 이 주어지면 그 예산 내로 제한한다. 반환값은 API 도달 성공 여부.
func (c *Client) Report(patch map[string]any, deadline time.Time) bool {
	if c.APIEndpoint == "" || c.RunName == "" {
		return false
	}
	if c.IssueName != "" {
		if _, ok := patch["issueName"]; !ok {
			patch["issueName"] = c.IssueName
		}
	}
	retries := 1
	if f, _ := patch["final"].(bool); f {
		retries = 4
	}
	url := fmt.Sprintf("%s/api/runs/%s/report", strings.TrimRight(c.APIEndpoint, "/"), c.RunName)
	res, _ := c.httpJSON("POST", url, patch, retries, deadline)
	return res != nil
}

// Recall 은 위임 직전 회상한다(fail-open: 실패 시 빈 슬라이스).
func (c *Client) Recall(query string, k int) []any {
	if c.MemoryEndpoint == "" || query == "" {
		return nil
	}
	body := map[string]any{"query": query, "k": k}
	if c.AgentName != "" {
		body["app"] = c.AgentName
	}
	if c.Workspace != "" {
		body["workspace"] = c.Workspace
	}
	url := fmt.Sprintf("%s/api/memories/recall", strings.TrimRight(c.MemoryEndpoint, "/"))
	res, _ := c.httpJSON("POST", url, body, 2, time.Time{})
	if res == nil {
		return nil
	}
	items, _ := res["items"].([]any)
	return items
}

// StoreMemory 는 결과를 기억화한다(fail-open).
func (c *Client) StoreMemory(fact string, tags []string) {
	if c.MemoryEndpoint == "" || fact == "" {
		return
	}
	body := map[string]any{
		"fact": fact, "tags": tags, "changedBy": "agent",
	}
	if c.RunName != "" {
		body["sourceRunId"] = c.RunName
	}
	if c.AgentName != "" {
		body["app"] = c.AgentName
		body["appName"] = c.AgentName
		body["scope"] = "app"
	} else {
		body["scope"] = "global"
	}
	if c.Workspace != "" {
		body["workspace"] = c.Workspace
	}
	url := fmt.Sprintf("%s/api/memories", strings.TrimRight(c.MemoryEndpoint, "/"))
	_, _ = c.httpJSON("POST", url, body, 1, time.Time{})
}

// RequestApproval 은 위험 작업 전 승인 요청을 보고한다(CONTRACT §3). 이중 적재(requestApproval + 상위 키).
func (c *Client) RequestApproval(reasons []map[string]any) {
	if c.APIEndpoint == "" || c.RunName == "" {
		return
	}
	patch := map[string]any{
		"requestApproval":  map[string]any{"reasons": reasons},
		"approvalReasons":  reasons,
	}
	url := fmt.Sprintf("%s/api/runs/%s/report", strings.TrimRight(c.APIEndpoint, "/"), c.RunName)
	_, _ = c.httpJSON("POST", url, patch, 1, time.Time{})
}

// ApprovalState 는 GET /api/runs/{run} 에서 approval.state 를 방어적으로 추출한다(평탄 RunVM / 중첩 CR 둘 다).
func (c *Client) ApprovalState(deadline time.Time) string {
	if c.APIEndpoint == "" || c.RunName == "" {
		return ""
	}
	url := fmt.Sprintf("%s/api/runs/%s", strings.TrimRight(c.APIEndpoint, "/"), c.RunName)
	retries := 2
	if !deadline.IsZero() {
		retries = 0
	}
	res, _ := c.httpJSON("GET", url, nil, retries, deadline)
	return parseApprovalState(res)
}

func truncateStr(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func parseApprovalState(obj map[string]any) string {
	if obj == nil {
		return ""
	}
	approval, ok := obj["approval"]
	if !ok {
		if status, ok := obj["status"].(map[string]any); ok {
			approval = status["approval"]
		}
	}
	switch v := approval.(type) {
	case string:
		return v
	case map[string]any:
		if s, ok := v["state"].(string); ok {
			return s
		}
	}
	return ""
}
