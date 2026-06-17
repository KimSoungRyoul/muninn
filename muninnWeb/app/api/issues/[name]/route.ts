// /api/issues/[name] — 단일 HuginnIssue(사건) 상세 조회.
//   GET : getIncidentDetail(확장 메타 + runs + outcome/runRefs). dev/mock graceful fallback.
// 위임→폴링 UI(/incidents/[id] 상세, open_incident 네비게이션)의 데이터 소스.

import { NextRequest } from "next/server";
import { ok, notFound } from "@/lib/api";
import { getIncidentDetail } from "@/lib/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ name: string }> }) {
  const { name } = await props.params;
  const detail = await getIncidentDetail(decodeURIComponent(name));
  if (!detail) return notFound(`사건(HuginnIssue) '${name}' 을 찾을 수 없습니다`);
  return ok(detail);
}
