// POST /api/runs/{name}/reject — 승인 대기 Run 거절+중단(설계 §4.3, API 소유 필드 + suspend).
// k8s 연결 시 status.approval=Rejected + spec.suspend=true(operator 가 취소), 아니면 mock 응답.

import { NextRequest } from "next/server";
import { ok, conflict } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rejectRun } from "@/lib/incidents";
import { k8sEnabled } from "@/lib/k8s";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // 고위험 사람-결정 — 콘솔(OIDC)+머신 둘 다 허용하되, 운영자 group claim 강제(설정 시).
  const denied = await requireAuth(req, { requireOperator: true });
  if (denied) return denied;
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
  if (!res.ok) {
    // 종료/이미 결정/만료된 Run 재결정은 409.
    if (res.reason === "invalid-state" || res.reason === "expired") {
      return conflict("거절할 수 없는 상태입니다", { runId: params.id, reason: res.reason, phase: res.phase, approvalState: res.approvalState });
    }
    if (res.reason === "not-found") {
      return conflict("실행을 찾을 수 없습니다", { runId: params.id, reason: res.reason });
    }
    return conflict("거절 처리 실패", { runId: params.id, reason: res.reason });
  }
  return ok({ runId: params.id, decision: "rejected", persisted: true, decidedAt: new Date().toISOString() });
}
