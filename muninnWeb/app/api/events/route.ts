import { NextRequest } from "next/server";
import { ok, severityGte } from "@/lib/api";
import { EVENTS } from "@/lib/data";

export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get("app");
  const severity = req.nextUrl.searchParams.get("severity");

  let list: any = EVENTS;
  if (appId) list = list.filter((e: any) => e.appId === appId);
  if (severity) list = list.filter((e: any) => severityGte(e.severity, severity));

  return ok(list);
}
