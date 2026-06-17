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
import { runWithCopilotWorkspace, runWithCopilotAuth, workspaceFromRequest } from "@/lib/workspace";
import { requireAuth } from "@/lib/auth";

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
  // 멀티테넌시(§C3/§4): 요청별 workspace 를 ALS 에 담아 server tool(recall/store)이 격리된 테넌트로
  // 읽고 쓰게 한다. workspaceFromRequest 가 인증 여부를 반영(미인증 콘솔은 서버 기본 workspace).
  const workspace = await workspaceFromRequest(req);
  // 위임(불가역) 앞단 인증 게이트(§C2): 인증 환경에서 인증 통과(또는 same-origin 콘솔)인지 ALS 에 담아
  // delegate_incident.execute 가 확인한다. 조회/read 도구는 막지 않는다(여기서 요청을 거부하지 않음).
  // allowConsole=true → 브라우저 콘솔(same-origin)은 토큰 없이도 통과, 외부/머신 무토큰은 false.
  const authed = (await requireAuth(req, { allowConsole: true })) === null;
  return runWithCopilotWorkspace(workspace, () => runWithCopilotAuth(authed, () => handleRequest(req)));
};
