"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// 하이드레이션 이후인지(클라이언트 마운트 완료) 여부. SSR/하이드레이션 동안 false,
// 클라이언트에서 true. useSyncExternalStore 라 effect 내 setState 없이 안전하다.
const noopSubscribe = () => () => {};
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

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
