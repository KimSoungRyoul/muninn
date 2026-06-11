// POST /api/memories/recall — 명시적 키워드(텍스트) recall(agent-runtime / 코파일럿 공용).
// body: { query, scope?, app?, k? } → { count, items: MemoryRow[] }
// agent-runtime 은 MUNINN_MEMORY_ENDPOINT 로 위임 직전 회상에 쓴다(설계 §3.1/§7.1).

import { NextRequest } from "next/server";
import { ok, badRequest, serverError } from "@/lib/api";
import { dbEnabled, recall } from "@/lib/db";
import { workspaceFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!dbEnabled()) return ok({ count: 0, items: [], note: "db-disabled" });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  try {
    // 멀티테넌시(CONTRACT §2): 헤더 x-muninn-workspace 또는 body.workspace, 폴백 env/'default'.
    const workspace = workspaceFromRequest(req, body?.workspace);
    const rows = await recall(body?.query, { workspace, scope: body?.scope, appId: body?.app ?? body?.appId, k: body?.k });
    return ok({ count: rows.length, items: rows });
  } catch (e) {
    return serverError("memory recall 실패", e);
  }
}
