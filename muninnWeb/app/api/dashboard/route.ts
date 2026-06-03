import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { LIVE_RUNS, RECENT_RUNS } from "@/lib/data";
import { computeDashboard } from "@/lib/stats";

export async function GET(req: NextRequest) {
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "ws_ai";
  const d = computeDashboard(workspace);
  return ok({ ...d, liveRuns: LIVE_RUNS, recentRuns: RECENT_RUNS.slice(0, 10) });
}
