// A2A 에이전트 레지스트리 — GET /a2a/agents. 등록된 HuginnAgent 들의 Agent Card 목록.
// 설계: docs/design/muninn-a2a-integration.md §4(V2, "agent registry"). 외부 오케스트레이터의 디스커버리 진입점.
import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { listApplications } from "@/lib/incidents";
import { huginnAgentToAgentCard, baseUrlFromRequest } from "@/lib/a2a/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
