import { NextRequest } from "next/server";
import { ok, notFound } from "@/lib/api";
import { RUN_DETAIL, RECENT_RUNS, LIVE_RUNS } from "@/lib/data";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  if (id === RUN_DETAIL.id) return ok(RUN_DETAIL);

  const r = RECENT_RUNS.find((x) => x.id === id) || LIVE_RUNS.find((x) => x.id === id);
  return r ? ok(r) : notFound("run not found");
}
