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
