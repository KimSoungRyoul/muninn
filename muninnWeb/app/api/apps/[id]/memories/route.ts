import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { MEMORIES } from "@/lib/data";
import { dbEnabled, listMemories } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/apps/{id}/memories — 이 앱 전용 + (선택) global memory. dual-mode:
//   dbEnabled() → postgres(listMemories), 미연결 → mock(MEMORIES) 폴백.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const includeGlobal = req.nextUrl.searchParams.get("includeGlobal") !== "false";

  if (dbEnabled()) {
    try {
      const appMems = await listMemories({ scope: "app", appId: id });
      const globalMems = includeGlobal ? await listMemories({ scope: "global" }) : [];
      return ok({ app: appMems, global: globalMems });
    } catch (e) {
      console.warn("[muninn] /api/apps/[id]/memories: db 조회 실패 — mock fallback", e);
    }
  }

  const appMems = MEMORIES.filter((m) => m.appId === id);
  const globalMems = includeGlobal ? MEMORIES.filter((m) => m.scope === "global") : [];
  return ok({ app: appMems, global: globalMems });
}
