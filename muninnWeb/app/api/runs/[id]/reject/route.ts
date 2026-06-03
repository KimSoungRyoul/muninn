import { NextRequest } from "next/server";
import { ok } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return ok({
    runId: params.id,
    decision: "rejected",
    status: "cancelled",
    decidedAt: new Date().toISOString(),
  });
}
