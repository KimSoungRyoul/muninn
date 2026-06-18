// POST /api/memories/recall — 명시적 키워드(텍스트) recall(agent-runtime / 코파일럿 공용).
// body: { query, scope?, app?, k? } → { count, items: MemoryRow[] }
// agent-runtime 은 MUNINN_MEMORY_ENDPOINT 로 위임 직전 회상에 쓴다(설계 §3.1/§7.1).

import { NextRequest } from "next/server";
import { ok, serverError, parseJsonBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { dbEnabled, recall } from "@/lib/db";
import { workspaceFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 미인증 외부 read 차단(리뷰 MEDIUM): 머신(agent-runtime)은 토큰 필수, 콘솔(same-origin)은 우회 허용.
  // recall 은 POST(상태변경 메서드)이므로 기본 콘솔 우회로 충분하다(allowConsoleRead 불필요).
  const denied = await requireAuth(req);
  if (denied) return denied;
  if (!dbEnabled()) return ok({ count: 0, items: [], note: "db-disabled" });
  const body = await parseJsonBody(req);
  if (body instanceof Response) return body;
  try {
    // 멀티테넌시(CONTRACT §2/§C3): 인증된 요청만 클라이언트 workspace 헤더 신뢰, 미인증 콘솔은 서버 기본값.
    const workspace = await workspaceFromRequest(req, body?.workspace);
    const rows = await recall(body?.query, { workspace, scope: body?.scope, appId: body?.app ?? body?.appId, k: body?.k });
    return ok({ count: rows.length, items: rows });
  } catch (e) {
    return serverError("memory recall 실패", e);
  }
}
