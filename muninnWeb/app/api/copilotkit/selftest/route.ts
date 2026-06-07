// CopilotKit ↔ Anthropic(OAuth) 배선 진단 라우트.
//
// agent-runtime 의 `selftest` 모드와 같은 철학: 무거운 AG-UI 프로토콜 왕복 없이
// 런타임과 동일한 OAuth-wired Anthropic provider 로 1회 호출해 인증/모델이 살아있는지 확인한다.
// kind E2E 와 로컬에서 `GET /api/copilotkit/selftest` 로 점검한다.

import { NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropicProvider, COPILOT_MODEL, credentialMode } from "@/lib/copilot-anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = credentialMode();
  if (mode === "none") {
    return NextResponse.json(
      {
        ok: false,
        error: "no-credential",
        hint: "CLAUDE_CODE_OAUTH_TOKEN 또는 ANTHROPIC_API_KEY 를 설정하세요(agent-secrets).",
        model: COPILOT_MODEL,
      },
      { status: 503 },
    );
  }
  try {
    const { text, usage } = await generateText({
      model: anthropicProvider(COPILOT_MODEL),
      prompt: "Reply with exactly this token and nothing else: COPILOT_OAUTH_OK",
    });
    // 모델 원문(reply)을 그대로 echo 하지 않는다 — 일치 여부 boolean 으로 충분.
    const ok = text.trim().includes("COPILOT_OAUTH_OK");
    return NextResponse.json(
      { ok, credential: mode, model: COPILOT_MODEL, replyMatched: ok, usage },
      // 실패 시 non-200 — health-check/모니터링이 OK 로 오인하지 않도록.
      { status: ok ? 200 : 502 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: "anthropic-call-failed", credential: mode, model: COPILOT_MODEL, message },
      { status: 502 },
    );
  }
}
