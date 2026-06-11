// POST /api/runs/{name}/report — agent-runtime(runner.py) 진행 보고 수신(설계 §8 보고 계약).
//
// agent-runtime 이 MUNINN_API_ENDPOINT 로 호출한다. Agent→API 소유 status 필드만 merge-patch:
//   step / cost / tokens / output  (operator-design §2.2). phase/시간/caps 는 operator 소유라 건드리지 않는다.
// requestApproval(또는 top-level approvalReasons) 가 있으면 API 소유 전이를 기록한다(§4.3/CONTRACT §3):
//   phase=AwaitingApproval, approval.state=Pending, approval.reasons, requestedAt=now, expiresAt=now+90m.
//   이미 종료된 Run(Succeeded/Failed/Cancelled)은 승인 전이를 무시한다(상태 검증).
//
// 입력(JSON):
//   { step?, cost?, tokens?, output?, recalledMemoryIds?: [{id,score?,reason?}],
//     requestApproval?: bool | {reasons:[{type,detail?}]}, approvalReasons?: [{type,detail?}], incidentId?, summary? }

import { NextRequest } from "next/server";
import { ok, badRequest } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { patchRunStatus, patchIssueStatus, getHuginnRun, k8sEnabled, DEFAULT_NAMESPACE } from "@/lib/k8s";
import { getRunStatus, normalizeRecalledMemoryIds, buildApprovalRequest, isTerminalPhase } from "@/lib/incidents";
import { dbEnabled, updateIncident, updateIncidentByIssue } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const denied = await requireAuth(req);
  if (denied) return denied;
  const runName = params.id;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  // issueName 은 항상 string 으로만 다룬다(outcome/awaiting/incident 종결의 단일 기준).
  const issueName = typeof body.issueName === "string" && body.issueName ? body.issueName : null;

  // 숫자 파싱 가드 — NaN 은 JSON 직렬화 시 null 이 되어 merge-patch 가 기존 status 를 지운다.
  // 유효한 유한수만 status 에 싣는다(비숫자/NaN 입력은 무시해 기존 값 보존).
  const finiteOr = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Agent→API 소유 필드만 모은다(나머지는 무시 — operator 소유 침범 금지).
  const status: Record<string, unknown> = {};
  const step = finiteOr(body.step);
  if (step != null) status.step = step;
  // cost 는 decimal USD 문자열(CRD float 회피)이나 NaN/비숫자 문자열이 들어가지 않게 검증.
  const cost = finiteOr(body.cost);
  if (cost != null) status.cost = String(cost);
  const tokens = finiteOr(body.tokens);
  if (tokens != null) status.tokens = tokens;
  if (typeof body.output === "string") status.output = body.output;
  const recalled = normalizeRecalledMemoryIds(body.recalledMemoryIds);
  if (recalled.length) status.recalledMemoryIds = recalled;

  // API 소유 전이(operator-design §2.2): 런너가 위험 작업 직전 승인을 요청(CONTRACT §3).
  // requestApproval 은 truthy(또는 {reasons:[...]}) 이거나 top-level approvalReasons 가 있으면 트리거.
  // reasons 우선순위: requestApproval.reasons > top-level approvalReasons.
  const wantApproval =
    Boolean(body.requestApproval) || (Array.isArray(body.approvalReasons) && body.approvalReasons.length > 0);
  const approvalReasons =
    (body.requestApproval && typeof body.requestApproval === "object" && Array.isArray(body.requestApproval.reasons)
      ? body.requestApproval.reasons
      : undefined) ?? (Array.isArray(body.approvalReasons) ? body.approvalReasons : undefined);

  if (!k8sEnabled()) {
    // 로컬 dev(클러스터 없음): 보고를 받아들이되 patch 는 생략(콘솔이 mock 으로 동작).
    return ok({ accepted: true, runId: runName, persisted: false, note: "k8s-disabled" });
  }

  // 승인 요청은 phase 전이를 동반하므로, 이미 종료(terminal)된 Run 은 무시한다(상태 검증).
  // 종료 Run 을 AwaitingApproval 로 되돌리면 operator 의 라이프사이클을 깨뜨린다.
  let approvalApplied = false;
  if (wantApproval) {
    let currentPhase: string | undefined;
    try {
      const cr: any = await getHuginnRun(DEFAULT_NAMESPACE, runName);
      currentPhase = cr?.status?.phase;
    } catch {
      // 조회 실패(404/RBAC) — 승인 전이를 건너뛰되 나머지 보고 필드는 계속 patch.
      currentPhase = undefined;
    }
    if (!isTerminalPhase(currentPhase)) {
      const appr = buildApprovalRequest(approvalReasons);
      status.phase = appr.phase;
      status.approval = appr.approval;
      approvalApplied = true;
    }
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
  const incidentIdNum = finiteOr(body.incidentId);
  if (dbEnabled() && (incidentIdNum != null || issueName)) {
    const incidentStatus = body.final ? (body.failed ? "failed" : "succeeded")
      : approvalApplied ? "awaiting-approval" : "running";
    const patch = {
      ...(cost != null ? { cost } : {}),
      ...(body.summary ? { summary: String(body.summary) } : {}),
      ...(typeof body.outcome === "string" ? { outcome: body.outcome } : {}),
      status: incidentStatus,
      runName,
    };
    try {
      if (incidentIdNum != null) await updateIncident(incidentIdNum, patch);
      else if (issueName) await updateIncidentByIssue(issueName, patch);
    } catch {
      // 이력 갱신 실패는 보고 자체를 막지 않는다.
    }
  }

  // Issue 가 AwaitingApproval 을 집계하도록(선택) — Issue status 도 API 소유 전이.
  // 실제로 Run 전이가 적용됐을 때만(종료 Run 이면 approvalApplied=false → 집계도 건너뜀).
  if (approvalApplied && issueName) {
    try {
      await patchIssueStatus(DEFAULT_NAMESPACE, issueName, { phase: "AwaitingApproval" });
    } catch {
      // 집계 실패는 무시(operator 가 Run 들로 재집계).
    }
  }

  const vm = await getRunStatus(runName);
  return ok({ accepted: true, runId: runName, persisted: true, run: vm });
}
