import { NextRequest } from "next/server";
import { ok, notFound } from "@/lib/api";
import { computeAppStats } from "@/lib/stats";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const period = req.nextUrl.searchParams.get("period") || "24h";
  const s = computeAppStats(id, period as any);
  return s ? ok(s) : notFound();
}
