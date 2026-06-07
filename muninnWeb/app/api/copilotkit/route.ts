// CopilotKit v2 런타임 엔드포인트 (Next.js App Router).
//
// classic BuiltInAgent 에 OAuth-wired LanguageModel 인스턴스를 주입한다. classic 모드는
// frontend tools(useFrontendTool)·readable context(useAgentContext)·프롬프트 빌드·멀티스텝
// tool calling 을 CopilotKit 이 자동 처리하므로, 우리는 모델 인증(OAuth)만 책임진다.
//
// 참고(최신 문서): https://docs.copilotkit.ai/backend/copilot-runtime
//                  https://docs.copilotkit.ai/built-in-agent/quickstart

import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import type { NextRequest } from "next/server";
import { anthropicProvider, COPILOT_MODEL } from "@/lib/copilot-anthropic";
import { MUNINN_COPILOT_SYSTEM } from "@/lib/copilot-system";
import { muninnServerTools } from "@/lib/copilot-tools";

// 런타임을 Node.js 에서 실행(streaming + 서버 fetch). Edge 아님.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const muninnAgent = new BuiltInAgent({
  model: anthropicProvider(COPILOT_MODEL),
  prompt: MUNINN_COPILOT_SYSTEM,
  // server tools(K8s CR·postgres) 주입 — recall/위임/조회/승인/기억화. classic 모드는 이 도구들과
  // 클라이언트의 frontend tool(네비게이션)을 합쳐 멀티스텝으로 호출한다.
  tools: muninnServerTools,
  // 도구 → (필요시) 추가 도구 → 최종 답변까지 한 요청에서 진행되도록 멀티스텝 허용.
  // recall → delegate → poll → store 까지 한 턴에 이어지도록 넉넉히.
  maxSteps: 12,
});

const copilotRuntime = new CopilotRuntime({
  agents: { default: muninnAgent },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: copilotRuntime,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
