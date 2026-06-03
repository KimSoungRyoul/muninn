"use client";

import { useRouter } from "next/navigation";
import { HmAppsList } from "@/components/pages";
import { useWorkspace } from "@/lib/workspace-context";
import { appPath } from "@/lib/nav";

export default function AppsPage() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  return (
    <HmAppsList
      workspaceId={workspaceId}
      onOpenApp={(id: string, tab?: string) => router.push(appPath(id, tab))}
      onNewApp={() => router.push("/apps/new")}
    />
  );
}
