import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { EVENTS } from "@/lib/data";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  return ok(EVENTS.filter((e) => e.appId === id));
}
