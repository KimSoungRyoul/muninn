// /api/memories — Muninn 메모리(metaDB) 게이트웨이.
//   GET  : 조회/검색(?q= 키워드(텍스트), ?scope=, ?app=, ?limit=)
//   POST : 저장(agent-runtime 의 MUNINN_MEMORY_ENDPOINT 종료-기억화, 또는 콘솔/코파일럿)
//
// DATABASE_URL 미설정 시 mock(HM_DATA)으로 graceful fallback(마이그레이션 중).

import { NextRequest } from "next/server";
import { ok, created, badRequest, serverError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { dbEnabled, listMemories, store } from "@/lib/db";
import { workspaceFromRequest } from "@/lib/workspace";
import { MEMORIES } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 미인증 외부 read 차단(리뷰 MEDIUM): 콘솔 read(same-origin GET)는 허용, 머신/외부는 토큰 필수.
  // dev 모드(인증 미설정)에서는 requireAuth 가 null 을 반환해 그대로 통과한다.
  const denied = await requireAuth(req, { allowConsoleRead: true });
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") ?? undefined; // global | app
  const appId = sp.get("app") ?? undefined;
  const q = sp.get("q") ?? undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  // 멀티테넌시(CONTRACT §2/§C3): 인증된 요청만 클라이언트 workspace 헤더 신뢰, 미인증 콘솔은 서버 기본값.
  const workspace = await workspaceFromRequest(req, sp.get("workspace"));

  if (!dbEnabled()) {
    // mock fallback
    let list: any = MEMORIES;
    if (scope === "global" || scope === "app") list = list.filter((m: any) => m.scope === scope);
    if (appId) list = list.filter((m: any) => m.appId === appId);
    if (q) list = list.filter((m: any) => m.fact.includes(q) || m.tags.some((t: string) => t.includes(q)));
    return ok({ method: "mock", count: list.length, items: list });
  }

  try {
    const items = await listMemories({ workspace, scope, appId, query: q, limit });
    return ok({ method: q ? "keyword" : "recency", count: items.length, items });
  } catch (e) {
    return serverError("memory 조회 실패", e);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  if (!dbEnabled()) return badRequest("memory(postgres) 비활성 — DATABASE_URL 미설정");
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body?.fact || typeof body.fact !== "string") return badRequest("fact(string) 필수");

  // 메모리 sanitize — 공백 제거 후 최소/최대 길이 검증(빈/잡음/거대 입력으로 메모리 오염 방지).
  const fact = body.fact.trim();
  if (fact.length < 8) return badRequest("fact 가 너무 짧습니다(최소 8자) — 재사용 가능한 기억만 저장");
  if (fact.length > 4000) return badRequest("fact 가 너무 깁니다(최대 4000자)");

  // 저장 workspace(§C3): 인증된 요청만 클라이언트 헤더/body.workspace 신뢰, 미인증 콘솔은 서버 기본값.
  const workspace = await workspaceFromRequest(req, body.workspace);

  try {
    const row = await store({
      fact,
      workspace,
      scope: body.scope,
      appId: body.app ?? body.appId ?? null,
      appName: body.appName ?? null,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      sourceRunId: body.sourceRunId ?? body.runName ?? null,
      curated: Boolean(body.curated),
      changedBy: body.changedBy ?? "agent",
    });
    return created({ stored: row });
  } catch (e) {
    return serverError("memory 저장 실패", e);
  }
}
