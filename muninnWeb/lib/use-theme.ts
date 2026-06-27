"use client";

import { useCallback, useSyncExternalStore } from "react";

// 테마 토글 — light/dark. 명시 선택은 localStorage 에 저장하고, 없으면 시스템 설정을 따른다.
// 토큰은 [data-theme="dark"] 로 전부 flip 되므로(app/tokens.css), data-theme 를 <html> 과
// .app 양쪽에 둔다: <html> 은 layout 의 pre-hydration 스크립트가 즉시 칠해 FOUC 를 막고,
// .app 은 hm 전용 컴파운드 규칙([data-theme="dark"][data-app="hm"])을 위해 필요하다.

const KEY = "muninn-theme";
const CHANGE_EVENT = "muninn-theme-change";

type Theme = "light" | "dark";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  // storage 이벤트는 다른 탭에서만 발생 → 같은 탭 토글은 커스텀 이벤트로 통지.
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  mql.addEventListener("change", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
    mql.removeEventListener("change", cb);
  };
}

// SSR/하이드레이션 동안은 "light"(layout 인라인 스크립트가 <html> 을 이미 칠해 화면은 일치).
const getSnapshot = (): Theme => stored() ?? systemTheme();
const getServerSnapshot = (): Theme => "light";

export function useTheme() {
  const resolved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode 등 — 무시 */
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
      // CopilotKit v2 는 .dark 클래스 기반 다크모드 → <html>.dark 를 함께 토글한다.
      // (muninn 토큰도 `[data-theme="dark"], .dark` 로 .dark 를 매칭하므로 정합적.)
      document.documentElement.classList.toggle("dark", next === "dark");
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
  }, []);
  const toggle = useCallback(() => {
    setTheme((stored() ?? systemTheme()) === "dark" ? "light" : "dark");
  }, [setTheme]);
  return { resolved, setTheme, toggle };
}
