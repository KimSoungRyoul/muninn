// POST /api/memories/recall — 명시적 키워드(텍스트) recall(agent-runtime / 코파일럿 공용).
// body: { query, scope?, app?, k? } → { count, items: MemoryRow[] }
// agent-runtime 은 MUNINN_MEMORY_ENDPOINT 로 위임 직전 회상에 쓴다(설계 §3.1/§7.1).

import { NextRequest } from "next/server";
import { ok, badRequest } from "@/lib/api";
import { dbEnabled, recall } from "@/lib/db";

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
  const rows = await recall(body?.query, { scope: body?.scope, appId: body?.app ?? body?.appId, k: body?.k });
  return ok({ count: rows.length, items: rows });
}
