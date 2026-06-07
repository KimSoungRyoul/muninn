// POST /api/runs/{name}/approve — 승인 대기(AwaitingApproval) Run 승인(설계 §4.3, API 소유 필드).
// k8s 연결 시 status.approval 을 merge-patch, 아니면 mock 응답(콘솔 프로토타입 유지).

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { approveRun } from "@/lib/incidents";
import { k8sEnabled } from "@/lib/k8s";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let decidedBy = "operator";
  try {
    const body = await req.json();
    if (body?.decidedBy) decidedBy = String(body.decidedBy);
  } catch {
    // body 없음 — 기본 decidedBy
  }
  if (!k8sEnabled()) {
    return ok({ runId: params.id, decision: "approved", status: "running", decidedAt: new Date().toISOString(), persisted: false });
  }
  const res = await approveRun(params.id, decidedBy);
  return ok({ runId: params.id, decision: "approved", persisted: res.ok, decidedAt: new Date().toISOString() });
}
