// A2A 에이전트 레지스트리 — GET /a2a/agents. 등록된 HuginnAgent 들의 Agent Card 목록.
// 설계: docs/design/muninn-a2a-integration.md §4(V2, "agent registry"). 외부 오케스트레이터의 디스커버리 진입점.
import { NextRequest } from "next/server";
import { ok, notFound, badRequest } from "@/lib/api";
import { listApplications } from "@/lib/incidents";
import { huginnAgentToAgentCard, baseUrlFromRequest } from "@/lib/a2a/card";
import { a2aServerEnabled, a2aAuthOk } from "@/lib/a2a/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // POST 와 동일 게이트(fail-closed) — 디스커버리 표면으로 HuginnAgent·source repo 가 무인증 노출되지 않게.
  if (!a2aServerEnabled()) return notFound("A2A 서버 라우트 비활성(MUNINN_A2A_ENABLED=1 필요)");
  if (!a2aAuthOk(req)) return badRequest("인증 필요(Authorization: Bearer)");
  const baseUrl = baseUrlFromRequest(req);
  const apps = await listApplications();
  const agents = apps.map((a) =>
    huginnAgentToAgentCard(
      { metadata: { name: a.name }, spec: { kind: a.kind, output: a.output, source: { repo: a.repo } } },
      baseUrl,
    ),
  );
  return ok({ count: agents.length, agents });
}
