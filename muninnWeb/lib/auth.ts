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
//   2.5) **same-origin 콘솔 요청**(CONTRACT §C2): 토큰이 없어도, 인증이 켜진 환경에서 브라우저
//        콘솔 fetch(상태변경 메서드 + sec-fetch-site=same-origin + Origin host 일치)는 허용한다.
//        sec-fetch-site 는 브라우저 fetch/XHR 의 forbidden header 라 브라우저-내 위조를 막지만,
//        비브라우저 클라이언트(curl/httpie/서버측/SSRF)는 임의 헤더를 자유롭게 설정할 수 있으므로
//        이 우회는 위조 불가가 아니다 — **인증은 켜졌으나 콘솔 SSO 가 미구성인 환경의 완화책**일 뿐이다.
//        보안 강조 환경은 OIDC 로 콘솔도 토큰을 받게 하고(아래 (1)), 고위험 라우트는
//        OIDC_OPERATOR_GROUP 강제로 콘솔 우회를 원천 차단한다(이 경우 콘솔도 SSO 토큰 필요).
//        콘솔(runs.tsx 의 승인/거절 fetch)은 헤더 변경 없이 동작하고, 머신 경로(runner.py urllib —
//        sec-fetch-site 없음)는 토큰 필수가 그대로 유지된다.
//        머신 전용 경로(report/recall-report)는 이 콘솔 우회를 허용하지 않는다(opts.allowConsole=false).
//   3) 둘 다 미설정 → dev 모드 허용 + 프로세스 수명당 1회 경고.
//
// **고위험 라우트(requireOperator) 와 콘솔 우회는 양립 불가**: requireOperator 가 켜졌고
// OIDC_OPERATOR_GROUP 이 설정된 "운영자 그룹 강제" 환경에서는, 토큰 미제시/정적 토큰/콘솔 우회를
// 모두 거부하고 **검증된 OIDC JWT + operator claim** 만 통과시킨다(approve/reject 가 운영자 OIDC 전용).
// OIDC_OPERATOR_GROUP 미설정(dev/정적 토큰만) 환경에서는 현행 완화(일반 인증 + 콘솔 우회)를 유지한다.
//
// async 인 이유: JWKS 원격 조회/검증이 비동기다. 호출부(라우트)는 `await requireAuth(req)` 한다.

import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

let _warnedNoAuth = false;
let _warnedNoAudience = false;

// OIDC 설정 — env 에서 1회 읽는다.
const OIDC_ISSUER = process.env.MUNINN_OIDC_ISSUER;
const OIDC_AUDIENCE = process.env.MUNINN_OIDC_AUDIENCE;
// 고위험 라우트(approve/reject)에 요구할 운영자 group/role claim(옵션). 설정 시 해당 group/role 을
// 가진 JWT 만 승인/거절을 호출할 수 있다(authz). 미설정이면 현행 유지(인증된 JWT 면 허용).
const OIDC_OPERATOR_GROUP = process.env.MUNINN_OIDC_OPERATOR_GROUP?.trim() || undefined;
// JWKS_URI 미설정 시 issuer 기반 표준 경로로 디스커버리(.well-known/jwks.json) — issuer 끝 슬래시 정규화.
const OIDC_JWKS_URI =
  process.env.MUNINN_OIDC_JWKS_URI ||
  (OIDC_ISSUER ? `${OIDC_ISSUER.replace(/\/+$/, "")}/.well-known/jwks.json` : undefined);

function oidcEnabled(): boolean {
  return Boolean(OIDC_ISSUER && OIDC_JWKS_URI);
}

// 인증이 켜진 환경인지(OIDC 또는 정적 토큰 중 하나라도 설정). dev 모드 판별의 반대.
export function authEnabled(): boolean {
  return oidcEnabled() || Boolean(process.env.MUNINN_API_TOKEN);
}

// 상태변경(unsafe) HTTP 메서드 — same-origin 콘솔 우회는 상태변경에만 허용한다.
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * same-origin 브라우저 콘솔 요청인지 — 다음을 모두 만족할 때만 true:
 *   (a) 상태변경(unsafe) 메서드(allowSafeMethods=true 면 GET/HEAD 등 read 도 허용 — 콘솔 read 게이트),
 *   (b) sec-fetch-site == "same-origin" (same-site 제외 — 형제 서브도메인 우회 차단, 리뷰 MEDIUM),
 *   (c) Origin 헤더의 host 가 요청 host(Host / X-Forwarded-Host)와 일치(2차 검증).
 *
 * sec-fetch-site 는 브라우저 fetch/XHR 의 forbidden header 라 브라우저-내 위조는 막지만,
 * 비브라우저 클라이언트(curl/httpie/서버측/SSRF)는 임의 헤더를 위조할 수 있으므로 이 신호만으로는
 * 안전하지 않다. 따라서 이 우회는 "위조 불가" 가 아니라 **콘솔 SSO 미구성 환경의 완화책**이며,
 * 고위험 라우트(requireOperator+OIDC_OPERATOR_GROUP)에서는 호출되기 전에 차단된다(requireAuth 참고).
 * 머신 경로(runner.py urllib)는 sec-fetch-site 가 없어 false → 토큰 필수.
 */
function isSameOriginConsole(req: NextRequest, allowSafeMethods = false): boolean {
  if (!allowSafeMethods && !STATE_CHANGING_METHODS.has(req.method.toUpperCase())) return false;
  const site = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (site !== "same-origin") return false;
  // (c) Origin host 2차 검증 — Origin 의 host 가 요청이 도달한 host 와 일치해야 한다.
  //     Origin 이 없으면(GET/same-origin 일부에서 생략될 수 있음) sec-fetch-site=same-origin 만으로
  //     보고, Origin 이 있을 때는 반드시 일치를 요구한다(불일치 = 우회 거부).
  const origin = req.headers.get("origin")?.trim();
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return false; // 파싱 불가한 Origin → 신뢰하지 않음.
    }
    const reqHost = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (!reqHost || originHost !== reqHost) return false;
  }
  return true;
}

/** requireAuth 옵션. */
export interface RequireAuthOpts {
  // same-origin 콘솔(미인증 fetch)을 허용할지(기본 true). report/recall-report 같은 머신 전용
  // 경로는 false 로 콘솔 우회를 막아 토큰을 강제한다.
  allowConsole?: boolean;
  // read(GET/HEAD 등 safe 메서드)에도 same-origin 콘솔 우회를 허용할지(기본 false). recall(POST)·
  // GET /api/memories 처럼 콘솔이 토큰 없이 읽는 경로에 켜서, 미인증 외부(머신/curl) read 는 막되
  // 콘솔 read 는 통과시킨다(리뷰 MEDIUM — recall/GET memories 인증 게이트).
  allowConsoleRead?: boolean;
  // 검증된 JWT 에 이 group/role claim(MUNINN_OIDC_OPERATOR_GROUP)을 요구할지(고위험 authz; approve/reject).
  requireOperator?: boolean;
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
 * 정상이면 null, 실패면 401(또는 403) JSON Response 를 반환한다(라우트가 그대로 return).
 * 사람용 콘솔 경로와 에이전트→API 경로 모두 같은 Authorization: Bearer 헤더를 쓴다.
 *
 * opts.allowConsole(기본 true): same-origin 콘솔 fetch(토큰 없이)를 허용할지. 머신 전용 경로
 *   (report/recall-report)는 false 로 호출해 콘솔 우회를 막고 토큰을 강제한다.
 * opts.requireOperator: 검증된 OIDC JWT 에 운영자 group/role(MUNINN_OIDC_OPERATOR_GROUP) 을
 *   요구할지(approve/reject 같은 고위험 authz). OIDC_OPERATOR_GROUP 설정 시에는 콘솔 우회·정적 토큰·
 *   무토큰을 모두 거부하고 검증된 OIDC JWT+operator claim 만 통과시킨다. env 미설정 시 무시(현행 완화 유지).
 */
export async function requireAuth(req: NextRequest, opts: RequireAuthOpts = {}): Promise<Response | null> {
  const { allowConsole = true, allowConsoleRead = false, requireOperator = false } = opts;
  const staticToken = process.env.MUNINN_API_TOKEN;
  const presented = bearer(req);
  // "운영자 그룹 강제" 환경 — requireOperator 경로에서 OIDC 검증된 operator claim 만 통과시킨다.
  const operatorGroupEnforced = requireOperator && Boolean(OIDC_OPERATOR_GROUP);

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

  // OIDC 활성인데 audience 미설정이면 token confusion(타 audience 토큰 수용) 위험 — 1회 경고.
  // requireOperator(고위험) 경로는 경고를 강화한다(audience 미설정 시 IdP 의 임의 클라이언트 토큰이
  // operator claim 만 맞으면 통과할 수 있으므로 MUNINN_OIDC_AUDIENCE 설정을 강력 권고).
  if (oidcEnabled() && !OIDC_AUDIENCE && !_warnedNoAudience) {
    _warnedNoAudience = true;
    console.warn(
      "[muninn][auth] MUNINN_OIDC_AUDIENCE 미설정 — OIDC JWT audience 검증이 생략됩니다(token confusion 위험). " +
        "동일 issuer 의 타 서비스용 토큰이 수용될 수 있으니, 특히 고위험 라우트(approve/reject)를 쓰는 " +
        "환경에서는 MUNINN_OIDC_AUDIENCE 를 반드시 설정하세요.",
    );
  }

  // (1) OIDC 설정됨 → JWT 검증(사람용 콘솔/SSO). 실패해도 정적 토큰이 있으면 폴백(에이전트 경로).
  if (oidcEnabled() && presented) {
    const verified = await verifyOidcJwt(presented);
    if (verified) {
      // 고위험 authz: 운영자 group/role 요구 시(approve/reject), claim 검증. 미충족이면 403.
      if (requireOperator && OIDC_OPERATOR_GROUP && !hasOperatorClaim(verified)) {
        return forbiddenResponse(`이 작업에는 운영자 권한(${OIDC_OPERATOR_GROUP})이 필요합니다.`);
      }
      return null;
    }
    // JWT 검증 실패 — 정적 토큰이 없으면 콘솔 폴백 여부를 보고 결정, 있으면 정적 토큰 비교로 폴백.
  }

  // (2) 정적 토큰 비교(에이전트→API 경로). OIDC 미설정이거나 JWT 폴백.
  if (staticToken && presented && timingSafeEqual(presented, staticToken)) {
    // 정적 토큰(머신 자격)으로는 운영자 group claim 을 증명할 수 없다. requireOperator 가 켜졌고
    // 운영자 group 이 강제된 환경에서는 정적 토큰을 고위험 결정에 쓰지 못하게 막는다(콘솔 OIDC 전용).
    if (operatorGroupEnforced) {
      return forbiddenResponse(`이 작업에는 운영자 OIDC 토큰(${OIDC_OPERATOR_GROUP})이 필요합니다(정적 토큰 불가).`);
    }
    return null;
  }

  // (2.5) same-origin 콘솔 우회(CONTRACT §C2): 토큰이 없거나 검증 실패해도, 인증 환경에서 브라우저
  // 콘솔의 상태변경 fetch(sec-fetch-site=same-origin + Origin host 일치)는 허용한다.
  //   ⚠ 단, "운영자 그룹 강제"(requireOperator && OIDC_OPERATOR_GROUP) 경로에서는 콘솔 우회를 절대
  //   허용하지 않는다 — 토큰 미제시/콘솔 우회는 operator claim 을 증명할 수 없으므로 무조건 차단한다.
  //   이 가드를 콘솔 우회 블록 *진입 전*에 둬서, 토큰 미제시 요청이 (1)(2) 를 건너뛰고 우회만 통과해
  //   requireOperator 가 무력화되던 버그(2회차 CRITICAL)를 닫는다.
  //   머신 전용 경로(report/recall-report)는 allowConsole=false 로 호출돼 애초에 진입하지 않는다.
  if (allowConsole && !operatorGroupEnforced && isSameOriginConsole(req, allowConsoleRead)) {
    return null;
  }

  // 운영자 그룹 강제 경로인데 여기 도달 = OIDC operator claim 검증을 통과하지 못함(무토큰/정적/콘솔/검증실패).
  if (operatorGroupEnforced) {
    return forbiddenResponse(`이 작업에는 운영자 OIDC 토큰(${OIDC_OPERATOR_GROUP})이 필요합니다.`);
  }

  if (!presented) {
    return unauthorizedResponse("유효한 Bearer 토큰이 필요합니다(Authorization 헤더).");
  }
  return unauthorizedResponse("인증 실패 — 유효한 Bearer 토큰(OIDC JWT 또는 정적 토큰)이 필요합니다.");
}

/** Bearer JWT 를 JWKS 로 검증(issuer/audience/exp/서명). 성공 시 payload, 실패 시 null. */
async function verifyOidcJwt(token: string): Promise<JWTPayload | null> {
  // 정적 토큰은 JWT(점 2개) 형태가 아니므로, OIDC 검증 시도 전에 형태로 빠르게 걸러 폴백 노이즈를 줄인다.
  if (token.split(".").length !== 3) return null;
  try {
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: OIDC_ISSUER,
      // audience 가 설정됐으면 강제. 미설정 시 검증 생략(token confusion 위험) — requireAuth 가 OIDC 활성+
      // audience 미설정이면 1회 경고하고, 고위험 라우트에선 설정을 강력 권고한다. CONTRACT §C2/리뷰 MEDIUM.
      ...(OIDC_AUDIENCE ? { audience: OIDC_AUDIENCE } : {}),
    });
    return payload;
  } catch {
    // 서명/issuer/audience/exp 불일치 — 검증 실패.
    return null;
  }
}

/**
 * JWT payload 에 운영자 group/role claim(MUNINN_OIDC_OPERATOR_GROUP)이 있는지.
 * 표준적이지 않은 IdP claim 명을 폭넓게 수용: groups / roles / role / scope(공백분리) 를 본다.
 */
function hasOperatorClaim(payload: JWTPayload): boolean {
  if (!OIDC_OPERATOR_GROUP) return true;
  const target = OIDC_OPERATOR_GROUP;
  const values: string[] = [];
  for (const key of ["groups", "roles", "role", "scope", "scp"]) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string") values.push(...v.split(/[\s,]+/).filter(Boolean));
    else if (Array.isArray(v)) values.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return values.includes(target);
}

function forbiddenResponse(detail: string): Response {
  return new Response(
    JSON.stringify({ error: "forbidden", detail }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

// 길이 노출/타이밍 차이를 줄인 상수시간 비교(완벽한 보장은 아니나 == 보다 안전).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
