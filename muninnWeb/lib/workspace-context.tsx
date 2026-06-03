"use client";

import React, { createContext, useContext, useState } from "react";
import { WORKSPACES } from "@/lib/data";
import type { Workspace } from "@/lib/types";

// 프로토타입 HmApp 의 workspaceId state 를 앱 전역 Context 로 승격.
interface WorkspaceCtxValue {
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  workspace: Workspace;
}

const WorkspaceCtx = createContext<WorkspaceCtxValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string>("ws_ai");
  const workspace = WORKSPACES.find((w) => w.id === workspaceId) ?? WORKSPACES[0];
  return (
    <WorkspaceCtx.Provider value={{ workspaceId, setWorkspaceId, workspace }}>
      {children}
    </WorkspaceCtx.Provider>
  );
}

export function useWorkspace(): WorkspaceCtxValue {
  const v = useContext(WorkspaceCtx);
  if (!v) throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  return v;
}
