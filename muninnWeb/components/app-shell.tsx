"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { HmSidebar, HmHeader, HmStatusBar } from "@/components/shell";
import { MuninnCopilot } from "@/components/muninn-copilot";
import { useWorkspace } from "@/lib/workspace-context";
import { navPath, sectionFromPath } from "@/lib/nav";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/use-theme";

// 프로토타입 HmApp 의 셸(sidebar + header + main + statusbar)을 Next.js layout 으로 이관.
// 라우팅 콜백(onNav/onSwitchWorkspace/onNotif)은 여기서 next/navigation 으로 주입한다.
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const section = sectionFromPath(pathname);
  // 라이트/다크 테마. carrier 는 <html>(use-theme 가 관리)로 단일화 — 여기선 토글 버튼 아이콘과
  // 토글 콜백만 쓴다. data-theme 를 .app 에 또 두면 React 지연으로 첫 페인트 FOUC 가 생기므로 두지 않는다.
  const { resolved: theme, toggle: toggleTheme } = useTheme();

  // 모바일(≤768px) 오프캔버스 사이드바 드로어 상태. 데스크탑에서는 CSS 가 무시한다.
  // 드로어 안 nav/워크스페이스 전환 시 직접 닫는다(라우트 effect 대신 — 정확하고 setState-in-effect 회피).
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // 드로어가 열리면 modal 처럼: ESC 로 닫고, 배경 본문 스크롤을 잠근다.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

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
      data-drawer={drawerOpen ? "open" : "closed"}
      data-app="hm"
    >
      <HmSidebar
        section={section}
        onNav={(name: string) => {
          setDrawerOpen(false);
          router.push(navPath(name));
        }}
        workspaceId={workspaceId}
        onSwitchWorkspace={(id: string) => {
          setDrawerOpen(false);
          setWorkspaceId(id);
          router.push("/");
        }}
      />
      {/* 모바일 드로어 백드롭 — 열림 상태에서만 활성(CSS), 클릭 시 닫힘 */}
      <div
        className="hm-drawer-backdrop"
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />
      <HmHeader
        pendingApprovals={awaitingRuns.length}
        drawerOpen={drawerOpen}
        onMenu={() => setDrawerOpen((v) => !v)}
        theme={theme}
        onToggleTheme={toggleTheme}
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
