// Muninn API — 상태변경 라우트 인증 헬퍼(서버 전용). CONTRACT §1.
//
// 설계: 상태를 바꾸는 라우트(보고·승인·거절·메모리 저장·위임·webhook)는 외부에서 임의 호출되면
// 승인 우회·위임 남용·메모리 포이즌이 가능하다(코드 리뷰 CRITICAL). 두 경로를 구분한다:
//
//   - **사람용 콘솔 경로**(운영자 승인/거절/위임): OIDC(JWT) 검증이 적합 — 운영자 SSO 토큰.
//   - **에이전트→API 경로**(runner.py 의 보고/메모리 저장): 정적 토큰(MUNINN_API_TOKEN) Bearer.
//
// requireAuth 우선순위(둘 다 같은 Authorization: Bearer 헤더를 받지만 검증 방식이 다르다):
//   1) OIDC 설정됨(MUNINN_OIDC_ISSUER 등) → Bearer 를 JWKS 로 JWT 검증(issuer/audience/exp).
//      JWT 검증 실패 시, 정적 토큰이 설정돼 있으면 그쪽으로 폴백한다(에이전트 토큰과 공존 가능).
//   2) 정적 토큰(MUNINN_API_TOKEN) 설정됨 → Bearer 동일성(상수시간) 비교.
//   3) 둘 다 미설정 → dev 모드 허용 + 프로세스 수명당 1회 경고.
//
// async 인 이유: JWKS 원격 조회/검증이 비동기다. 호출부(라우트)는 `await requireAuth(req)` 한다.

import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

let _warnedNoAuth = false;

// OIDC 설정 — env 에서 1회 읽는다.
const OIDC_ISSUER = process.env.MUNINN_OIDC_ISSUER;
const OIDC_AUDIENCE = process.env.MUNINN_OIDC_AUDIENCE;
// JWKS_URI 미설정 시 issuer 기반 표준 경로로 디스커버리(.well-known/jwks.json) — issuer 끝 슬래시 정규화.
const OIDC_JWKS_URI =
  process.env.MUNINN_OIDC_JWKS_URI ||
  (OIDC_ISSUER ? `${OIDC_ISSUER.replace(/\/+$/, "")}/.well-known/jwks.json` : undefined);

function oidcEnabled(): boolean {
  return Boolean(OIDC_ISSUER && OIDC_JWKS_URI);
}

// JWKS set 은 프로세스 1회 생성(jose 가 키를 캐시·롤오버 처리). 모듈 평가 시점엔 만들지 않고
// 첫 OIDC 검증에서 lazy 생성한다(테스트/빌드 시 불필요한 네트워크 배선 회피).
let _jwks: JWTVerifyGetKey | null = null;
function jwks(): JWTVerifyGetKey {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(OIDC_JWKS_URI as string));
  return _jwks;
}

function bearer(req: NextRequest): string | undefined {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || undefined;
}

function unauthorizedResponse(detail: string): Response {
  return new Response(
    JSON.stringify({ error: "unauthorized", detail }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

/**
 * 정상이면 null, 실패면 401 JSON Response 를 반환한다(라우트가 그대로 return).
 * 사람용 콘솔 경로와 에이전트→API 경로 모두 같은 Authorization: Bearer 헤더를 쓴다.
 */
export async function requireAuth(req: NextRequest): Promise<Response | null> {
  const staticToken = process.env.MUNINN_API_TOKEN;
  const presented = bearer(req);

  // (3) dev 모드: OIDC 도, 정적 토큰도 미설정 → 허용하되 1회 경고.
  if (!oidcEnabled() && !staticToken) {
    if (!_warnedNoAuth) {
      _warnedNoAuth = true;
      console.warn(
        "[muninn][auth] MUNINN_API_TOKEN / MUNINN_OIDC_* 미설정 — 상태변경 API 인증이 비활성화됐습니다(dev 모드). " +
          "프로덕션/공유 환경에서는 OIDC 또는 MUNINN_API_TOKEN 을 설정하세요.",
      );
    }
    return null;
  }

  if (!presented) {
    return unauthorizedResponse("유효한 Bearer 토큰이 필요합니다(Authorization 헤더).");
  }

  // (1) OIDC 설정됨 → JWT 검증(사람용 콘솔/SSO). 실패해도 정적 토큰이 있으면 폴백(에이전트 경로).
  if (oidcEnabled()) {
    const verified = await verifyOidcJwt(presented);
    if (verified) return null;
    // JWT 검증 실패 — 정적 토큰이 없으면 거부, 있으면 정적 토큰 비교로 폴백.
    if (!staticToken) {
      return unauthorizedResponse("OIDC JWT 검증 실패(issuer/audience/exp/서명 확인).");
    }
  }

  // (2) 정적 토큰 비교(에이전트→API 경로). OIDC 미설정이거나 JWT 폴백.
  if (staticToken && timingSafeEqual(presented, staticToken)) {
    return null;
  }

  return unauthorizedResponse("유효한 Bearer 토큰이 필요합니다(Authorization 헤더).");
}

/** Bearer JWT 를 JWKS 로 검증(issuer/audience/exp/서명). 성공 시 payload, 실패 시 null. */
async function verifyOidcJwt(token: string): Promise<JWTPayload | null> {
  // 정적 토큰은 JWT(점 2개) 형태가 아니므로, OIDC 검증 시도 전에 형태로 빠르게 걸러 폴백 노이즈를 줄인다.
  if (token.split(".").length !== 3) return null;
  try {
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: OIDC_ISSUER,
      ...(OIDC_AUDIENCE ? { audience: OIDC_AUDIENCE } : {}),
    });
    return payload;
  } catch {
    // 서명/issuer/audience/exp 불일치 — 검증 실패.
    return null;
  }
}

// 길이 노출/타이밍 차이를 줄인 상수시간 비교(완벽한 보장은 아니나 == 보다 안전).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
