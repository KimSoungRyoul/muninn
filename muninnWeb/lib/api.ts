// Muninn API — Route Handler 공통 헬퍼 + API 응답 타입.
// 설계서 §4(이벤트 흐름) · §8.1(집계) · §4.3(정규화) · §6.4(승인) 기반.

import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
export function created(data: unknown) {
  return NextResponse.json(data, { status: 201 });
}
export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
export function serverError(message: string, detail?: unknown) {
  return NextResponse.json(
    { error: message, detail: detail instanceof Error ? detail.message : detail },
    { status: 500 },
  );
}

// ---- API 응답 타입 ----

export interface PlatformTool {
  id: string;
  category: "deployment" | "observability" | "registry";
  kind: string;
  name: string;
  endpoint: string;
  status: "healthy" | "degraded" | "unreach";
  brandColor: string;
  usedByApps: number;
}

export interface AppStats {
  appId: string;
  appName: string;
  period: "24h" | "7d" | "month";
  runsCount: number;
  failedCount: number;
  successRate: number; // 0~100
  avgCostPerRun: number;
  cost: number;
}

export interface TopFailingApp {
  id: string;
  name: string;
  failed24h: number;
  runs24h: number;
}

export interface DashboardData {
  workspaceId: string;
  runs24h: number;
  failed24h: number;
  successRate: number;
  awaiting: number;
  avgCostPerRun: number;
  flow: { label: string; succ: number; fail: number; await: number }[];
  topFailing: TopFailingApp[];
  monthCost: number;
  monthCap: number;
}

// Grafana alertmanager webhook → 정규화 (설계 §4.3)
export interface NormalizedEvent {
  id: string;
  source: "grafana" | "airflow" | "argocd" | "manual";
  severity: "info" | "warning" | "error" | "critical";
  fingerprint: string;
  title: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

// webhook 수신 결과 (dedup 판정 + 이슈/런 트리거 시뮬레이션, 설계 §4.4)
export interface HookResult {
  accepted: boolean;
  reason: "new" | "recurrence" | "dedup-hit" | "below-threshold";
  event: NormalizedEvent;
  issueId: string | null;
  runId: string | null;
  dedupCount: number;
}

const SEVERITY_ORDER: Record<string, number> = { info: 0, warning: 1, error: 2, critical: 3 };
export function severityGte(a: string, threshold: string): boolean {
  return (SEVERITY_ORDER[a] ?? 0) >= (SEVERITY_ORDER[threshold] ?? 0);
}
