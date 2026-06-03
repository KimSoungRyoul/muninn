"use client";

import { useRouter } from "next/navigation";
import { HmNewApp } from "@/components/new-app";
import { useWorkspace } from "@/lib/workspace-context";

export default function NewAppPage() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  return (
    <HmNewApp
      workspaceId={workspaceId}
      onCancel={() => router.push("/apps")}
      onCreated={() => router.push("/apps")}
    />
  );
}
