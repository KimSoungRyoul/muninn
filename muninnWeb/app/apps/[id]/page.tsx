"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { HmAppDetail } from "@/components/pages";

export default function AppDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? undefined;
  return (
    <HmAppDetail
      appId={params.id}
      initialTab={tab}
      onBack={() => router.push("/apps")}
      onOpenRun={(id: string) => router.push(`/runs/${id}`)}
    />
  );
}
