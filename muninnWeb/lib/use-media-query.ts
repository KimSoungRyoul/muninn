"use client";

import { useEffect, useState } from "react";

// CSS media query 를 React 상태로 구독한다. SSR/최초 렌더는 false 로 시작해
// 하이드레이션 후 실제 값으로 보정한다(클라이언트 전용 보조 — 레이아웃은 CSS 가 주도).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
