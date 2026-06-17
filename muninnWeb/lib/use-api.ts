"use client";

// 콘솔(클라이언트 컴포넌트)이 Muninn API(/api/*)를 통해 데이터를 읽는 공통 fetch 훅.
//
// 마이그레이션 계약(설계 §2 "Migration in progress"): 컴포넌트는 mock 모듈(lib/data)을 직접
// import 하지 않고 항상 이 훅으로 /api/* 를 호출한다. API 라우트는 k8s/db 연결 시 실데이터를,
// 미연결(로컬 dev) 시 mock 으로 graceful fallback 한다 — 어느 쪽이든 UI 는 동일하게 동작한다.

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseApiResult<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * url(상대경로 /api/...)을 GET 으로 조회해 JSON 을 반환한다.
 *   - url 이 null 이면 요청을 건너뛴다(조건부 조회).
 *   - reload() 로 강제 재조회.
 *   - 언마운트/url 변경 시 in-flight 응답은 무시(stale 갱신 방지).
 */
export function useApi<T = unknown>(url: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url != null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // url==null 이면 요청을 건너뛴다(loading 초기값이 (url != null) 이라 이 경우 이미 false).
    if (url == null) return;
    const myId = ++reqId.current;
    // async IIFE 안에서 상태를 갱신한다(effect 본문 동기 setState 회피, 프로젝트 컨벤션).
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const json = (await res.json()) as T;
        if (myId === reqId.current) setData(json);
      } catch (e) {
        if (myId === reqId.current) setError(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    })();
  }, [url, nonce]);

  return { data, error, loading, reload };
}
