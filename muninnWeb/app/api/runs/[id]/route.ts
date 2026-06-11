// GET /api/runs/{name} — 단일 Run 조회. dual-mode(설계 §2 "Migration in progress"):
//   k8sEnabled() → 실제 HuginnRun CR 을 runView(RunVM) 로 매핑. (없으면 404)
//   미연결(로컬 dev) → mock(RUN_DETAIL/RECENT_RUNS/LIVE_RUNS) 폴백, source:"mock" 표식.

import { NextRequest } from "next/server";
import { ok, notFound } from "@/lib/api";
import { RUN_DETAIL, RECENT_RUNS, LIVE_RUNS } from "@/lib/data";
import { getRunStatus } from "@/lib/incidents";
import { k8sEnabled } from "@/lib/k8s";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  // 실제 클러스터 연결 시: CR 조회(runView 매핑). getRunStatus 내부에서 404/오류는 null.
  if (k8sEnabled()) {
    const vm = await getRunStatus(id);
    return vm ? ok(vm) : notFound("run not found");
  }

  // mock 폴백 — 무표식 폴백을 피하려고 source:"mock" 을 명시한다.
  if (id === RUN_DETAIL.id) return ok({ ...RUN_DETAIL, source: "mock" });

  const r = RECENT_RUNS.find((x) => x.id === id) || LIVE_RUNS.find((x) => x.id === id);
  return r ? ok({ ...r, source: "mock" }) : notFound("run not found");
}
