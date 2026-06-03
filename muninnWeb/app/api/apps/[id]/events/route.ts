import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { EVENTS } from "@/lib/data";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  return ok(EVENTS.filter((e) => e.appId === id));
}
