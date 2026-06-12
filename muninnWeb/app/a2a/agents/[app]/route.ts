// A2A JSON-RPC 엔드포인트 — POST /a2a/agents/:app.
// 설계: docs/design/muninn-a2a-integration.md §4(V2)/§5. 기존 lib/incidents 함수를 재사용해
// A2A 메서드를 muninn CR 조작으로 매핑한다(CR=진실의 원천, A2A=facade).
//
// 구현: message/send · message/stream(SSE) · tasks/get · tasks/cancel · tasks/resubscribe(SSE).
// 미구현(PoC): pushNotificationConfig(P3), task continuation/threading(message.taskId/contextId 로 재개) — 명시 거절.
import { NextRequest, NextResponse } from "next/server";
import { getRunStatus, getIssueRuns, delegateIncident, rejectRun, MAX_GOAL_LENGTH } from "@/lib/incidents";
import type { RunVM } from "@/lib/incidents";
import * as k8s from "@/lib/k8s";
import { runVmToTask, issueToSubmittedTask, latestRun, statusToA2AState } from "@/lib/a2a/task-mapper";
import { sseResponse, streamTask, streamIssue } from "@/lib/a2a/stream";
import { a2aServerEnabled, a2aRequireAuth, a2aDisabled } from "@/lib/a2a/gate";
import { RPC } from "@/lib/a2a/types";
import type { JsonRpcRequest } from "@/lib/a2a/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}
function rpcOk(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

// 위임 목표(goal) 길이 상한 — 모든 위임 진입점이 공유하는 값(lib/incidents.ts).
const MAX_GOAL = MAX_GOAL_LENGTH;

// Issue 레벨 종료 phase — latest Run 이 failed 여도 Issue 가 비종료(재시도 backoff)면 작업 세션은 살아있다.
const ISSUE_TERMINAL_STATUS = new Set(["Succeeded", "Failed", "Cancelled"]);

// params.id/params.taskId 는 K8s 리소스명으로 쓰이므로 비문자열/빈값을 거른다.
function strParam(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function textFromMessage(msg: any): string {
  const parts = Array.isArray(msg?.parts) ? msg.parts : [];
  return parts
    .filter((p: any) => p?.kind === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("\n")
    .trim();
}

// 위임용 goal 추출 + 검증: 비어있으면 null(에러), 상한 초과면 'too-long' 신호.
function goalFromMessage(msg: any): { goal?: string; error?: "empty" | "too-long" } {
  const goal = textFromMessage(msg);
  if (!goal) return { error: "empty" };
  if (goal.length > MAX_GOAL) return { error: "too-long" };
  return { goal };
}

// Issue(contextId)가 정말 이 :app 소속인지 검증한다. getIssueRuns 는 agentRef 를 노출하지 않고,
// Run 이 0개인 submitted 구간엔 run.app 으로 소속을 판별할 수 없으므로 Issue CR 의 spec.agentRef 를 직접 본다.
// 반환: app 소속이면 { runs(이 app 의 Run 들), phase(Issue 종료성 판단용) }, 아니면 null(=스코프 밖, 존재 노출 방지).
async function getIssueScoped(issueName: string, app: string): Promise<{ runs: RunVM[]; phase: string } | null> {
  const issue = await getIssueRuns(issueName);
  if (!issue) return null;
  const appRuns = (issue.runs ?? []).filter((r) => r.app === app);
  if (appRuns.length) return { runs: appRuns, phase: issue.phase };
  if (issue.runs?.length) return null; // Run 이 있는데 전부 다른 app → 스코프 밖
  // Run 0개(submitted window) → Issue CR 의 agentRef 로 소속 확인(run.app 으로는 판별 불가).
  try {
    const cr = await k8s.getHuginnIssue(k8s.DEFAULT_NAMESPACE, issueName);
    return cr?.spec?.agentRef === app ? { runs: [], phase: issue.phase } : null;
  } catch {
    return null;
  }
}

// task.id 가 Run 이면 그 Run, contextId(Issue)면 그 Issue 의 최신 Run(app 스코프 강제)으로 해석.
async function resolveRun(idOrContext: string, app: string): Promise<RunVM | null> {
  const direct = await getRunStatus(idOrContext);
  if (direct) return direct.app === app ? direct : null;
  const scoped = await getIssueScoped(idOrContext, app);
  return scoped ? latestRun(scoped.runs) : null;
}

async function dispatch(req: NextRequest, app: string, body: JsonRpcRequest): Promise<Response> {
  const { id, method } = body;
  const p: any = body.params ?? {};

  // continuation/threading 미지원 — 무시하면 새 위임(비멱등)이 조용히 증폭되므로 명시 거절(설계 §6.1 HITL).
  // message/send 는 taskId·contextId 둘 다(스레딩 미지원), message/stream 은 taskId 만 거절(contextId=재구독은 허용).
  if (method === "message/send" && (p.message?.taskId || p.message?.contextId))
    return rpcError(id, RPC.UNSUPPORTED_OPERATION, "task continuation/threading 미지원 — 재구독은 tasks/resubscribe 를 사용하세요");
  if (method === "message/stream" && p.message?.taskId)
    return rpcError(id, RPC.UNSUPPORTED_OPERATION, "task continuation 미지원 — 재구독은 message.contextId 또는 tasks/resubscribe 를 사용하세요");

  try {
    switch (method) {
      case "message/send": {
        const g = goalFromMessage(p.message);
        if (g.error === "empty") return rpcError(id, RPC.INVALID_PARAMS, "message.parts 에 text 가 필요합니다");
        if (g.error === "too-long") return rpcError(id, RPC.INVALID_PARAMS, `goal 이 너무 깁니다(최대 ${MAX_GOAL}자)`);
        const issuingUser =
          typeof p.message?.metadata?.user === "string" ? p.message.metadata.user : "a2a-client";
        const res = await delegateIncident({ app, goal: g.goal!, source: "manual", issuingUser });
        if (!res.ok) {
          const code = res.reason === "agent-not-found" ? RPC.TASK_NOT_FOUND : RPC.INTERNAL_ERROR;
          return rpcError(id, code, `위임 실패: ${res.reason}`);
        }
        // 위임 직후엔 아직 Run 미생성 — HuginnIssue 레벨 submitted Task 반환(contextId=issueName).
        return rpcOk(id, issueToSubmittedTask(res.issueName as string, app));
      }

      case "tasks/get": {
        const taskId = strParam(p.id ?? p.taskId);
        if (!taskId) return rpcError(id, RPC.INVALID_PARAMS, "params.id(=task id, 문자열) 필요");
        const direct = await getRunStatus(taskId);
        if (direct)
          return direct.app === app
            ? rpcOk(id, runVmToTask(direct))
            : rpcError(id, RPC.TASK_NOT_FOUND, `task '${taskId}' 없음`);
        const scoped = await getIssueScoped(taskId, app);
        if (!scoped) return rpcError(id, RPC.TASK_NOT_FOUND, `task/context '${taskId}' 없음`);
        const latest = latestRun(scoped.runs);
        return rpcOk(id, latest ? runVmToTask(latest) : issueToSubmittedTask(taskId, app));
      }

      case "tasks/cancel": {
        // cancel 은 승인 결정에 닿는다(awaiting Run → rejectRun = 콘솔 reject 와 동일 효과). 콘솔
        // /api/runs/[id]/reject 의 requireOperator 격리를 A2A 가 우회하지 못하게 같은 수준을 요구한다(이슈 #44).
        // OIDC_OPERATOR_GROUP 미설정 환경에선 일반 인증과 동일하게 동작(현행 완화 유지 — lib/auth.ts 참고).
        const cancelDenied = await a2aRequireAuth(req, { requireOperator: true });
        if (cancelDenied) return cancelDenied;
        const taskId = strParam(p.id ?? p.taskId);
        if (!taskId) return rpcError(id, RPC.INVALID_PARAMS, "params.id(=task id, 문자열) 필요");
        // Run 직접 해석 + (contextId 인 경우) Issue 종료성 판단을 위해 둘 다 확인한다.
        const directVm = await getRunStatus(taskId);
        const vm = directVm?.app === app ? directVm : null;
        const scoped = vm ? null : await getIssueScoped(taskId, app);
        const resolved = vm ?? latestRun(scoped?.runs);
        if (!resolved) {
          // Issue 는 이 app 소속이나 Run 이 아직 없음 = submitted 구간 → not-cancelable(없음 아님).
          if (scoped) return rpcError(id, RPC.TASK_NOT_CANCELABLE, `task '${taskId}' 는 아직 Run 미생성(submitted) 구간`);
          return rpcError(id, RPC.TASK_NOT_FOUND, `task/context '${taskId}' 없음`);
        }
        // 종료성 판단: contextId 로 해석됐고 Issue 가 아직 비종료(재시도 backoff)면, latest Run 이 failed 여도
        // 작업 세션은 살아있으므로 취소 가능하다. 단일 Run(직접) 또는 Issue 종료 시에만 not-cancelable.
        const sessionTerminal = scoped ? ISSUE_TERMINAL_STATUS.has(scoped.phase) : true;
        const vmTerminal = resolved.status === "succeeded" || resolved.status === "failed" || resolved.status === "cancelled";
        if (vmTerminal && sessionTerminal)
          return rpcError(id, RPC.TASK_NOT_CANCELABLE, `task '${taskId}' 는 이미 종료 상태(${resolved.status})`);
        // AwaitingApproval 이면 거절(approval=Rejected 는 내구적 결정 → 즉시 canceled 표기 정당).
        // 그 외(running/queued)는 suspend 만 요청하고 실제 phase→Cancelled 전환은 operator 가 비동기로 한다.
        // 비-awaiting Run 에 approval=Rejected 를 쓰는 상태 오염을 피하고, 종료 전이므로 현재 state 를 유지해
        // canceled 를 조작하지 않는다(cancelRequested 메타데이터로 수락만 알림).
        if (resolved.status === "awaiting") {
          const res = await rejectRun(resolved.id, "canceled via A2A", "a2a-client");
          if (!res.ok) return rpcError(id, RPC.TASK_NOT_CANCELABLE, `취소 실패: ${res.reason}`);
          return rpcOk(id, {
            kind: "task",
            id: resolved.id,
            contextId: resolved.issue ?? taskId,
            status: { state: "canceled" },
            metadata: { priorPhase: resolved.phase },
          });
        }
        try {
          await k8s.patchRunSpec(resolved.namespace, resolved.id, { suspend: true });
        } catch {
          return rpcError(id, RPC.TASK_NOT_CANCELABLE, "suspend 실패");
        }
        // suspend 요청 수락 — 아직 종료 전이므로 현재 state 를 유지하고 cancelRequested 로 진행 중임을 알린다.
        return rpcOk(id, {
          kind: "task",
          id: resolved.id,
          contextId: resolved.issue ?? taskId,
          status: { state: statusToA2AState(resolved.status) },
          metadata: { cancelRequested: true, priorPhase: resolved.phase },
        });
      }

      case "message/stream": {
        // contextId(기존 HuginnIssue)가 오면 재위임하지 않고 그 context 를 구독한다(app 스코프 강제).
        // SSE 클라이언트(EventSource 등)는 끊기면 같은 요청으로 재연결하는데, 위임이 non-idempotent 라
        // (CLAUDE.md) 매 재연결마다 새 HuginnIssue→Job 이 생기는 증폭을 막으려면 클라이언트가 받은 contextId 로 재구독한다.
        const ctx = typeof p.message?.contextId === "string" ? p.message.contextId : "";
        if (ctx) {
          // 재구독 경로 — goal 텍스트가 함께 오면 조용히 버리지 말고 명시 거절(message/send 와 대칭).
          if (textFromMessage(p.message))
            return rpcError(id, RPC.UNSUPPORTED_OPERATION, "contextId 재구독 시 새 goal 은 무시됩니다 — 새 위임은 contextId 없이 보내세요");
          if (!(await getIssueScoped(ctx, app)))
            return rpcError(id, RPC.TASK_NOT_FOUND, `context '${ctx}' 없음`);
          return sseResponse((emit) => streamIssue(ctx, app, id ?? null, emit, req.signal), req.signal);
        }
        const g = goalFromMessage(p.message);
        if (g.error === "empty") return rpcError(id, RPC.INVALID_PARAMS, "message.parts 에 text 가 필요합니다");
        if (g.error === "too-long") return rpcError(id, RPC.INVALID_PARAMS, `goal 이 너무 깁니다(최대 ${MAX_GOAL}자)`);
        const goal = g.goal!;
        const issuingUser =
          typeof p.message?.metadata?.user === "string" ? p.message.metadata.user : "a2a-client";
        const res = await delegateIncident({ app, goal, source: "manual", issuingUser });
        if (!res.ok) {
          const code = res.reason === "agent-not-found" ? RPC.TASK_NOT_FOUND : RPC.INTERNAL_ERROR;
          return rpcError(id, code, `위임 실패: ${res.reason}`);
        }
        const issueName = res.issueName as string;
        // SSE: submitted → (Run 등장) working → … → completed/failed/input-required(final). 설계 §6.1.
        // 클라이언트는 첫 이벤트의 contextId 를 보관했다가 재연결 시 message.contextId 로 넘겨 재위임을 피한다.
        return sseResponse((emit) => streamIssue(issueName, app, id ?? null, emit, req.signal), req.signal);
      }

      case "tasks/resubscribe": {
        const taskId = strParam(p.id ?? p.taskId);
        if (!taskId) return rpcError(id, RPC.INVALID_PARAMS, "params.id(=task id, 문자열) 필요");
        // taskId 가 Run 이면 streamTask, contextId(Issue)면 streamIssue 로 분기(둘 다 app 스코프 강제).
        const direct = await getRunStatus(taskId);
        if (direct) {
          if (direct.app !== app) return rpcError(id, RPC.TASK_NOT_FOUND, `task '${taskId}' 없음`);
          return sseResponse((emit) => streamTask(taskId, id ?? null, emit, req.signal), req.signal);
        }
        if (!(await getIssueScoped(taskId, app)))
          return rpcError(id, RPC.TASK_NOT_FOUND, `task/context '${taskId}' 없음`);
        return sseResponse((emit) => streamIssue(taskId, app, id ?? null, emit, req.signal), req.signal);
      }

      default:
        return rpcError(id, RPC.METHOD_NOT_FOUND, `알 수 없는 메서드: ${method}`);
    }
  } catch (err) {
    // 내부 상세는 서버 로그로만 — 외부 A2A 클라이언트에 스택/원문을 노출하지 않는다.
    console.error("[a2a] internal error:", err);
    return rpcError(id, RPC.INTERNAL_ERROR, "내부 오류");
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ app: string }> }) {
  // 게이트를 본문 파싱보다 먼저 — 비활성/무인증이면 라우트 존재·본문 오류조차 노출하지 않는다(fail-closed).
  // 인증 실패는 A2A 스펙대로 HTTP 401(+WWW-Authenticate), 비활성은 404.
  if (!a2aServerEnabled()) return a2aDisabled();
  const denied = await a2aRequireAuth(req);
  if (denied) return denied;

  const params = await props.params; // Next 15: params 는 Promise

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, RPC.PARSE_ERROR, "JSON 파싱 실패");
  }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body?.id ?? null, RPC.INVALID_REQUEST, "유효하지 않은 JSON-RPC 요청");
  }

  // JSON-RPC notification(id 멤버 없음) 처리.
  // 상태변경·비가역 메서드(message/send·message/stream·tasks/cancel)를 notification 으로 보내면
  // 위임이 수행되는데 issueName(핸들)을 돌려줄 수 없어 유실·재위임 증폭이 된다 → INVALID_REQUEST 로 거절.
  // 순수 조회(tasks/get·tasks/resubscribe)만 notification 허용(응답 없이 side-effect 없음 → 사실상 무의미하지만 안전).
  const isNotification = !Object.prototype.hasOwnProperty.call(body, "id");
  const MUTATING = new Set(["message/send", "message/stream", "tasks/cancel"]);
  if (isNotification && MUTATING.has(body.method))
    return rpcError(null, RPC.INVALID_REQUEST, `${body.method} 는 notification(id 없음)으로 호출할 수 없습니다`);

  const res = await dispatch(req, params.app, body);
  if (isNotification && (res.headers.get("content-type") ?? "").includes("application/json"))
    return new Response(null, { status: 204 });
  return res;
}
