"use client";

import { useRouter } from "next/navigation";
import { HmIncidents } from "@/components/incidents";

export default function IncidentsPage() {
  const router = useRouter();
  return <HmIncidents onOpenRun={(id: string) => router.push(`/runs/${id}`)} />;
}
