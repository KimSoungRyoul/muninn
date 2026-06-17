// GET /api/runs — HuginnRun 목록. dual-mode(설계 §2 "Migration in progress"):
//   k8sEnabled() → HuginnRun CR 목록(listRunsVM)을 콘솔 Run 형태로 매핑(source:"k8s").
//   미연결(로컬 dev) → mock(LIVE_RUNS/RECENT_RUNS) 폴백, source:"mock" 표식.
// 쿼리: ?live=true(실시간 set, mock 한정) · ?status=<RunStatus> · ?app=<name>

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { LIVE_RUNS, RECENT_RUNS } from "@/lib/data";
import { k8sEnabled } from "@/lib/k8s";
import { listRunsVM } from "@/lib/incidents";
import type { RunStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const live = sp.get("live");
  const status = sp.get("status");
  const app = sp.get("app");

  if (k8sEnabled()) {
    try {
      const vms = await listRunsVM({ status: (status as RunStatus) || undefined, app: app || undefined });
      // RunVM → 콘솔 Run 형태 정규화(started/duration 보강 — VM 은 startedAt 만 가진다).
      const rows = vms.map((v) => ({
        id: v.id,
        app: v.app,
        status: v.status,
        step: v.step,
        max: v.max,
        cost: v.cost,
        duration: v.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(v.startedAt).getTime()) / 1000)) : 0,
        started: v.startedAt ?? new Date().toISOString(),
        output: v.output,
        source: "k8s" as const,
      }));
      return ok(rows);
    } catch (e) {
      console.warn("[muninn] /api/runs: k8s 조회 실패 — mock fallback", e);
    }
  }

  const base = live === "true" ? LIVE_RUNS : RECENT_RUNS;
  let result: any[] = base;
  if (status) result = result.filter((r) => r.status === status);
  if (app) result = result.filter((r) => r.app === app);
  return ok(result.map((r) => ({ ...r, source: "mock" as const })));
}
