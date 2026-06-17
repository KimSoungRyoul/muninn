"use client";

import React from "react";
import { useRouter, useParams } from "next/navigation";
import { HmRunDetail } from "@/components/runs";

const { useState, useEffect, useCallback } = React;

export default function RunDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [vm, setVm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // 실제 run 상태를 조회해 phase/approval 로 승인 패널을 노출한다(하드코딩 run id 비교 제거).
  // dual-mode: k8s 연결 시 실 CR, 아니면 mock 폴백(source:"mock"). 조회 실패는 무시(데모 뷰 유지).
  // 단일 조회로 flagship 전체 트랜스크립트(steps) 또는 요약(RunVM)을 모두 받는다.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/runs/${encodeURIComponent(params.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setVm(data); })
      .catch(() => { if (!cancelled) setVm(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.id, reloadKey]);

  // 승인/거절 후: 상태 재조회.
  const onDecided = useCallback(() => setReloadKey((k) => k + 1), []);

  // 실 데이터의 phase/approval 로 승인 대기 여부 판정. 데이터 없으면 mock 데모(run_61a45d8) 폴백.
  const awaitingMode = vm
    ? vm.phase === "AwaitingApproval" || vm.status === "awaiting" || vm.approval === "Pending"
    : params.id === "run_61a45d8";

  return (
    <HmRunDetail
      runId={params.id}
      awaitingMode={awaitingMode}
      runVm={vm}
      loading={loading}
      onDecided={onDecided}
      onBack={() => router.push("/apps")}
    />
  );
}
