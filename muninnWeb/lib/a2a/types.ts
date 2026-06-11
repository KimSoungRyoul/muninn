// A2A(Agent2Agent) 프로토콜 최소 타입 — muninn 통합 PoC.
// 설계: docs/design/muninn-a2a-integration.md §2. JSON-RPC 바인딩 표기(소문자 state) 기준.
// 전체 스펙: https://a2a-protocol.org (여기선 muninn 이 쓰는 부분만 정의).

export type A2ATaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected"
  | "auth-required"
  | "unknown";

export interface A2ATextPart {
  kind: "text";
  text: string;
  metadata?: Record<string, unknown>;
}
export interface A2ADataPart {
  kind: "data";
  data: unknown;
  metadata?: Record<string, unknown>;
}
export type A2APart = A2ATextPart | A2ADataPart;

export interface A2AMessage {
  kind: "message";
  role: "user" | "agent";
  parts: A2APart[];
  messageId: string;
  taskId?: string;
  contextId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2ATaskStatus {
  state: A2ATaskState;
  message?: A2AMessage;
  timestamp?: string;
}

export interface A2AArtifact {
  artifactId: string;
  name?: string;
  parts: A2APart[];
}

export interface A2ATask {
  kind: "task";
  id: string; // ≡ HuginnRun name
  contextId: string; // ≡ HuginnIssue name
  status: A2ATaskStatus;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
}

// 스트리밍(message/stream · tasks/resubscribe)에서 emit 하는 증분 이벤트.
// A2A 의 TaskStatusUpdateEvent 에 대응. final=true 면 스트림 종료.
export interface A2AStatusUpdateEvent {
  kind: "status-update";
  taskId: string;
  contextId: string;
  status: A2ATaskStatus;
  final: boolean;
  metadata?: Record<string, unknown>;
}

// ---- Agent Card ----
export interface A2AAgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}
export interface A2ASecurityScheme {
  type: string; // "http" | "oauth2" | "apiKey" | ...
  scheme?: string; // "bearer"
  description?: string;
}
export interface A2AAgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string; // JSON-RPC 엔드포인트
  preferredTransport: string; // "JSONRPC"
  version: string;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  securitySchemes?: Record<string, A2ASecurityScheme>;
  security?: Array<Record<string, string[]>>;
  skills: A2AAgentSkill[];
  provider?: { organization: string; url?: string };
}

// ---- JSON-RPC 2.0 봉투 ----
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}
export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}
export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}
export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: JsonRpcErrorBody;
}

// A2A/JSON-RPC 표준 + muninn 확장 에러 코드
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  UNSUPPORTED_OPERATION: -32004,
  AUTH_REQUIRED: -32099,
} as const;
