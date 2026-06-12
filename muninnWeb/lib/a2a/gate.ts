// A2A 서버 게이트 — POST(JSON-RPC)와 GET(레지스트리·Card) 라우트가 공유한다.
// fail-closed: 기본 비활성(MUNINN_A2A_ENABLED=1 필요). 디스커버리 표면까지 "기능 전체 on/off" 로 덮어
// 무인증으로 HuginnAgent 목록·source repo 토폴로지가 새지 않게 한다(설계 §7).

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";

export function a2aServerEnabled(): boolean {
  return process.env.MUNINN_A2A_ENABLED === "1";
}

// 인증 게이트 — lib/auth.ts 의 requireAuth 에 위임한다(설계 §7, 이슈 #44).
// muninn API 와 같은 자격 체계를 쓴다: 정적 토큰(MUNINN_API_TOKEN) 상수시간 비교 또는 OIDC JWT(JWKS) 검증.
// A2A 는 머신↔머신 경로이므로 same-origin 콘솔 우회는 허용하지 않는다(allowConsole=false — 토큰 필수).
// dev 모드(MUNINN_API_TOKEN/MUNINN_OIDC_* 모두 미설정)는 requireAuth 와 동일하게 허용+1회 경고 —
// 별도 우회 플래그(구 MUNINN_A2A_AUTH_DISABLED)는 인증 관행 이원화라 제거했다.
//
// opts.requireOperator: tasks/cancel 처럼 승인 결정(rejectRun)에 닿는 메서드에 켠다. OIDC_OPERATOR_GROUP
// 강제 환경에서는 운영자 OIDC JWT 만 통과(정적 토큰·무토큰 거부) — 콘솔 approve/reject 와 동일 수준.
export async function a2aRequireAuth(
  req: NextRequest,
  opts: { requireOperator?: boolean } = {},
): Promise<Response | null> {
  const denied = await requireAuth(req, { allowConsole: false, requireOperator: opts.requireOperator ?? false });
  if (!denied) return null;
  // A2A 스펙: 인증 실패는 HTTP 401 + WWW-Authenticate 챌린지로 신호한다. authz 실패(403, 운영자 claim
  // 미충족)는 챌린지 대상이 아니므로 requireAuth 의 403 응답을 그대로 쓴다.
  return denied.status === 401 ? a2aUnauthorized() : denied;
}

// 인증 실패는 A2A 스펙대로 HTTP 401 + WWW-Authenticate 로 신호한다(JSON-RPC 에러코드가 아님).
// 스펙 인지 클라이언트는 401 을 인증 챌린지로 인식한다. GET/POST 라우트가 공유한다.
export function a2aUnauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "unauthorized", note: "Authorization: Bearer 필요(MUNINN_API_TOKEN 또는 OIDC JWT)" }),
    {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="muninn-a2a"' },
    },
  );
}

// 서버 비활성(게이트 off) — 라우트 자체를 숨기듯 404. GET/POST 공유.
export function a2aDisabled(): Response {
  return new Response(JSON.stringify({ error: "not-found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
