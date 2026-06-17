// Muninn DevOps Agent Platform — mock 데이터 (데모용 결정적 값)
// 프로토타입 hm-data.jsx 를 TS 모듈로 이관. window 전역 대신 named export.

import type {
  Application,
  FlowBucket,
  HmData,
  HmEvent,
  Memory,
  Run,
  RunDetail,
  Workspace,
} from "./types";
import { DEMO_NOW } from "./demo-clock";

const HM_NOW = DEMO_NOW;
const isoMinus = (m: number) => new Date(HM_NOW.getTime() - m * 60_000).toISOString();

const APPS: Application[] = [
  { id: "app_01", workspaceId: "ws_ai",      name: "ai-router-svc",  kind: "triton",  output: "pull_request", repo: "acme/ai-router-svc",  runs24h: 23, failed24h: 18, lastRun: isoMinus(1),   cost7d: 12.40 },
  { id: "app_02", workspaceId: "ws_payment", name: "payment-worker", kind: "fastapi", output: "pull_request", repo: "acme/payment-worker", runs24h: 15, failed24h:  9, lastRun: isoMinus(15),  cost7d:  8.20 },
  { id: "app_03", workspaceId: "ws_ai",      name: "search-indexer", kind: "fastapi", output: "github_issue",        repo: "acme/search-indexer", runs24h: 11, failed24h:  4, lastRun: isoMinus(89),  cost7d:  4.10 },
  { id: "app_04", workspaceId: "ws_data",    name: "data-etl",       kind: "airflow", output: "github_issue",        repo: "acme/data-etl",       runs24h:  3, failed24h:  0, lastRun: isoMinus(220), cost7d:  1.20 },
  { id: "app_05", workspaceId: "ws_data",    name: "legacy-batch",   kind: "other",   output: "pull_request", repo: "acme/legacy-batch",   runs24h:  0, failed24h:  0, lastRun: null,          cost7d:  0.00 },
];

const WORKSPACES: Workspace[] = [
  { id: "ws_ai",      name: "AI Platform",   slug: "ai-platform",   desc: "추론·검색 서비스", color: "#10B981", appCount: 2, role: "owner" },
  { id: "ws_payment", name: "Payments",      slug: "payments",      desc: "결제 워커",        color: "#FF8A00", appCount: 1, role: "member" },
  { id: "ws_data",    name: "Data Platform", slug: "data-platform", desc: "ETL · 배치",       color: "#7E58FA", appCount: 2, role: "member" },
];

// 24h, 30분 단위 48 버킷
const FLOW: FlowBucket[] = Array.from({ length: 48 }).map((_, i) => {
  const h = Math.floor(i / 2);
  const peak = Math.exp(-Math.pow((i - 28) / 10, 2)) + Math.exp(-Math.pow((i - 14) / 8, 2)) * 0.6;
  const succ = Math.max(0, Math.round(peak * 14 + (i % 5)));
  const fail = i > 20 && i < 36 ? Math.round(peak * 5) : Math.max(0, i % 9 === 0 ? 1 : 0);
  const await_ = i === 38 || i === 32 || i === 26 ? 1 : 0;
  return { label: `${String(h).padStart(2, "0")}`, succ, fail, await: await_ };
});

const LIVE_RUNS: Run[] = [
  { id: "run_82c0f1a", app: "ai-router-svc",  status: "running",  step: 4,    max: 12, cost: 0.18, duration: 83,   started: isoMinus(1.4),  output: null },
  { id: "run_61a45d8", app: "payment-worker", status: "awaiting", step: null, max: 12, cost: 1.04, duration: 1084, started: isoMinus(18),   output: "PR awaiting approval" },
  { id: "run_4a8302b", app: "search-indexer", status: "running",  step: 2,    max: 12, cost: 0.04, duration: 12,   started: isoMinus(0.2),  output: null },
  { id: "run_3f819cd", app: "ai-router-svc",  status: "queued",   step: null, max: 12, cost: 0,    duration: 0,    started: isoMinus(0.05), output: null },
];

const RECENT_RUNS: Run[] = [
  { id: "run_82c0f1a", app: "ai-router-svc",  status: "running",   step: 4, max: 12, cost: 0.18, duration: 83,   started: isoMinus(1),   output: null },
  { id: "run_61a45d8", app: "payment-worker", status: "awaiting",  step: null, max: 12, cost: 1.04, duration: 1084, started: isoMinus(18), output: "PR awaiting" },
  { id: "run_8f2a1bc", app: "ai-router-svc",  status: "succeeded", step: 6, max: 12, cost: 0.12, duration: 131,  started: isoMinus(75),  output: "PR #842" },
  { id: "run_7d1e093", app: "ai-router-svc",  status: "succeeded", step: 5, max: 12, cost: 0.09, duration: 98,   started: isoMinus(135), output: "PR #841" },
  { id: "run_5c809f1", app: "ai-router-svc",  status: "failed",    step: 3, max: 12, cost: 0.04, duration: 45,   started: isoMinus(149), output: "GitHub 403" },
  { id: "run_4a72bd0", app: "data-etl",       status: "cancelled", step: 1, max: 12, cost: 0.02, duration: 20,   started: isoMinus(213), output: "user cancel" },
  { id: "run_3e51c92", app: "search-indexer", status: "succeeded", step: 4, max: 12, cost: 0.07, duration: 110,  started: isoMinus(245), output: "Issue #143" },
  { id: "run_29ab40e", app: "payment-worker", status: "succeeded", step: 5, max: 12, cost: 0.11, duration: 122,  started: isoMinus(360), output: "PR #221" },
  { id: "run_182bcd1", app: "search-indexer", status: "succeeded", step: 3, max: 12, cost: 0.05, duration: 88,   started: isoMinus(412), output: "Issue #142" },
  { id: "run_07a3b22", app: "ai-router-svc",  status: "failed",    step: 8, max: 12, cost: 0.31, duration: 220,  started: isoMinus(480), output: "guardrail block" },
  { id: "run_82bef02", app: "ai-router-svc",  status: "succeeded", step: 5, max: 12, cost: 0.09, duration: 92,   started: isoMinus(8),   output: "PR #843" },
  { id: "run_82a5d31", app: "ai-router-svc",  status: "succeeded", step: 4, max: 12, cost: 0.07, duration: 78,   started: isoMinus(28),  output: "PR #844" },
  { id: "run_5c70a82", app: "ai-router-svc",  status: "succeeded", step: 5, max: 12, cost: 0.08, duration: 85,   started: isoMinus(158), output: "Issue #145" },
];

const EVENTS: HmEvent[] = [
  { id: "e_3f8a91", appId: "app_01", app: "ai-router-svc",  time: isoMinus(1.5), source: "grafana", severity: "critical", fingerprint: "PodCrashLooping",   title: "Pod restarting · payload > 4MB OOM", dedup: 17, runIds: ["run_82c0f1a", "run_82bef02", "run_82a5d31"] },
  { id: "e_3a712f", appId: "app_02", app: "payment-worker", time: isoMinus(18),  source: "airflow", severity: "error",    fingerprint: "billing/load_to_dw", title: "DAG task failed: load_to_dw",        dedup: 0,  runIds: ["run_61a45d8"] },
  { id: "e_2bd102", appId: "app_03", app: "search-indexer", time: isoMinus(75),  source: "manual",  severity: "info",     fingerprint: "manual:reindex",     title: "Manual reindex requested",           dedup: 0,  runIds: ["run_3e51c92"] },
  { id: "e_1c0498", appId: "app_01", app: "ai-router-svc",  time: isoMinus(149), source: "grafana", severity: "error",    fingerprint: "HighErrorRate",      title: "5xx burst on /v1/embed",             dedup: 2,  runIds: ["run_5c809f1", "run_5c70a82"] },
  { id: "e_0a52cd", appId: "app_04", app: "data-etl",       time: isoMinus(220), source: "airflow", severity: "warning",  fingerprint: "data/sync",          title: "ETL DAG ran longer than SLA",        dedup: 0,  runIds: ["run_4a72bd0"] },
  { id: "e_09c821", appId: "app_01", app: "ai-router-svc",  time: isoMinus(480), source: "argocd",  severity: "error",    fingerprint: "Degraded",           title: "ArgoCD sync degraded",               dedup: 0,  runIds: ["run_07a3b22"] },
];

const RUN_DETAIL: RunDetail = {
  id: "run_82c0f1a",
  app: "ai-router-svc",
  appKind: "Triton Inference Server",
  event: { id: "e_3f8a91", source: "grafana", summary: "PodCrashLooping (ai-router pod restarting)" },
  status: "running",
  started: isoMinus(1.4),
  step: 4,
  maxStep: 12,
  cost: 0.18,
  maxCost: 2.0,
  tokens: 47120,
  maxTokens: 100000,
  recalledMemories: [
    { id: "m1", fact: "Triton OOM — /v1/embed payload 가 4MB 를 넘으면 memory limit 1Gi 로 부족. 4Gi 로 상향 필요.", score: 0.91 },
    { id: "m2", fact: "ai-router 는 warm-up 비용이 크므로 HPA min replicas 는 최소 2 이상으로 유지해야 함.", score: 0.84 },
    { id: "m3", fact: "ai-platform namespace 에서는 Loki label 중 `app` 이 canonical service selector. `service_name` label 은 일부 namespace 에만 존재.", score: 0.78 },
  ],
  toolsUsed: [
    { ns: "muninn", count: 1 },
    { ns: "loki", count: 1 },
    { ns: "tempo", count: 1 },
    { ns: "github", count: 2 },
  ],
  steps: [
    { ix: 1, kind: "tool", finishedAt: isoMinus(1.3), tool: { ns: "muninn", fn: "recall", status: "ok", args: { query: "ai-router-svc pod crash OOM", k: 5 }, result: { items: 3, top_score: 0.91 } } },
    { ix: 2, kind: "tool", finishedAt: isoMinus(1.2), tool: { ns: "loki", fn: "query_range", status: "ok", args: { logql: '{app="ai-router-svc"} |~ "OOM|killed"', range: "1h" }, result: { lines: 1204, top_hit: "Memory cgroup out of memory: Killed process 1 (tritonserver)" } } },
    { ix: 3, kind: "tool", finishedAt: isoMinus(1.1), tool: { ns: "tempo", fn: "search_traces", status: "ok", args: { service: "ai-router-svc", duration_gte_ms: 10000 }, result: { traces: 4, slowest_ms: 12340, span_count: 187 } } },
    { ix: 4, kind: "thought", active: true, text: "Loki 로그에서 pod 이 `/v1/embed` 요청 처리 직후 9초 만에 OOMKilled 되는 패턴을 발견했다. 페이로드 크기가 4MB 를 넘는 케이스에서만 발생하며, 현재 memory limit 은 1Gi — Triton 의 모델 working set 보다 훨씬 작다. `deployment.yaml` 의 resource manifest 와 HPA 설정을 확인할 차례.", tokens_in: 12420, tokens_out: 184 },
    { ix: 5, kind: "tool-pending", tool: { ns: "github", fn: "read_file", args: { path: "deploy/triton/deployment.yaml", ref: "main" } } },
  ],
};

const MEMORIES: Memory[] = [
  { id: "mem_g01", scope: "global", appId: null, appName: null, fact: "K8s OOMKilled 이벤트는 cgroup memory limit 보다 working set 이 큰 경우 발생. 첫 reproduction 은 `kubectl top pod` + `kubectl describe pod` 로 확인할 것.", run: null, when: "2026-04-01", tags: ["k8s", "oom", "general"], score: 0.93, curated: true },
  { id: "mem_g02", scope: "global", appId: null, appName: null, fact: 'Loki LogQL 에서 한국어 로그 검색 시 `|~ "(?i)에러"` 로 case-insensitive 매칭이 안 되는 경우, `|~ "에러|ERROR"` 처럼 다중 패턴으로 우회한다.', run: null, when: "2026-03-20", tags: ["loki", "logql", "ko"], score: 0.81, curated: true },
  { id: "mem_g03", scope: "global", appId: null, appName: null, fact: "ArgoCD sync 가 `Healthy/Synced` 인데 pod 가 구버전인 경우, `imagePullPolicy: Always` 가 아니거나 image SHA digest pinning 미사용을 의심.", run: null, when: "2026-03-10", tags: ["argocd", "general", "image"], score: 0.88, curated: true },
  { id: "mem_01", scope: "app", appId: "app_01", appName: "ai-router-svc", fact: "Triton inference server 가 /v1/embed payload 4MB 초과 시 memory limit 1Gi 로 OOMKilled. Working set 은 약 3.2Gi.", run: "run_7d1", when: "2026-04-15", tags: ["triton", "oom", "memory"], score: 0.91 },
  { id: "mem_02", scope: "app", appId: "app_01", appName: "ai-router-svc", fact: "ai-router 는 cold start 가 약 12 초 소요되므로 HPA min replicas 는 반드시 2 이상으로 운영.", run: "run_4a8", when: "2026-04-12", tags: ["hpa", "warmup"], score: 0.84 },
  { id: "mem_03", scope: "app", appId: "app_01", appName: "ai-router-svc", fact: "ai-platform namespace 에서는 Loki label 중 `app` 이 canonical service selector. `service_name` label 은 일부 namespace 에만 존재.", run: "run_4a8", when: "2026-04-10", tags: ["loki", "label"], score: 0.72 },
  { id: "mem_11", scope: "app", appId: "app_02", appName: "payment-worker", fact: "billing/load_to_dw DAG 의 task timeout 은 30분 — 그 이상은 upstream snowflake query 가 시간 초과한 케이스. retry 보다 query 분할이 필요.", run: "run_61a", when: "2026-04-30", tags: ["airflow", "timeout"], score: 0.87 },
  { id: "mem_21", scope: "app", appId: "app_03", appName: "search-indexer", fact: "image SHA 변경 후에도 ArgoCD 가 'Healthy/Synced' 로 보이지만 pod 는 이전 digest 그대로 돌아가는 케이스. ImagePullPolicy 와 configMap 기반 build 를 점검할 것.", run: "run_4a8", when: "2026-04-22", tags: ["argocd", "image-pull"], score: 0.79 },
  { id: "mem_31", scope: "app", appId: "app_04", appName: "data-etl", fact: "Airflow on_failure_callback HTTP 502 폭주는 보통 배포 후 load_balancer 5분 cooldown 때문에 발생.", run: "run_2bc", when: "2026-03-28", tags: ["airflow", "callback"], score: 0.68 },
];

export const HM_DATA: HmData = {
  NOW: HM_NOW,
  APPS,
  WORKSPACES,
  FLOW,
  LIVE_RUNS,
  RECENT_RUNS,
  EVENTS,
  RUN_DETAIL,
  MEMORIES,
};

export { APPS, WORKSPACES, FLOW, LIVE_RUNS, RECENT_RUNS, EVENTS, RUN_DETAIL, MEMORIES };
