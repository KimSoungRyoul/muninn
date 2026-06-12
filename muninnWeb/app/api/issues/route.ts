// /api/issues — HuginnIssue 게이트웨이(Muninn API).
//   GET  : 장애↔대처 조인 조회(query_incidents 와 동일 — ?status=active|all, ?app=)
//   POST : 위임(대화형/웹훅 공통) — HuginnIssue CR 생성 → operator 가 Run→Job 실행(설계 §3.2/§4.2)
//
// body(POST): { app, goal, userPrompt?, issuingUser?, severity?, recalledMemoryIds? }

import { NextRequest } from "next/server";
import { ok, created, badRequest } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { delegateIncident, queryIncidents } from "@/lib/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = (sp.get("status") as "active" | "all" | null) ?? undefined;
  const app = sp.get("app") ?? undefined;
  const items = await queryIncidents({ status, app });
  return ok({ count: items.length, items });
}

export async function POST(req: NextRequest) {
  // 위임(=비멱등 에이전트 실행 유발) — 상태변경. 콘솔+머신 둘 다 허용(CONTRACT §C2).
  const denied = await requireAuth(req);
  if (denied) return denied;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body?.app || !body?.goal) return badRequest("app 과 goal 은 필수입니다");

  const res = await delegateIncident({
    app: body.app,
    goal: body.goal,
    userPrompt: body.userPrompt,
    issuingUser: body.issuingUser,
    severity: body.severity,
    recalledMemoryIds: body.recalledMemoryIds,
  });
  if (!res.ok) {
    return badRequest(res.reason === "k8s-disabled" ? "클러스터 미연결 — 위임은 kind/배포에서 동작" : `위임 실패: ${res.reason}`);
  }
  return created(res);
}
