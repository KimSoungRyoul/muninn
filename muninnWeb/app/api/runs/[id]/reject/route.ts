// POST /api/runs/{name}/reject — 승인 대기 Run 거절+중단(설계 §4.3, API 소유 필드 + suspend).
// k8s 연결 시 status.approval=Rejected + spec.suspend=true(operator 가 취소), 아니면 mock 응답.

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { rejectRun } from "@/lib/incidents";
import { k8sEnabled } from "@/lib/k8s";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let reason = "";
  let decidedBy = "operator";
  try {
    const body = await req.json();
    if (body?.reason) reason = String(body.reason);
    if (body?.decidedBy) decidedBy = String(body.decidedBy);
  } catch {
    // body 없음
  }
  if (!k8sEnabled()) {
    return ok({ runId: params.id, decision: "rejected", status: "cancelled", decidedAt: new Date().toISOString(), persisted: false });
  }
  const res = await rejectRun(params.id, reason, decidedBy);
  return ok({ runId: params.id, decision: "rejected", persisted: res.ok, decidedAt: new Date().toISOString() });
}
