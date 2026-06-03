import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { MEMORIES } from "@/lib/data";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") ?? "all"; // all | global | app
  const appId = sp.get("app");
  const q = sp.get("q");
  const method = sp.get("method") ?? "hybrid"; // hybrid | bm25 | vector

  let list: any = MEMORIES;
  if (scope === "global") list = list.filter((m: any) => m.scope === "global");
  else if (scope === "app") list = list.filter((m: any) => m.scope === "app");

  if (appId) list = list.filter((m: any) => m.appId === appId);

  if (q) {
    list = list.filter(
      (m: any) => m.fact.includes(q) || m.tags.some((t: string) => t.includes(q))
    );
  }

  return ok({ method, count: list.length, items: list });
}
