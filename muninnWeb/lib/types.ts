// Muninn DevOps Agent Platform — 도메인 모델 타입
// 설계서 §1.2(도메인 모델), §8(데이터 모델) 및 프로토타입 데이터 구조 기반.

export type WorkspaceRole = "owner" | "member";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  desc: string;
  color: string;
  appCount: number;
  role: WorkspaceRole;
}

export type AppKind = "triton" | "fastapi" | "airflow" | "other";
export type AppOutput = "pull_request" | "github_issue";

// 에이전트 런타임 설정(HuginnAgent.spec.agent). UI 에서 조회/수정.
export interface AgentRuntimeConfig {
  image: string;        // HuginnRun 이 실행하는 이미지(ghcr.io/.../agent-runtime:<tag>)
  runtime: string;      // "claude-code"
  soulRef?: string;     // SOUL.md ConfigMap 이름
  argocdServer?: string; // ARGOCD_SERVER (비밀 아님)
}

// 자격 종류. 값은 K8s Secret(agent-secrets/gh-pat)으로만 저장되며 UI 는 등록 여부만 다룬다.
export type CredentialKind = "oauth" | "apikey" | "pat" | "kubeconfig" | "token";

// 자격 참조(write-only). UI 는 set 여부/갱신시각만 표시하고 값은 보관/노출하지 않는다.
export interface CredentialRef {
  key: string;          // secret data key (claude-code-oauth-token / github-pat / kubeconfig / argocd-auth-token …)
  label: string;
  kind: CredentialKind;
  required?: boolean;
  set: boolean;         // 등록 여부
  updatedAt: string | null;
  hint?: string;
}

export interface Application {
  id: string;
  workspaceId: string;
  name: string;
  kind: AppKind;
  output: AppOutput;
  repo: string;
  runs24h: number;
  failed24h: number;
  lastRun: string | null;
  cost7d: number;
  // 에이전트 설정/자격(optional — 없으면 lib/agent-config 기본값으로 seed)
  agent?: AgentRuntimeConfig;
  credentials?: CredentialRef[];
}

export type EventSource = "grafana" | "airflow" | "argocd" | "manual";
export type Severity = "info" | "warning" | "error" | "critical";

export interface HmEvent {
  id: string;
  appId: string;
  app: string;
  time: string;
  source: EventSource;
  severity: Severity;
  fingerprint: string;
  title: string;
  dedup: number;
  runIds: string[];
}

// CRD phase 는 PascalCase, 표현 계층(UI)은 소문자 (설계 §3.4)
export type RunStatus =
  | "queued"
  | "running"
  | "awaiting"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Run {
  id: string;
  app: string;
  status: RunStatus;
  step: number | null;
  max: number;
  cost: number;
  duration: number;
  started: string;
  output: string | null;
}

export interface FlowBucket {
  label: string;
  succ: number;
  fail: number;
  await: number;
}

export type StepKind = "thought" | "tool" | "tool-pending";

export interface ToolCall {
  ns: string;
  fn: string;
  status?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface RunStep {
  ix: number;
  kind: StepKind;
  finishedAt?: string;
  active?: boolean;
  text?: string;
  tokens_in?: number;
  tokens_out?: number;
  tool?: ToolCall;
}

export interface RecalledMemory {
  id: string;
  fact: string;
  score: number;
}

export interface ToolUsage {
  ns: string;
  count: number;
}

export interface RunDetail {
  id: string;
  app: string;
  appKind: string;
  event: { id: string; source: EventSource; summary: string };
  status: RunStatus;
  started: string;
  step: number;
  maxStep: number;
  cost: number;
  maxCost: number;
  tokens: number;
  maxTokens: number;
  recalledMemories: RecalledMemory[];
  toolsUsed: ToolUsage[];
  steps: RunStep[];
}

export type MemoryScope = "global" | "app";

export interface Memory {
  id: string;
  scope: MemoryScope;
  appId: string | null;
  appName: string | null;
  fact: string;
  run: string | null;
  when: string;
  tags: string[];
  score: number;
  curated?: boolean;
}

export interface HmData {
  NOW: Date;
  APPS: Application[];
  WORKSPACES: Workspace[];
  FLOW: FlowBucket[];
  LIVE_RUNS: Run[];
  RECENT_RUNS: Run[];
  EVENTS: HmEvent[];
  RUN_DETAIL: RunDetail;
  MEMORIES: Memory[];
}
