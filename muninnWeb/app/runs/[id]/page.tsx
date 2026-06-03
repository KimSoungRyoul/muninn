"use client";

import { useRouter, useParams } from "next/navigation";
import { HmRunDetail } from "@/components/runs";

export default function RunDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // 프로토타입과 동일: run_61a45d8 은 승인 대기(awaiting) 데모 런
  const awaitingMode = params.id === "run_61a45d8";
  return (
    <HmRunDetail
      runId={params.id}
      awaitingMode={awaitingMode}
      onBack={() => router.push("/apps")}
    />
  );
}
