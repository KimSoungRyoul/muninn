import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { APPS, LIVE_RUNS, RECENT_RUNS } from "@/lib/data";
import { computeDashboard } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "ws_ai";
  const d = computeDashboard(workspace);
  // live/recent Run 도 워크스페이스 앱으로 스코프(대시보드 표가 현재 워크스페이스만 보이도록).
  const appNames = new Set(APPS.filter((a) => a.workspaceId === workspace).map((a) => a.name));
  const liveRuns = LIVE_RUNS.filter((r) => appNames.has(r.app));
  const recentRuns = RECENT_RUNS.filter((r) => appNames.has(r.app)).slice(0, 10);
  return ok({ ...d, liveRuns, recentRuns, source: "mock" });
}
