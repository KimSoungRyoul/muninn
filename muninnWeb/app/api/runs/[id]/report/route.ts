// POST /api/runs/{name}/report — agent-runtime(runner.py) 진행 보고 수신(설계 §8 보고 계약).
//
// agent-runtime 이 MUNINN_API_ENDPOINT 로 호출한다. Agent→API 소유 status 필드만 merge-patch:
//   step / cost / tokens / output  (operator-design §2.2). phase/시간/caps 는 operator 소유라 건드리지 않는다.
// requestApproval=true 면 API 소유 전이(AwaitingApproval + approval.state=Pending)를 기록한다(§4.3).
//
// 입력(JSON):
//   { step?, cost?, tokens?, output?, recalledMemoryIds?: [{id,score?,reason?}],
//     requestApproval?: bool, approvalReasons?: [{type, detail?}], incidentId?, summary? }

import { NextRequest } from "next/server";
import { ok, badRequest } from "@/lib/api";
import { patchRunStatus, patchIssueStatus, k8sEnabled, DEFAULT_NAMESPACE } from "@/lib/k8s";
import { getRunStatus, normalizeRecalledMemoryIds } from "@/lib/incidents";
import { dbEnabled, updateIncident, updateIncidentByIssue } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const runName = params.id;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  // issueName 은 항상 string 으로만 다룬다(outcome/awaiting/incident 종결의 단일 기준).
  const issueName = typeof body.issueName === "string" && body.issueName ? body.issueName : null;

  // Agent→API 소유 필드만 모은다(나머지는 무시 — operator 소유 침범 금지).
  const status: Record<string, unknown> = {};
  if (body.step != null) status.step = Number(body.step);
  if (body.cost != null) status.cost = String(body.cost); // decimal USD 문자열(CRD float 회피)
  if (body.tokens != null) status.tokens = Number(body.tokens);
  if (typeof body.output === "string") status.output = body.output;
  const recalled = normalizeRecalledMemoryIds(body.recalledMemoryIds);
  if (recalled.length) status.recalledMemoryIds = recalled;
  // API 소유: 승인 요청 전이.
  if (body.requestApproval) {
    status.phase = "AwaitingApproval";
    status.approval = {
      state: "Pending",
      requestedAt: new Date().toISOString(),
      ...(Array.isArray(body.approvalReasons) ? { reasons: body.approvalReasons } : {}),
    };
  }

  if (!k8sEnabled()) {
    // 로컬 dev(클러스터 없음): 보고를 받아들이되 patch 는 생략(콘솔이 mock 으로 동작).
    return ok({ accepted: true, runId: runName, persisted: false, note: "k8s-disabled" });
  }

  await patchRunStatus(DEFAULT_NAMESPACE, runName, status);

  // outcome: 완료 시 "PR #842" / dry-run "DRY-RUN PR: ..."(Agent→API 소유, Issue status).
  if (typeof body.outcome === "string" && issueName) {
    try {
      await patchIssueStatus(DEFAULT_NAMESPACE, issueName, { outcome: body.outcome });
    } catch {
      // outcome 집계 실패는 보고를 막지 않는다.
    }
  }

  // 사건 이력(metaDB) 동기화 — 비용/요약/결과/단계 기록. 회수 폐루프(설계 §7.3):
  // 에이전트는 incidentId 를 모르지만 issueName(MUNINN_ISSUE_NAME)은 아므로, issueName 으로 종결한다.
  if (dbEnabled() && (body.incidentId != null || issueName)) {
    const incidentStatus = body.final ? (body.failed ? "failed" : "succeeded")
      : body.requestApproval ? "awaiting-approval" : "running";
    const patch = {
      ...(body.cost != null ? { cost: Number(body.cost) } : {}),
      ...(body.summary ? { summary: String(body.summary) } : {}),
      ...(typeof body.outcome === "string" ? { outcome: body.outcome } : {}),
      status: incidentStatus,
      runName,
    };
    try {
      if (body.incidentId != null) await updateIncident(Number(body.incidentId), patch);
      else if (issueName) await updateIncidentByIssue(issueName, patch);
    } catch {
      // 이력 갱신 실패는 보고 자체를 막지 않는다.
    }
  }

  // Issue 가 AwaitingApproval 을 집계하도록(선택) — Issue status 도 API 소유 전이.
  if (body.requestApproval && issueName) {
    try {
      await patchIssueStatus(DEFAULT_NAMESPACE, issueName, { phase: "AwaitingApproval" });
    } catch {
      // 집계 실패는 무시(operator 가 Run 들로 재집계).
    }
  }

  const vm = await getRunStatus(runName);
  return ok({ accepted: true, runId: runName, persisted: true, run: vm });
}
