// POST /api/runs/{name}/recall-report — 에이전트가 회상한 메모리 id 보고(설계 §5.6).
// status.recalledMemoryIds(API 소유)만 merge-patch. (진행/결과 보고는 /report 로 통합 가능하지만,
// 회상-only 보고를 위한 전용 경로를 제공한다.)
// body: { recalledMemoryIds: (string | {id, score?, reason?})[] }

import { NextRequest } from "next/server";
import { ok, badRequest } from "@/lib/api";
import { patchRunStatus, k8sEnabled, DEFAULT_NAMESPACE } from "@/lib/k8s";
import { normalizeRecalledMemoryIds } from "@/lib/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  const recalledMemoryIds = normalizeRecalledMemoryIds(body?.recalledMemoryIds);

  if (!k8sEnabled()) return ok({ accepted: true, runId: params.id, persisted: false, note: "k8s-disabled" });
  await patchRunStatus(DEFAULT_NAMESPACE, params.id, { recalledMemoryIds });
  return ok({ accepted: true, runId: params.id, persisted: true, count: recalledMemoryIds.length });
}
