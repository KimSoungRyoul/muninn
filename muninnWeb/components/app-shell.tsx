"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { HmSidebar, HmHeader, HmStatusBar } from "@/components/shell";
import { MuninnCopilot } from "@/components/muninn-copilot";
import { useWorkspace } from "@/lib/workspace-context";
import { navPath, sectionFromPath } from "@/lib/nav";

// 프로토타입 HmApp 의 셸(sidebar + header + main + statusbar)을 Next.js layout 으로 이관.
// 라우팅 콜백(onNav/onSwitchWorkspace/onNotif)은 여기서 next/navigation 으로 주입한다.
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const section = sectionFromPath(pathname);

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
      <HmHeader onNotif={() => router.push("/runs/run_61a45d8")} />
      <main className="main">{children}</main>
      <HmStatusBar wsConnected={true} queueDepth={0} />
      {/* CopilotKit 사이드바 + readable context + frontend tools */}
      <MuninnCopilot />
    </div>
  );
}
