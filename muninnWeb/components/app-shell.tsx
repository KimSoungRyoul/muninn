"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { HmSidebar, HmHeader, HmStatusBar } from "@/components/shell";
import { MuninnCopilot } from "@/components/muninn-copilot";
import { useWorkspace } from "@/lib/workspace-context";
import { navPath, sectionFromPath } from "@/lib/nav";
import { useApi } from "@/lib/use-api";

// 프로토타입 HmApp 의 셸(sidebar + header + main + statusbar)을 Next.js layout 으로 이관.
// 라우팅 콜백(onNav/onSwitchWorkspace/onNotif)은 여기서 next/navigation 으로 주입한다.
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const section = sectionFromPath(pathname);

  // 승인 대기(awaiting) run 을 현재 워크스페이스 기준으로 집계 — 대시보드 KPI 와 동일한 소스.
  // 가장 오래된 awaiting run 을 벨 클릭 시 열도록 연결한다. mock 직접 참조 대신 API 로 조회한다.
  const { data: apps } = useApi<any[]>(`/api/apps?workspace=${encodeURIComponent(workspaceId)}`);
  const { data: liveAwaiting } = useApi<any[]>(`/api/runs?live=true&status=awaiting`);
  const wsAppNames = new Set((apps ?? []).map((a) => a.name));
  const awaitingRuns = (liveAwaiting ?? []).filter((r) => wsAppNames.has(r.app));
  const oldestAwaiting = awaitingRuns.reduce(
    (acc, r) => (acc && new Date(acc.started) <= new Date(r.started) ? acc : r),
    awaitingRuns[0]
  );

  return (
    <div
      className="app"
      data-density="comfortable"
      data-sidebar="expanded"
      data-app="hm"
      data-theme="light"
    >
      <HmSidebar
        section={section}
        onNav={(name: string) => router.push(navPath(name))}
        workspaceId={workspaceId}
        onSwitchWorkspace={(id: string) => {
          setWorkspaceId(id);
          router.push("/");
        }}
      />
      <HmHeader
        pendingApprovals={awaitingRuns.length}
        onNotif={() =>
          router.push(oldestAwaiting ? `/runs/${oldestAwaiting.id}` : "/apps")
        }
      />
      <main className="main">{children}</main>
      <HmStatusBar wsConnected={true} queueDepth={0} />
      {/* CopilotKit 사이드바 + readable context + frontend tools */}
      <MuninnCopilot />
    </div>
  );
}
