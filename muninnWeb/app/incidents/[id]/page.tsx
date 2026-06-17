"use client";

import { useRouter, useParams } from "next/navigation";
import { HmIncidentDetail } from "@/components/incidents";

export default function IncidentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  return (
    <HmIncidentDetail
      issueName={params.id}
      onOpenRun={(id: string) => router.push(`/runs/${id}`)}
      onBack={() => router.push("/incidents")}
    />
  );
}
