// 프로토타입 HmApp 의 내부 route state → Next.js 파일 라우팅 매핑 헬퍼.

export function navPath(name: string): string {
  switch (name) {
    case "dashboard":
      return "/";
    case "apps":
      return "/apps";
    case "platform-tools":
      return "/settings/platform-tools";
    case "memories":
      return "/settings/memories";
    default:
      return "/";
  }
}

// 사이드바 active 섹션 판정 (프로토타입 activeSection 로직과 동일)
export function sectionFromPath(pathname: string): string {
  if (pathname.startsWith("/apps") || pathname.startsWith("/runs")) return "apps";
  if (pathname.startsWith("/settings/platform-tools")) return "platform-tools";
  if (pathname.startsWith("/settings/memories")) return "memories";
  return "dashboard";
}

export function appPath(id: string, tab?: string): string {
  return `/apps/${id}${tab ? `?tab=${tab}` : ""}`;
}
