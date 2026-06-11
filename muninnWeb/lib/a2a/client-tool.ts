// V1 — 코파일럿을 A2A 클라이언트로. 설계: docs/design/muninn-a2a-integration.md §4(V1).
// 외부/내부 A2A 에이전트에 작업을 위임하는 server tool. lib/copilot-tools.ts 에 플래그(MUNINN_A2A_ENABLED)로 합류.
// CopilotKit 의 a2a 미들웨어에 의존하지 않고 fetch 기반 JSON-RPC(message/send)로 직접 호출 — 버전 무관하게 동작.

import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";
import type { JsonRpcRequest } from "./types";

function mid(): string {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// SSRF/토큰유출 가드(fail-closed): 임의 URL 로 bearer 를 흘리지 않는다.
// - A2A_ALLOWED_HOSTS(쉼표구분 host 또는 host:port) allowlist 에 있는 대상만 허용(로컬 데모는 localhost:4010 추가).
// - 미설정이면 전면 거부 — loopback/RFC1918/IPv6/DNS rebinding 을 빠짐없이 막기 어려워 명시적 allowlist 를 요구한다.
// strict=false 라 discriminated union 내로잉이 안 되므로 { url?, reason? } 형태로 반환(url 있으면 통과).
function urlGuard(raw: string): { url?: URL; reason?: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { reason: "invalid-url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { reason: "scheme-not-allowed" };
  // fail-closed: allowlist 미설정이면 전부 거부한다. "기본 blocklist" 는 loopback/RFC1918/IPv6/DNS rebinding 을
  // 빠짐없이 막기 어려워(토큰 첨부 fetch 이므로 SSRF 표면이 크다) allowlist 를 명시적으로 요구한다.
  const allow = (process.env.A2A_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allow.length) return { reason: "no-allowlist — A2A_ALLOWED_HOSTS 로 대상 호스트를 명시하세요." };
  if (allow.includes(url.host) || allow.includes(url.hostname)) return { url };
  return { reason: "host-not-allowlisted" };
}

export const sendTaskToA2AAgentTool = defineTool({
  name: "send_task_to_a2a_agent",
  description:
    "외부/내부 A2A 에이전트에게 작업을 위임한다(A2A message/send). 여러 전문 에이전트(진단·PR·알림)를 조합할 때 사용. " +
    "agentUrl 은 대상 Agent Card 의 url(JSON-RPC 엔드포인트), goal 은 위임할 작업 설명. " +
    "**되돌릴 수 없을 수 있으니** 먼저 사용자 동의를 받고 confirmed=true 로 호출하라(미설정 시 확인 요청만 반환).",
  parameters: z.object({
    agentUrl: z.string().url().describe("대상 A2A 에이전트 JSON-RPC 엔드포인트(Agent Card 의 url)"),
    goal: z.string().describe("위임할 작업/목표(자연어)"),
    contextId: z.string().optional().describe("기존 작업 맥락을 이어가려면 contextId(=상대 에이전트의 task context)"),
    token: z.string().optional().describe("대상 인증 bearer 토큰(없으면 env A2A_BEARER 사용)"),
    confirmed: z.boolean().optional().describe("사용자 동의 시 true. 미설정/false 면 실행하지 않고 확인 요청 반환."),
  }),
  execute: async ({ agentUrl, goal, contextId, token, confirmed }) => {
    if (!goal || !agentUrl) return { error: "bad_input", note: "agentUrl 과 goal 은 필수입니다." };
    if (!confirmed) {
      return {
        needsConfirmation: true,
        note: "A2A 위임은 되돌릴 수 없을 수 있습니다. 동의 후 confirmed=true 로 재호출하세요.",
        willSend: { agentUrl, goal, ...(contextId ? { contextId } : {}) },
      };
    }
    // confirmed 는 모델이 주장하는 값이라 프롬프트 인젝션으로 우회될 수 있다(PoC 한계). 비가역 외부 위임이므로
    // 최소한 감사 로그를 남긴다 — 운영 승격 시 CopilotKit useHumanInTheLoop 로 실제 사용자 클릭을 요구하라(설계 후속).
    console.warn(`[a2a-client] 외부 위임 confirmed: agentUrl=${agentUrl} goal="${goal.slice(0, 80)}"`);
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: {
        message: {
          kind: "message",
          role: "user",
          messageId: mid(),
          ...(contextId ? { contextId } : {}),
          parts: [{ kind: "text", text: goal }],
        },
      },
    };
    // 가드 통과한 URL 에만 요청/토큰 첨부(SSRF·토큰유출 방지).
    const guard = urlGuard(agentUrl);
    if (!guard.url)
      return {
        error: "a2a-url-rejected",
        reason: guard.reason,
        note: "A2A_ALLOWED_HOSTS 로 대상 호스트를 허용하거나 https URL 을 사용하세요.",
      };
    const bearer = token ?? process.env.A2A_BEARER;
    let res: Response;
    try {
      res = await fetch(guard.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
        // 느리거나 멈춘 peer 가 서버 도구 실행을 무한정 잡지 않도록 상한(20s).
        signal: AbortSignal.timeout(20_000),
        // 30x redirect 로 allowlist 를 우회(Location 이 사설망/메타데이터)하는 SSRF 를 막는다.
        redirect: "error",
      });
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return {
        error: isTimeout ? "a2a-timeout" : "a2a-unreachable",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json) return { error: "a2a-request-failed", status: res.status };
    if (json.error) return { error: "a2a-error", detail: json.error };
    return { task: json.result };
  },
});
