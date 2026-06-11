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
  return (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
}
