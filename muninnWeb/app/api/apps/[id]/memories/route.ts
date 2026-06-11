import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { MEMORIES } from "@/lib/data";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const includeGlobal = req.nextUrl.searchParams.get("includeGlobal");
  const appMems = MEMORIES.filter((m) => m.appId === id);
  const globalMems =
    includeGlobal !== "false" ? MEMORIES.filter((m) => m.scope === "global") : [];
  return ok({ app: appMems, global: globalMems });
}
