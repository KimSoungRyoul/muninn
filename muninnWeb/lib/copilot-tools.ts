// Muninn 코파일럿 server tools (defineTool) — 서버에서 실행(K8s CR·postgres 접근).
//
// classic BuiltInAgent 의 `tools:[...]` 로 주입된다(app/api/copilotkit/route.ts). 네비게이션
// 같은 브라우저 동작은 frontend tool(useFrontendTool, components/muninn-copilot.tsx)로 남기고,
// 데이터/상태를 만지는 도구는 전부 여기(server)로 모은다 — mock 이 아니라 실 데이터/위임이다.
//
// 설계: muninn-goal-conversational-delegation.md §6(도구 목록). 오케스트레이션 루프:
//   recall_memory → delegate_incident → get_run_status(폴링) → (운영자 콘솔 승인) → store_memory/summarize.
//
// **자율 승인 게이트(리뷰 HIGH)**: 모델이 위험 액션을 사람 확인 없이 자율 실행하면 안 된다.
//   - delegate_incident: 불가역 위임이라 confirmed=true(사용자 동의)일 때만 실행 — 미설정 시 확인 요청만 반환(아래 게이트).
//   - approve_run / reject_run: 가장 위험한 사람-결정(예: PR 생성 승인)이라 **코파일럿 server tool 에서 제거**하고
//     콘솔 전용(/api/runs/[id]/approve|reject + 콘솔 UI)으로 격리한다. 코파일럿은 승인 대기를 안내하고
//     open_run(frontend tool)으로 해당 run 콘솔로 안내만 하며, 승인/거절은 운영자가 콘솔에서 직접 누른다(HITL).

import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";
import { dbEnabled, recall, store, summarize, listIncidents, listMemories, listInboundEvents } from "./db";
import {
  listApplications, getApplicationCr, queryIncidents, listRunsVM, getRunStatus, getIssueRuns,
  delegateIncident, MAX_GOAL_LENGTH,
} from "./incidents";
import { k8sEnabled } from "./k8s";
import { authEnabled } from "./auth";
import { getCopilotWorkspace, getCopilotAuthed } from "./workspace";
import { sendTaskToA2AAgentTool } from "./a2a/client-tool";

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
      // 멀티테넌시(§C3/§4): 요청 컨텍스트(ALS)의 workspace 로 격리 — 미설정 시 서버 기본값.
      const rows = await recall(query, { workspace: getCopilotWorkspace(), scope, appId: app, k });
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
      // 멀티테넌시(§C3/§4): 요청 컨텍스트(ALS)의 workspace 로 격리 저장 — 미설정 시 서버 기본값.
      const row = await store({ fact, workspace: getCopilotWorkspace(), scope, appId: app ?? null, appName: app ?? null, tags, sourceRunId: sourceRunId ?? null, changedBy: "copilot" });
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
  defineTool({
    name: "list_memories",
    description:
      "Muninn 메모리를 **브라우즈/목록**한다(recall=키워드 검색과 달리, query 없이 scope/app 으로 최근·큐레이션 우선 목록을 본다). " +
      "'이 앱에 어떤 기억이 쌓여 있나', '최근 저장된 기억' 같은 질문에 사용. query 를 주면 검색 + 무매칭 시 최근 항목으로 폴백.",
    parameters: z.object({
      scope: z.enum(["global", "app"]).optional().describe("global=공통 지식, app=특정 앱 한정"),
      app: z.string().optional().describe("app scope 일 때 앱 id/name"),
      query: z.string().optional().describe("주면 검색(무매칭 시 최근 항목 폴백). 없으면 전체 목록"),
      limit: z.number().int().positive().max(100).optional().describe("최대 개수(기본 50, 검색 시 20)"),
    }),
    execute: async ({ scope, app, query, limit }) => {
      if (!dbEnabled()) return DB_OFF;
      // 멀티테넌시(§C3/§4): 요청 컨텍스트(ALS)의 workspace 로 격리.
      const rows = await listMemories({ workspace: getCopilotWorkspace(), scope, appId: app, query, limit });
      return { count: rows.length, items: rows };
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
    description:
      "앱(HuginnAgent) 1개 상세(런타임 이미지·소스 repo·식별자·가드레일·bindings)를 조회한다. app 은 name. " +
      "spec.bindings 는 이 앱 에이전트가 사용할 Platform Tool(MCP 서버: deployment/observability/registry) 집합이라 " +
      "'이 앱 에이전트가 쓸 수 있는 도구는?' 질문의 근거다.",
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
          // bindings = 에이전트가 쓸 Platform Tool(MCP) 집합 — "이 앱이 쓸 수 있는 도구는?" 의 근거(§3.1).
          bindings: cr?.spec?.bindings,
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
  defineTool({
    name: "list_inbound_events",
    description:
      "인입 알림 이벤트(Grafana/Airflow/ArgoCD webhook)의 최근 이력을 조회한다(metaDB inbound_event). " +
      "'어떤 알림이 들어왔나', '이 앱에 최근 어떤 경보가 왔나' 같은 raw 신호 확인·진단 근거에 사용. " +
      "status=received|delegated|deduped|below-threshold|failed 로 처리 결과를 구분한다.",
    parameters: z.object({
      app: z.string().optional().describe("대상 앱(HuginnAgent) name 필터"),
      status: z.enum(["received", "delegated", "deduped", "below-threshold", "failed"]).optional(),
      limit: z.number().int().positive().max(100).optional().describe("최대 개수(기본 30)"),
    }),
    execute: async ({ app, status, limit }) => {
      if (!dbEnabled()) return DB_OFF;
      const items = await listInboundEvents({ app, status, limit });
      return { count: items.length, items };
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
      goal: z.string().max(MAX_GOAL_LENGTH).describe("이 사건에서 달성할 목표(불변 컨텍스트). 예: '외부 API timeout 확인 후 fallback 로직 PR 생성·검토요청'"),
      confirmed: z.boolean().optional().describe("사용자가 위임에 명시적으로 동의했으면 true. 미설정/false 면 확인 요청만 반환(실행 안 함)."),
      userPrompt: z.string().optional().describe("운영자 원본 프롬프트(감사·재실행용)"),
      issuingUser: z.string().optional().describe("개시 운영자 식별자(감사용)"),
      severity: z.enum(["info", "warning", "error", "critical"]).optional(),
      recalledMemoryIds: z.array(z.string()).optional().describe("위임 근거로 회상한 메모리 id 들"),
    }),
    execute: async (args) => {
      if (!args.app || !args.goal) return { error: "bad_input", note: "app 과 goal 은 필수입니다." };
      // 인증 게이트(§C2): 인증이 켜진 환경에서는 인증 통과(또는 same-origin 콘솔) 요청만 위임 가능.
      // dev(인증 비활성)에서는 authEnabled()=false 라 무효 — 기존 동작 불변. 조회 도구는 게이트하지 않는다.
      if (authEnabled() && !getCopilotAuthed()) {
        return { error: "unauthorized", note: "위임은 인증된 운영자만 가능합니다(이 환경은 인증이 켜져 있습니다). 콘솔에 로그인 후 다시 시도하세요." };
      }
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
  // ---- 승인/거절은 의도적으로 코파일럿 server tool 에서 제거함(리뷰 HIGH; 자율 승인 게이트) ----
  // approve_run / reject_run 은 가장 위험한 불가역 사람-결정(예: PR 생성 승인)이다. 모델이 자율로
  // 호출하면 human-in-the-loop 이 무력화되므로, 콘솔 전용(/api/runs/[id]/approve|reject + 콘솔 UI)으로
  // 격리한다. 코파일럿은 승인 대기 run 을 안내하고 open_run(frontend tool, components/muninn-copilot.tsx)으로
  // 해당 run 콘솔로 데려가며, 승인/거절은 운영자가 콘솔에서 직접 누른다. get_run_status 로 결정 후 상태만
  // 다시 폴링한다. (delegate_incident 는 confirmed 게이트가 있어 코파일럿에 남겨둔다.)
];

// V1(A2A 클라이언트, 설계 docs/design/muninn-a2a-integration.md §4) — 플래그로만 활성화.
// 기본 off → 기존 동작 불변. MUNINN_A2A_ENABLED=1 일 때만 코파일럿이 외부/내부 A2A 에이전트에 위임 가능.
if (process.env.MUNINN_A2A_ENABLED === "1") {
  (muninnServerTools as any[]).push(sendTaskToA2AAgentTool);
}
