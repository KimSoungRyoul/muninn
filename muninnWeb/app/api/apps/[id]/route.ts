import { NextRequest } from "next/server";
import { ok, notFound } from "@/lib/api";
import { APPS, EVENTS, RECENT_RUNS } from "@/lib/data";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const app: any = APPS.find((a) => a.id === id);
  if (!app) return notFound("application not found");
  return ok({
    ...app,
    eventCount: EVENTS.filter((e) => e.appId === id).length,
    runs: RECENT_RUNS.filter((r) => r.app === app.name),
  });
}
