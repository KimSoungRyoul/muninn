import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { LIVE_RUNS, RECENT_RUNS } from "@/lib/data";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const live = sp.get("live");
  const status = sp.get("status");
  const app = sp.get("app");

  const base = live === "true" ? LIVE_RUNS : RECENT_RUNS;
  let result: any[] = base;

  if (status) result = result.filter((r) => r.status === status);
  if (app) result = result.filter((r) => r.app === app);

  return ok(result);
}
