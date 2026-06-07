"use client";

// Muninn 콘솔 코파일럿 — CopilotKit v2 사이드바 + readable context + frontend tools.
//
// muninnWeb 는 프로토타입(클라이언트 렌더링 mock, lib/data 의 HM_DATA)이므로, 코파일럿이
// 다루는 데이터/액션도 모두 클라이언트 측이다. 따라서 frontend tools(useFrontendTool)가
// 정확히 맞는다 — 데이터 조회는 HM_DATA 에서, 상태 변경(승인/거절)은 mock API 로,
// 네비게이션은 next/navigation 으로 처리한다.
//
// 최신 문서:
//   provider/sidebar : https://docs.copilotkit.ai/built-in-agent/quickstart
//   frontend tools   : https://docs.copilotkit.ai/built-in-agent/frontend-tools
//   readable context : https://docs.copilotkit.ai/built-in-agent/agent-app-context

import { CopilotSidebar, useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import {
  APPS,
  WORKSPACES,
  LIVE_RUNS,
  RECENT_RUNS,
  EVENTS,
  MEMORIES,
  RUN_DETAIL,
} from "@/lib/data";
import { computeDashboard, computeAppStats } from "@/lib/stats";
import { defaultAgentConfig, defaultCredentials } from "@/lib/agent-config";
import { navPath, appPath } from "@/lib/nav";
import type { Application } from "@/lib/types";

const json = (v: unknown) => JSON.stringify(v, null, 0);

// id 또는 name 으로 앱을 찾는다(코파일럿이 둘 중 무엇으로 부를지 모르므로).
function resolveApp(key: string): Application | undefined {
  const k = key.trim().toLowerCase();
  return APPS.find((a) => a.id.toLowerCase() === k || a.name.toLowerCase() === k);
}

function allRuns() {
  const byId = new Map<string, (typeof RECENT_RUNS)[number]>();
  for (const r of [...LIVE_RUNS, ...RECENT_RUNS]) if (!byId.has(r.id)) byId.set(r.id, r);
  return Array.from(byId.values());
}

export function MuninnCopilot() {
  const router = useRouter();
  const { workspaceId, workspace, setWorkspaceId } = useWorkspace();

  const wsApps = APPS.filter((a) => a.workspaceId === workspaceId);
  const dashboard = computeDashboard(workspaceId);

  // ---- readable context : 코파일럿에게 현재 콘솔 상태를 ambient 로 노출 ----
  useAgentContext({
    description: "현재 선택된 워크스페이스",
    value: { id: workspace.id, name: workspace.name, role: workspace.role, desc: workspace.desc },
  });
  useAgentContext({
    description: "현재 워크스페이스의 애플리케이션(HuginnAgent) 목록",
    value: wsApps.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      output: a.output,
      repo: a.repo,
      runs24h: a.runs24h,
      failed24h: a.failed24h,
    })),
  });
  useAgentContext({
    description: "현재 워크스페이스 대시보드 KPI(24h)",
    value: {
      runs24h: dashboard.runs24h,
      failed24h: dashboard.failed24h,
      successRate: dashboard.successRate,
      awaiting: dashboard.awaiting,
      avgCostPerRun: dashboard.avgCostPerRun,
      monthCost: dashboard.monthCost,
      monthCap: dashboard.monthCap,
      // named interface(TopFailingApp)는 JsonSerializable 의 index signature 를 만족하지 못하므로
      // 익명 객체로 매핑한다(런타임 값은 동일).
      topFailing: dashboard.topFailing.map((t) => ({ id: t.id, name: t.name, failed24h: t.failed24h, runs24h: t.runs24h })),
    },
  });
  useAgentContext({
    description: "진행 중/대기 중 실행(HuginnRun). status=awaiting 는 승인 대기.",
    value: LIVE_RUNS.map((r) => ({ id: r.id, app: r.app, status: r.status, step: r.step, max: r.max, cost: r.cost })),
  });

  // ---- 조회 도구 ----
  useFrontendTool({
    name: "list_applications",
    description: "워크스페이스의 애플리케이션(HuginnAgent) 목록을 조회한다. workspaceId 미지정 시 현재 워크스페이스, 'all' 이면 전체.",
    parameters: z.object({
      workspaceId: z.string().optional().describe("워크스페이스 id 또는 'all'. 기본=현재 워크스페이스"),
      kind: z.enum(["triton", "fastapi", "airflow", "other"]).optional().describe("앱 종류 필터"),
    }),
    handler: async ({ workspaceId: ws, kind }) => {
      let apps = APPS;
      if (ws !== "all") apps = apps.filter((a) => a.workspaceId === (ws ?? workspaceId));
      if (kind) apps = apps.filter((a) => a.kind === kind);
      return json(apps.map((a) => ({ id: a.id, name: a.name, kind: a.kind, output: a.output, repo: a.repo, runs24h: a.runs24h, failed24h: a.failed24h, cost7d: a.cost7d, lastRun: a.lastRun })));
    },
  });

  useFrontendTool({
    name: "get_application",
    description: "앱 1개의 상세(런타임 이미지/설정, 등록된 자격의 set 여부, 7일 통계)를 조회한다. app 은 id 또는 name.",
    parameters: z.object({ app: z.string().describe("앱 id 또는 name") }),
    handler: async ({ app }) => {
      const a = resolveApp(app);
      if (!a) return json({ error: "not_found", app });
      const stats = computeAppStats(a.id, "7d");
      return json({
        app: { id: a.id, name: a.name, kind: a.kind, output: a.output, repo: a.repo, workspaceId: a.workspaceId },
        agent: defaultAgentConfig(a),
        // 자격은 메타데이터(등록 여부/갱신시각)만 — 실제 값은 K8s Secret 으로만 보관/노출 금지.
        credentials: defaultCredentials(a).map((c) => ({ key: c.key, label: c.label, kind: c.kind, set: c.set, secretName: c.secretName, updatedAt: c.updatedAt })),
        stats7d: stats,
      });
    },
  });

  useFrontendTool({
    name: "list_runs",
    description: "실행(HuginnRun) 목록을 조회한다. status/app 으로 필터 가능. status=awaiting 는 승인 대기.",
    parameters: z.object({
      status: z.enum(["queued", "running", "awaiting", "succeeded", "failed", "cancelled"]).optional(),
      app: z.string().optional().describe("앱 name 필터"),
      limit: z.number().int().positive().max(50).optional().describe("최대 개수(기본 20)"),
    }),
    handler: async ({ status, app, limit }) => {
      let runs = allRuns();
      if (status) runs = runs.filter((r) => r.status === status);
      if (app) {
        const name = resolveApp(app)?.name ?? app;
        runs = runs.filter((r) => r.app === name);
      }
      return json(runs.slice(0, limit ?? 20));
    },
  });

  useFrontendTool({
    name: "get_run_detail",
    description: "실행 1개의 상세(단계 steps, 사용 도구, recall 된 메모리, 토큰/비용)를 조회한다. 진단·원인 분석 근거로 사용.",
    parameters: z.object({ runId: z.string().describe("run id, 예: run_82c0f1a") }),
    handler: async ({ runId }) => {
      if (runId === RUN_DETAIL.id) return json(RUN_DETAIL);
      const r = allRuns().find((x) => x.id === runId);
      if (!r) return json({ error: "not_found", runId });
      return json({ ...r, note: "이 실행의 step-level trace 는 데모 mock 에 없습니다(상세 trace 는 run_82c0f1a 만 제공)." });
    },
  });

  useFrontendTool({
    name: "list_events",
    description: "정규화된 이벤트(HuginnIssue) 목록을 조회한다. app/severity 로 필터.",
    parameters: z.object({
      app: z.string().optional().describe("앱 name 필터"),
      severity: z.enum(["info", "warning", "error", "critical"]).optional(),
    }),
    handler: async ({ app, severity }) => {
      let evs = EVENTS;
      if (app) {
        const name = resolveApp(app)?.name ?? app;
        evs = evs.filter((e) => e.app === name);
      }
      if (severity) evs = evs.filter((e) => e.severity === severity);
      return json(evs);
    },
  });

  useFrontendTool({
    name: "search_memories",
    description: "Muninn 메모리(recall/store 지식)를 검색한다. query 부분일치 + scope/app 필터. score 내림차순.",
    parameters: z.object({
      query: z.string().optional().describe("fact/tag 부분일치 검색어"),
      scope: z.enum(["global", "app"]).optional(),
      app: z.string().optional().describe("앱 id 또는 name(app scope)"),
    }),
    handler: async ({ query, scope, app }) => {
      let mems = MEMORIES;
      if (scope) mems = mems.filter((m) => m.scope === scope);
      if (app) {
        const a = resolveApp(app);
        mems = mems.filter((m) => m.appId === (a?.id ?? app));
      }
      if (query) {
        const q = query.toLowerCase();
        mems = mems.filter((m) => m.fact.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));
      }
      return json([...mems].sort((x, y) => y.score - x.score).slice(0, 12));
    },
  });

  useFrontendTool({
    name: "get_dashboard",
    description: "워크스페이스 대시보드 KPI(24h 실행/실패/성공률/대기/비용, top failing)를 조회한다.",
    parameters: z.object({ workspaceId: z.string().optional().describe("기본=현재 워크스페이스") }),
    handler: async ({ workspaceId: ws }) => json(computeDashboard(ws ?? workspaceId)),
  });

  // ---- 상태 변경 도구(mock API) — 시스템 프롬프트에서 '먼저 알린 뒤 실행' 규칙 적용 ----
  useFrontendTool({
    name: "approve_run",
    description: "승인 대기(awaiting) 실행을 승인한다(예: PR 생성 승인). 되돌릴 수 없는 액션이므로 먼저 사용자에게 알린 뒤 호출할 것.",
    parameters: z.object({ runId: z.string().describe("승인할 run id") }),
    handler: async ({ runId }) => {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/approve`, { method: "POST" });
      if (!res.ok) return json({ error: "api-error", status: res.status, runId });
      return json(await res.json());
    },
  });

  useFrontendTool({
    name: "reject_run",
    description: "승인 대기(awaiting) 실행을 거절한다. 되돌릴 수 없는 액션이므로 먼저 사용자에게 알린 뒤 호출할 것.",
    parameters: z.object({ runId: z.string().describe("거절할 run id"), reason: z.string().optional().describe("거절 사유") }),
    handler: async ({ runId, reason }) => {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json({ reason: reason ?? "" }),
      });
      if (!res.ok) return json({ error: "api-error", status: res.status, runId });
      return json(await res.json());
    },
  });

  // ---- 네비게이션 도구 ----
  useFrontendTool({
    name: "open_app",
    description: "앱 상세 페이지로 이동한다. app 은 id 또는 name.",
    parameters: z.object({ app: z.string(), tab: z.string().optional().describe("탭(예: agent, runs)") }),
    handler: async ({ app, tab }) => {
      const a = resolveApp(app);
      if (!a) return json({ error: "not_found", app });
      router.push(appPath(a.id, tab));
      return json({ navigated: appPath(a.id, tab) });
    },
  });

  useFrontendTool({
    name: "open_run",
    description: "실행(HuginnRun) 상세 페이지로 이동한다.",
    parameters: z.object({ runId: z.string() }),
    handler: async ({ runId }) => {
      const path = `/runs/${encodeURIComponent(runId)}`;
      router.push(path);
      return json({ navigated: path });
    },
  });

  useFrontendTool({
    name: "go_to",
    description: "콘솔 주요 섹션으로 이동한다.",
    parameters: z.object({ section: z.enum(["dashboard", "apps", "memories", "platform-tools"]) }),
    handler: async ({ section }) => {
      const path = navPath(section);
      router.push(path);
      return json({ navigated: path });
    },
  });

  useFrontendTool({
    name: "switch_workspace",
    description: "워크스페이스를 전환한다. workspace 는 id, slug 또는 name.",
    parameters: z.object({ workspace: z.string() }),
    handler: async ({ workspace: key }) => {
      const k = key.trim().toLowerCase();
      const ws = WORKSPACES.find((w) => w.id.toLowerCase() === k || w.slug.toLowerCase() === k || w.name.toLowerCase() === k);
      if (!ws) return json({ error: "not_found", workspace: key, available: WORKSPACES.map((w) => ({ id: w.id, name: w.name })) });
      setWorkspaceId(ws.id);
      router.push("/");
      return json({ switched: { id: ws.id, name: ws.name } });
    },
  });

  return (
    <CopilotSidebar
      labels={{
        modalHeaderTitle: "Muninn Copilot",
        welcomeMessageText:
          "안녕하세요 — Muninn 콘솔 코파일럿입니다. 실행 상태/실패율, 메모리 검색, 승인 대기 처리, 페이지 이동을 도와드립니다. 예: \"승인 대기 중인 run 보여줘\", \"ai-router-svc 최근 실패 원인 분석해줘\".",
        chatInputPlaceholder: "Muninn 콘솔에 대해 물어보세요…",
      }}
    />
  );
}
