// CopilotKit 런타임이 쓰는 Anthropic provider (서버 전용).
//
// muninn 의 자격은 env(Secret)-only 다(루트 CLAUDE.md "Auth is env(Secret)-only").
// agent-runtime 과 동일하게 Claude Code OAuth 토큰(CLAUDE_CODE_OAUTH_TOKEN) 또는
// ANTHROPIC_API_KEY 중 하나를 사용한다.
//
// AI SDK(@ai-sdk/anthropic)는 기본적으로 `x-api-key` 헤더로 인증한다. OAuth 토큰은
// API 키가 아니라 `Authorization: Bearer <token>` + `anthropic-beta: oauth-2025-04-20`
// 으로 인증해야 하므로(실측 확인), custom fetch 로 헤더를 교체한다. ANTHROPIC_API_KEY
// 만 있는 경우엔 그대로 x-api-key 가 나간다.

import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";

const OAUTH_BETA = "oauth-2025-04-20";

/**
 * Claude Code OAuth 토큰.
 * 우선순위: `CLAUDE_CODE_OAUTH_TOKEN`(런타임 Secret `claude-code-oauth-token` → 환경변수,
 * agent-runtime/operator 와 동일한 키) → `CLAUDE_OAUTH_TOKEN`(로컬/dev 셸 환경 fallback).
 */
export function oauthToken(): string | undefined {
  return process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.CLAUDE_OAUTH_TOKEN || undefined;
}

export type CredentialMode = "oauth" | "apikey" | "none";

export function credentialMode(): CredentialMode {
  if (oauthToken()) return "oauth";
  if (process.env.ANTHROPIC_API_KEY) return "apikey";
  return "none";
}

// OAuth 토큰이 있으면 x-api-key 를 제거하고 Bearer + oauth beta 헤더를 주입한다.
// (이미 있던 anthropic-beta 값은 유지하고 oauth 토큰만 합집합으로 추가.)
const oauthFetch: typeof fetch = async (input, init) => {
  const token = oauthToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.delete("x-api-key");
  headers.set("authorization", `Bearer ${token}`);
  const existing = headers.get("anthropic-beta");
  const betas = new Set(
    (existing ? existing.split(",") : []).map((s) => s.trim()).filter(Boolean),
  );
  betas.add(OAUTH_BETA);
  headers.set("anthropic-beta", Array.from(betas).join(","));
  return fetch(input, { ...init, headers });
};

// apiKey: OAuth 모드면 oauthFetch 가 x-api-key 를 지우므로 placeholder. apikey 모드면 실제 키.
export const anthropicProvider: AnthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "oauth-bearer",
  fetch: oauthFetch,
});

// 콘솔 코파일럿 기본 모델.
// Claude Code OAuth(구독) 토큰은 모델별 rate limit 이 있어 Sonnet/Opus 는 다른 사용과
// quota 를 공유하면 429 가 잦다. 콘솔 어시스턴트(도구 호출 + 요약)에는 Haiku 4.5 가
// 충분히 강력하고 빠르며 경합이 적다. 필요 시 COPILOT_MODEL 로 override.
export const COPILOT_MODEL = process.env.COPILOT_MODEL || "claude-haiku-4-5-20251001";
