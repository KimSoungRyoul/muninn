"use client";

import { useCallback, useSyncExternalStore } from "react";

// 테마 토글 — light/dark. 명시 선택은 localStorage 에 저장하고, 없으면 시스템 설정을 따른다.
//
// 테마 carrier 는 <html> 하나로 단일화한다: layout 의 pre-hydration 스크립트가 첫 페인트 전
// <html> 의 data-theme + .dark 를 칠하고(다크 FOUC 방지), 이후 모든 변경 소스(토글/시스템변경/
// 타 탭)는 subscribe 핸들러·setTheme 가 다시 <html> 에 반영한다. CSS 는 전부 <html> 조상 기반
// 후손 셀렉터([data-theme="dark"] ..., .dark ...)로 매칭되므로 .app 에 별도 carrier 가 필요없다.
// CopilotKit v2 도 <html>.dark 로 함께 다크가 된다.

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

// 현재 적용돼야 할 테마(저장 선택 우선, 없으면 시스템).
function current(): Theme {
  return stored() ?? systemTheme();
}

// <html> 에 data-theme 와 .dark 를 동기화(모든 변경 경로 공통).
function applyHtml(t: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.classList.toggle("dark", t === "dark");
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  // 어떤 변경(타 탭 storage / 같은 탭 토글 / 시스템 설정)이든 <html> 을 먼저 맞추고 React 에 통지.
  const handler = () => {
    applyHtml(current());
    cb();
  };
  window.addEventListener("storage", handler);
  window.addEventListener(CHANGE_EVENT, handler);
  mql.addEventListener("change", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CHANGE_EVENT, handler);
    mql.removeEventListener("change", handler);
  };
}

// SSR/하이드레이션 동안은 "light"(서버=클라 일치 → 경고 없음). 실제 다크는 pre-hydration
// 인라인 스크립트가 <html> 에 이미 칠했고, hm/전역 다크 토큰이 <html> 조상으로 매칭돼 적용된다.
const getSnapshot = (): Theme => current();
const getServerSnapshot = (): Theme => "light";

export function useTheme() {
  const resolved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode 등 — 무시 */
    }
    applyHtml(next); // 즉시 반영(토글 체감 지연 없음)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CHANGE_EVENT)); // 같은 탭 구독자(useSyncExternalStore) 통지
    }
  }, []);
  const toggle = useCallback(() => {
    setTheme(current() === "dark" ? "light" : "dark");
  }, [setTheme]);
  return { resolved, setTheme, toggle };
}
