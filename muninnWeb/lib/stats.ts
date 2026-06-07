// Muninn API — 집계 로직 (설계 §8.1: app_run_stats, 대시보드 KPI).
// mock 데이터(lib/data) 위에서 계산. 실제 구현 시 materialized view / SQL 집계로 대체.

import { APPS, LIVE_RUNS, RECENT_RUNS, FLOW } from "./data";
import type { AppStats, DashboardData, TopFailingApp } from "./api";

export function computeDashboard(workspaceId: string): DashboardData {
  const apps = APPS.filter((a) => a.workspaceId === workspaceId);
  const runs24h = apps.reduce((s, a) => s + a.runs24h, 0);
  const failed24h = apps.reduce((s, a) => s + a.failed24h, 0);
  const successRate = runs24h > 0 ? +(((runs24h - failed24h) / runs24h) * 100).toFixed(1) : 0;
  const appNames = new Set(apps.map((a) => a.name));
  const awaiting = LIVE_RUNS.filter((r) => r.status === "awaiting" && appNames.has(r.app)).length;
  const wsRuns = RECENT_RUNS.filter((r) => appNames.has(r.app));
  const avgCostPerRun = wsRuns.length
    ? +(wsRuns.reduce((s, r) => s + r.cost, 0) / wsRuns.length).toFixed(3)
    : 0;

  const topFailing: TopFailingApp[] = apps
    .filter((a) => a.failed24h > 0)
    .sort((a, b) => b.failed24h - a.failed24h)
    .slice(0, 5)
    .map((a) => ({ id: a.id, name: a.name, failed24h: a.failed24h, runs24h: a.runs24h }));

  return {
    workspaceId,
    runs24h,
    failed24h,
    successRate,
    awaiting,
    avgCostPerRun,
    flow: FLOW,
    topFailing,
    monthCost: 182.4,
    monthCap: 500,
  };
}

export function computeAppStats(
  appId: string,
  period: "24h" | "7d" | "month"
): AppStats | null {
  const app = APPS.find((a) => a.id === appId);
  if (!app) return null;

  // mock: 24h 값을 기간 배수로 외삽 (실제는 run 테이블 윈도우 집계)
  const mult = period === "24h" ? 1 : period === "7d" ? 7 : 30;
  const runsCount = app.runs24h * mult;
  const failedCount = app.failed24h * mult;
  const successRate = runsCount > 0 ? +(((runsCount - failedCount) / runsCount) * 100).toFixed(1) : 0;

  const appRuns = RECENT_RUNS.filter((r) => r.app === app.name);
  const avgCostPerRun = appRuns.length
    ? +(appRuns.reduce((s, r) => s + r.cost, 0) / appRuns.length).toFixed(3)
    : 0;

  const cost =
    period === "7d"
      ? app.cost7d
      : period === "24h"
      ? +(app.cost7d / 7).toFixed(2)
      : +((app.cost7d / 7) * 30).toFixed(2);

  return { appId, appName: app.name, period, runsCount, failedCount, successRate, avgCostPerRun, cost };
}
