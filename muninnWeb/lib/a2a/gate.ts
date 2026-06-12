// A2A 서버 게이트 — POST(JSON-RPC)와 GET(레지스트리·Card) 라우트가 공유한다.
// fail-closed: 기본 비활성(MUNINN_A2A_ENABLED=1 필요). 디스커버리 표면까지 "기능 전체 on/off" 로 덮어
// 무인증으로 HuginnAgent 목록·source repo 토폴로지가 새지 않게 한다(설계 §7).

export function a2aServerEnabled(): boolean {
  return process.env.MUNINN_A2A_ENABLED === "1";
}

// 인증 게이트(fail-closed): 기본 bearer 필수. 로컬 dev 는 MUNINN_A2A_AUTH_DISABLED=1 로 명시적 우회.
// 운영에선 bearer→SA/RBAC/workspace 매핑으로 확장(설계 §7) — 현재는 형식 검사(존재 강제)까지.
export function a2aAuthOk(req: Request): boolean {
  if (process.env.MUNINN_A2A_AUTH_DISABLED === "1") return true;
  // "Bearer " 뒤에 비어있지 않은 토큰이 있어야 통과(빈 토큰 "Bearer " 거부). PoC 는 존재만 검사, 운영은 토큰 검증 확장.
  const m = /^bearer\s+(\S.*)$/i.exec(req.headers.get("authorization") ?? "");
  return !!m && m[1].trim().length > 0;
}

// 인증 실패는 A2A 스펙대로 HTTP 401 + WWW-Authenticate 로 신호한다(JSON-RPC 에러코드가 아님).
// 스펙 인지 클라이언트는 401 을 인증 챌린지로 인식한다. GET/POST 라우트가 공유한다.
export function a2aUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized", note: "Authorization: Bearer 필요" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="muninn-a2a"' },
  });
}

// 서버 비활성(게이트 off) — 라우트 자체를 숨기듯 404. GET/POST 공유.
export function a2aDisabled(): Response {
  return new Response(JSON.stringify({ error: "not-found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
