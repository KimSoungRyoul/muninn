// Muninn 코파일럿 server tools (defineTool) — 서버에서 실행(K8s CR·postgres 접근).
//
// classic BuiltInAgent 의 `tools:[...]` 로 주입된다(app/api/copilotkit/route.ts). 네비게이션
// 같은 브라우저 동작은 frontend tool(useFrontendTool, components/muninn-copilot.tsx)로 남기고,
// 데이터/상태를 만지는 도구는 전부 여기(server)로 모은다 — mock 이 아니라 실 데이터/위임이다.
//
// 설계: muninn-goal-conversational-delegation.md §6(도구 목록). 오케스트레이션 루프:
//   recall_memory → delegate_incident → get_run_status(폴링) → approve_run → store_memory/summarize.

import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";
import { dbEnabled, recall, store, summarize, listIncidents } from "./db";
import {
  listApplications, getApplicationCr, queryIncidents, listRunsVM, getRunStatus, getIssueRuns,
  delegateIncident, approveRun, rejectRun,
} from "./incidents";
import { k8sEnabled } from "./k8s";

const K8S_OFF = { error: "k8s-disabled", note: "이 muninnWeb 인스턴스는 클러스터에 연결돼 있지 않습니다(로컬 dev). 위임/조회는 kind/클러스터 배포에서 동작합니다." };
const DB_OFF = { error: "db-disabled", note: "메모리(postgres)가 설정되지 않았습니다(DATABASE_URL 미설정). 검색/저장은 DB 연결 시 동작합니다." };

export const muninnServerTools = [
  // ---- 기억(memory) ----
  defineTool({
    name: "recall_memory",
    description:
      "Muninn 메모리(metaDB, postgres)에서 관련 기억을 텍스트(키워드) 검색한다(fact+tags 대상). " +
      "위임 전에 과거 사건/원인/해결책을 회상하는 첫 단계. scope/app 으로 좁힐 수 있다.",
    parameters: z.object({
      query: z.string().describe("검색어(자연어). 예: 'ai-router OOM 외부 timeout fallback'"),
      scope: z.enum(["global", "app"]).optional().describe("global=공통 지식, app=특정 앱 한정"),
      app: z.string().optional().describe("app scope 일 때 앱 id/name"),
      k: z.number().int().positive().max(20).optional().describe("최대 개수(기본 8)"),
    }),
    execute: async ({ query, scope, app, k }) => {
      if (!dbEnabled()) return DB_OFF;
      const rows = await recall(query, { scope, appId: app, k });
      return { count: rows.length, items: rows };
    },
  }),
  defineTool({
    name: "store_memory",
    description:
      "재사용 가능한 사실을 Muninn 메모리에 저장한다(사건 처리 후 원인/해결/재발방지 핵심). " +
      "먼저 summarize_incident 로 1~2줄 distill 한 결과를 fact 로 넣는 것을 권장.",
    parameters: z.object({
      fact: z.string().describe("저장할 사실(간결한 한국어 1~2줄)"),
      scope: z.enum(["global", "app"]).optional(),
      app: z.string().optional().describe("app scope 일 때 앱 id/name"),
      tags: z.array(z.string()).optional(),
      sourceRunId: z.string().optional().describe("근거가 된 HuginnRun id"),
    }),
    execute: async ({ fact, scope, app, tags, sourceRunId }) => {
      if (!dbEnabled()) return DB_OFF;
      if (!fact) return { error: "bad_input", note: "fact 는 필수입니다." };
      const row = await store({ fact, scope, appId: app ?? null, appName: app ?? null, tags, sourceRunId: sourceRunId ?? null, changedBy: "copilot" });
      return { stored: row };
    },
  }),
  defineTool({
    name: "summarize_incident",
    description: "사건 처리 결과/로그를 재사용 가능한 1~2줄 한국어 기억으로 요약(distill)한다. store_memory 전에 사용.",
    parameters: z.object({ text: z.string().describe("요약할 원문(에이전트 output·진단 결과 등)") }),
    execute: async ({ text }) => {
      if (!text) return { error: "bad_input", note: "text 는 필수입니다." };
      // DB 미설정이어도 요약은 LLM 호출만으로 가능.
      return { summary: await summarize(text) };
    },
  }),

  // ---- 조회(HuginnAgent/Issue/Run) ----
  defineTool({
    name: "list_applications",
    description: "운영 대상 애플리케이션(HuginnAgent) 목록을 조회한다.",
    parameters: z.object({}),
    execute: async () => ({ items: await listApplications() }),
  }),
  defineTool({
    name: "get_application",
    description: "앱(HuginnAgent) 1개 상세(런타임 이미지·소스 repo·식별자·가드레일)를 조회한다. app 은 name.",
    parameters: z.object({ app: z.string().describe("앱 name") }),
    execute: async ({ app }) => {
      if (!k8sEnabled()) return K8S_OFF;
      if (!app) return { error: "bad_input", note: "app 은 필수입니다." };
      const cr = await getApplicationCr(app);
      if (!cr) return { error: "not_found", app };
      return {
        name: cr?.metadata?.name,
        namespace: cr?.metadata?.namespace,
        spec: {
          kind: cr?.spec?.kind, output: cr?.spec?.output, source: cr?.spec?.source,
          agent: cr?.spec?.agent, guardrails: cr?.spec?.guardrails, identity: cr?.spec?.identity,
        },
      };
    },
  }),
  defineTool({
    name: "query_incidents",
    description:
      "장애(HuginnIssue)와 대처(HuginnRun)를 조인해 조회한다. " +
      "'어떤 App 에 장애 나고 대처 진행중?' 같은 질문의 근거. status=active(기본)는 진행 중만, all 은 전체.",
    parameters: z.object({
      status: z.enum(["active", "all"]).optional(),
      app: z.string().optional().describe("앱 name 필터"),
    }),
    execute: async ({ status, app }) => {
      const items = await queryIncidents({ status, app });
      return { count: items.length, items };
    },
  }),
  defineTool({
    name: "list_runs",
    description: "실행(HuginnRun) 목록을 조회한다. status/app 으로 필터. status=awaiting 는 승인 대기.",
    parameters: z.object({
      status: z.enum(["queued", "running", "awaiting", "succeeded", "failed", "cancelled"]).optional(),
      app: z.string().optional(),
    }),
    execute: async ({ status, app }) => ({ items: await listRunsVM({ status, app }) }),
  }),
  defineTool({
    name: "get_run_status",
    description:
      "실행(HuginnRun) 1개의 현재 상태(phase·step·cost·output·approval)를 조회한다. " +
      "위임 후 결과를 폴링하거나 승인 대기 여부를 확인할 때 사용.",
    parameters: z.object({ runId: z.string().describe("run name, 예: run-... ") }),
    execute: async ({ runId }) => {
      if (!runId) return { error: "bad_input", note: "runId 는 필수입니다." };
      const vm = await getRunStatus(runId);
      return vm ?? { error: "not_found", runId };
    },
  }),
  defineTool({
    name: "list_incidents_history",
    description: "metaDB 의 사건 이력(incident_log) 최근 항목을 조회한다(위임→결과→요약 이력).",
    parameters: z.object({ limit: z.number().int().positive().max(100).optional() }),
    execute: async ({ limit }) => {
      if (!dbEnabled()) return DB_OFF;
      return { items: await listIncidents(limit ?? 30) };
    },
  }),

  // ---- 위임/승인(상태 변경) ----
  defineTool({
    name: "delegate_incident",
    description:
      "운영자 지시를 HuginnAgent(operator)에 위임한다 — HuginnIssue CR 을 생성하면 operator 가 " +
      "HuginnRun→Job→Pod 로 진단/대응을 실행한다. **되돌릴 수 없는 액션이다.** 반드시 먼저 무엇을 위임할지 " +
      "(앱·목표·근거 기억) 사용자에게 보여주고 동의를 받은 뒤, confirmed=true 로 호출하라. confirmed 없이 호출하면 " +
      "실행되지 않고 확인 요청만 반환한다. recall_memory 결과의 id 를 recalledMemoryIds 로 넘기면 감사·seed 로 남는다.",
    parameters: z.object({
      app: z.string().describe("위임 대상 앱(HuginnAgent name)"),
      goal: z.string().describe("이 사건에서 달성할 목표(불변 컨텍스트). 예: '외부 API timeout 확인 후 fallback 로직 PR 생성·검토요청'"),
      confirmed: z.boolean().optional().describe("사용자가 위임에 명시적으로 동의했으면 true. 미설정/false 면 확인 요청만 반환(실행 안 함)."),
      userPrompt: z.string().optional().describe("운영자 원본 프롬프트(감사·재실행용)"),
      issuingUser: z.string().optional().describe("개시 운영자 식별자(감사용)"),
      severity: z.enum(["info", "warning", "error", "critical"]).optional(),
      recalledMemoryIds: z.array(z.string()).optional().describe("위임 근거로 회상한 메모리 id 들"),
    }),
    execute: async (args) => {
      if (!args.app || !args.goal) return { error: "bad_input", note: "app 과 goal 은 필수입니다." };
      // 불가역 액션 게이트: 명시 동의 전에는 실행하지 않고 확인 요청을 돌려준다(시스템 강제).
      if (!args.confirmed) {
        return {
          needsConfirmation: true,
          note: "되돌릴 수 없는 위임입니다. 아래 내용을 사용자에게 확인받은 뒤 confirmed=true 로 다시 호출하세요.",
          willCreate: {
            app: args.app, goal: args.goal,
            recalledMemoryIds: args.recalledMemoryIds ?? [],
            severity: args.severity ?? "warning",
          },
        };
      }
      const res = await delegateIncident({
        app: args.app, goal: args.goal, userPrompt: args.userPrompt,
        issuingUser: args.issuingUser, severity: args.severity, recalledMemoryIds: args.recalledMemoryIds,
      });
      if (!res.ok) return res.reason === "k8s-disabled" ? K8S_OFF : res;
      return res;
    },
  }),
  defineTool({
    name: "get_issue_runs",
    description:
      "위임 후 폴링용 — issueName 으로 그 HuginnIssue 의 phase/outcome 과 operator 가 생성한 HuginnRun 들을 조회한다. " +
      "delegate_incident 가 반환한 issueName 으로 run 등장→완료(Succeeded/Failed)를 추적하라.",
    parameters: z.object({ issueName: z.string().describe("delegate_incident 가 반환한 issueName") }),
    execute: async ({ issueName }) => {
      if (!k8sEnabled()) return K8S_OFF;
      if (!issueName) return { error: "bad_input", note: "issueName 은 필수입니다." };
      const res = await getIssueRuns(issueName);
      return res ?? { error: "not_found", issueName };
    },
  }),
  defineTool({
    name: "approve_run",
    description: "승인 대기(AwaitingApproval) 실행을 승인한다(예: PR 생성 승인). 되돌릴 수 없으니 먼저 사용자에게 알린 뒤 호출.",
    parameters: z.object({ runId: z.string(), decidedBy: z.string().optional() }),
    execute: async ({ runId, decidedBy }) => {
      if (!runId) return { error: "bad_input", note: "runId 는 필수입니다." };
      const res = await approveRun(runId, decidedBy);
      return res.ok ? res : K8S_OFF;
    },
  }),
  defineTool({
    name: "reject_run",
    description: "승인 대기 실행을 거절하고 중단(suspend)한다. 되돌릴 수 없으니 먼저 사용자에게 알린 뒤 호출.",
    parameters: z.object({ runId: z.string(), reason: z.string().optional(), decidedBy: z.string().optional() }),
    execute: async ({ runId, reason, decidedBy }) => {
      if (!runId) return { error: "bad_input", note: "runId 는 필수입니다." };
      const res = await rejectRun(runId, reason, decidedBy);
      return res.ok ? res : K8S_OFF;
    },
  }),
];
