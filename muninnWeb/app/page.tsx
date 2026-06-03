"use client";

import { useRouter } from "next/navigation";
import { HmDashboard } from "@/components/dashboard";
import { useWorkspace } from "@/lib/workspace-context";
import { navPath, appPath } from "@/lib/nav";

export default function DashboardPage() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  return (
    <HmDashboard
      workspaceId={workspaceId}
      onNav={(name: string) => router.push(navPath(name))}
      onOpenRun={(id: string) => router.push(`/runs/${id}`)}
      onOpenApp={(id: string, tab?: string) => router.push(appPath(id, tab))}
    />
  );
}
