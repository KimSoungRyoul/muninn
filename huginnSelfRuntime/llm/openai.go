// Package llm 은 huginn-self 가 모델 API 를 직접 호출하는 클라이언트다(설계 §4.4). huginn-self 의 본령은
// 비-Anthropic 프로토콜(OpenAI 호환 /chat/completions) 직접 구동 — claude CLI 를 거치지 않는다. 순수 stdlib.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Message 는 chat 메시지(role: system|user|assistant).
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Usage 는 토큰 사용량(§2.3a — tokens 채움).
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ChatResult 는 한 turn 의 응답.
type ChatResult struct {
	Content      string
	FinishReason string
	Usage        Usage
}

// Client 는 OpenAI 호환 /chat/completions 클라이언트.
type Client struct {
	BaseURL   string
	Model     string
	APIKey    string
	MaxTokens int
	HTTP      *http.Client
}

// Chat 은 messages 로 한 turn 을 완성한다. base URL 은 게이트웨이 루트(예: https://llm-gateway.example.com),
// 경로는 /chat/completions 를 붙인다. 인증은 Authorization: Bearer(authStyle=openai/bearer).
func (c *Client) Chat(ctx context.Context, messages []Message) (ChatResult, error) {
	if c.BaseURL == "" || c.Model == "" {
		return ChatResult{}, fmt.Errorf("llm: BaseURL/Model 미설정")
	}
	maxTokens := c.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 1024
	}
	reqBody := map[string]any{
		"model":      c.Model,
		"messages":   messages,
		"max_tokens": maxTokens,
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return ChatResult{}, err
	}
	url := strings.TrimRight(c.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	if err != nil {
		return ChatResult{}, err
	}
	req.Header.Set("content-type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("authorization", "Bearer "+c.APIKey)
	}
	httpc := c.HTTP
	if httpc == nil {
		httpc = http.DefaultClient
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return ChatResult{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return ChatResult{}, fmt.Errorf("llm: HTTP %d: %s", resp.StatusCode, truncate(string(body), 300))
	}
	var parsed struct {
		Choices []struct {
			Message      Message `json:"message"`
			FinishReason string  `json:"finish_reason"`
		} `json:"choices"`
		Usage Usage `json:"usage"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ChatResult{}, fmt.Errorf("llm: 응답 파싱: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return ChatResult{}, fmt.Errorf("llm: choices 비어있음: %s", truncate(string(body), 300))
	}
	return ChatResult{
		Content:      parsed.Choices[0].Message.Content,
		FinishReason: parsed.Choices[0].FinishReason,
		Usage:        parsed.Usage,
	}, nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
