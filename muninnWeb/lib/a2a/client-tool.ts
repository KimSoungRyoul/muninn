// V1 — 코파일럿을 A2A 클라이언트로. 설계: docs/design/muninn-a2a-integration.md §4(V1).
// 외부/내부 A2A 에이전트에 작업을 위임하는 server tool. lib/copilot-tools.ts 에 플래그(MUNINN_A2A_ENABLED)로 합류.
// CopilotKit 의 a2a 미들웨어에 의존하지 않고 fetch 기반 JSON-RPC(message/send)로 직접 호출 — 버전 무관하게 동작.

import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";
import type { JsonRpcRequest } from "./types";

function mid(): string {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
    const bearer = token ?? process.env.A2A_BEARER;
    let res: Response;
    try {
      res = await fetch(agentUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { error: "a2a-unreachable", detail: err instanceof Error ? err.message : String(err) };
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json) return { error: "a2a-request-failed", status: res.status };
    if (json.error) return { error: "a2a-error", detail: json.error };
    return { task: json.result };
  },
});
