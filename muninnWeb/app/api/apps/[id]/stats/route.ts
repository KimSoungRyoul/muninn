import { NextRequest } from "next/server";
import { ok, notFound } from "@/lib/api";
import { computeAppStats } from "@/lib/stats";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const period = req.nextUrl.searchParams.get("period") || "24h";
  const s = computeAppStats(id, period as any);
  return s ? ok(s) : notFound();
}
