// Muninn API — 상태변경 라우트 인증 헬퍼(서버 전용).
//
// 설계: 상태를 바꾸는 라우트(보고·승인·거절·메모리 저장·위임·webhook)는 외부에서 임의 호출되면
// 승인 우회·위임 남용·메모리 포이즈닝이 가능하다(코드 리뷰 CRITICAL). 프로토타입 단계의 최소 방어로,
// `MUNINN_API_TOKEN` 이 설정돼 있으면 `Authorization: Bearer <token>` 일치를 요구한다.
// 런타임 에이전트(runner.py)와 operator 는 동일 토큰으로 Bearer 를 보낸다.
//
// 미설정(dev 모드)이면 허용하되, 프로세스 수명당 1회 경고 로그를 남긴다(인증 비활성 경고).

import { NextRequest } from "next/server";

let _warnedNoToken = false;

/** 정상이면 null, 실패면 401 JSON Response 를 반환한다(라우트가 그대로 return). */
export function requireAuth(req: NextRequest): Response | null {
  const expected = process.env.MUNINN_API_TOKEN;

  // dev 모드: 토큰 미설정 → 허용하되 1회 경고.
  if (!expected) {
    if (!_warnedNoToken) {
      _warnedNoToken = true;
      console.warn(
        "[muninn][auth] MUNINN_API_TOKEN 미설정 — 상태변경 API 인증이 비활성화됐습니다(dev 모드). " +
          "프로덕션/공유 환경에서는 MUNINN_API_TOKEN 을 설정하세요.",
      );
    }
    return null;
  }

  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const presented = m?.[1]?.trim();

  if (!presented || !timingSafeEqual(presented, expected)) {
    return new Response(
      JSON.stringify({ error: "unauthorized", detail: "유효한 Bearer 토큰이 필요합니다(Authorization 헤더)." }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return null;
}

// 길이 노출/타이밍 차이를 줄인 상수시간 비교(완벽한 보장은 아니나 == 보다 안전).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
