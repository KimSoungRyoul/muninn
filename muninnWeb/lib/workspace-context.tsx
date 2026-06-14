"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Workspace } from "@/lib/types";

// 프로토타입 HmApp 의 workspaceId state 를 앱 전역 Context 로 승격.
// 워크스페이스 목록은 mock 모듈 직접 import 대신 /api/workspaces 로 조회한다(마이그레이션 계약).
interface WorkspaceCtxValue {
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  workspace: Workspace;
  workspaces: Workspace[];
  loading: boolean;
}

// 목록 로딩 전/조회 실패 시 ws.name 등 접근이 깨지지 않게 쓰는 최소 placeholder.
const FALLBACK_WS: Workspace = {
  id: "ws_ai",
  name: "Workspace",
  slug: "workspace",
  desc: "",
  color: "#10B981",
  appCount: 0,
  role: "owner",
};

const WorkspaceCtx = createContext<WorkspaceCtxValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string>(FALLBACK_WS.id);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/workspaces", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!alive) return;
        const list: Workspace[] = Array.isArray(data) ? data : [];
        setWorkspaces(list);
        // 현재 선택이 목록에 없으면 첫 워크스페이스로 보정.
        setWorkspaceId((prev) => (list.some((w) => w.id === prev) ? prev : list[0]?.id ?? prev));
      })
      .catch(() => {
        /* 조회 실패 — fallback 워크스페이스로 동작 */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const workspace = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? FALLBACK_WS;

  return (
    <WorkspaceCtx.Provider value={{ workspaceId, setWorkspaceId, workspace, workspaces, loading }}>
      {children}
    </WorkspaceCtx.Provider>
  );
}

export function useWorkspace(): WorkspaceCtxValue {
  const v = useContext(WorkspaceCtx);
  if (!v) throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  return v;
}
