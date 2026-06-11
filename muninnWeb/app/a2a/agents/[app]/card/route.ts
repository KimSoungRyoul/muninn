// A2A Agent Card 노출 — GET /a2a/agents/:app/card.
// 설계: docs/design/muninn-a2a-integration.md §4(V2)/§5. 운영에선 next.config rewrite 로
// A2A 표준 경로 /.well-known/agent-card.json 에 매핑한다.
import { NextRequest } from "next/server";
import { ok, notFound } from "@/lib/api";
import { getApplicationCr, listApplications } from "@/lib/incidents";
import { k8sEnabled } from "@/lib/k8s";
import { huginnAgentToAgentCard, baseUrlFromRequest } from "@/lib/a2a/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { app: string } }) {
  const baseUrl = baseUrlFromRequest(req);

  if (!k8sEnabled()) {
    // 로컬(클러스터 미연결): AppVM mock 에서 최소 카드 구성(콘솔 프로토타입 유지).
    const apps = await listApplications();
    const a = apps.find((x) => x.name === params.app || x.id === params.app);
    if (!a) return notFound(`application '${params.app}' not found`);
    const card = huginnAgentToAgentCard(
      { metadata: { name: a.name }, spec: { kind: a.kind, output: a.output, source: { repo: a.repo } } },
      baseUrl,
    );
    return ok(card);
  }

  const cr = await getApplicationCr(params.app);
  if (!cr) return notFound(`HuginnAgent '${params.app}' not found`);
  return ok(huginnAgentToAgentCard(cr, baseUrl));
}
