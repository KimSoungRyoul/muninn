import { NextRequest } from "next/server";
import { ok } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return ok({
    runId: params.id,
    decision: "approved",
    status: "running",
    decidedAt: new Date().toISOString(),
  });
}
