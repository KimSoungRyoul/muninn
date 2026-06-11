// A2A JSON-RPC 엔드포인트 — POST /a2a/agents/:app.
// 설계: docs/design/muninn-a2a-integration.md §4(V2)/§5. 기존 lib/incidents 함수를 재사용해
// A2A 메서드를 muninn CR 조작으로 매핑한다(CR=진실의 원천, A2A=facade).
//
// 구현: message/send → delegateIncident, tasks/get → getRunStatus/getIssueRuns, tasks/cancel → rejectRun.
// 미구현(PoC): message/stream · tasks/resubscribe(SSE) · pushNotificationConfig → P2/P3(설계 §4/§6.1).
import { NextRequest, NextResponse } from "next/server";
import { delegateIncident, getRunStatus, getIssueRuns, rejectRun } from "@/lib/incidents";
import { runVmToTask, issueToSubmittedTask } from "@/lib/a2a/task-mapper";
import { sseResponse, streamTask, streamIssue } from "@/lib/a2a/stream";
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

function textFromMessage(msg: any): string {
  const parts = Array.isArray(msg?.parts) ? msg.parts : [];
  return parts
    .filter((p: any) => p?.kind === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("\n")
    .trim();
}

// 서버 A2A 라우트 활성화 게이트 — 기본 비활성(fail-closed). client-tool(코파일럿 클라이언트)과 동일 플래그라
// "A2A 기능 전체 on/off" 로 일관된다. 배포 즉시 무인증 위임이 라이브가 되는 fail-open 을 막는다.
function a2aServerEnabled(): boolean {
  return process.env.MUNINN_A2A_ENABLED === "1";
}

// 인증 게이트(fail-closed): 기본 bearer 필수. 로컬 dev 는 MUNINN_A2A_AUTH_DISABLED=1 로 명시적 우회.
// 운영에선 bearer→SA/RBAC/workspace 매핑으로 확장(설계 §7) — 현재는 형식 검사(존재 강제)까지.
function authOk(req: NextRequest): boolean {
  if (process.env.MUNINN_A2A_AUTH_DISABLED === "1") return true;
  return (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
}

export async function POST(req: NextRequest, { params }: { params: { app: string } }) {
  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, RPC.PARSE_ERROR, "JSON 파싱 실패");
  }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body?.id ?? null, RPC.INVALID_REQUEST, "유효하지 않은 JSON-RPC 요청");
  }
  const { id, method } = body;
  const p: any = body.params ?? {};

  // fail-closed: 서버 라우트는 기본 비활성. 비가역 위임을 무인증으로 노출하지 않는다.
  if (!a2aServerEnabled())
    return rpcError(id, RPC.UNSUPPORTED_OPERATION, "A2A 서버 라우트 비활성 — MUNINN_A2A_ENABLED=1 필요");
  if (!authOk(req)) return rpcError(id, RPC.AUTH_REQUIRED, "인증 필요(Authorization: Bearer)");

  try {
    switch (method) {
      case "message/send": {
        const goal = textFromMessage(p.message);
        if (!goal) return rpcError(id, RPC.INVALID_PARAMS, "message.parts 에 text 가 필요합니다");
        const issuingUser =
          typeof p.message?.metadata?.user === "string" ? p.message.metadata.user : "a2a-client";
        const res = await delegateIncident({ app: params.app, goal, source: "manual", issuingUser });
        if (!res.ok) {
          const code = res.reason === "agent-not-found" ? RPC.TASK_NOT_FOUND : RPC.INTERNAL_ERROR;
          return rpcError(id, code, `위임 실패: ${res.reason}`, res.error);
        }
        // 위임 직후엔 아직 Run 미생성 — HuginnIssue 레벨 submitted Task 반환(contextId=issueName).
        return rpcOk(id, issueToSubmittedTask(res.issueName as string, params.app));
      }

      case "tasks/get": {
        const taskId: string = p.id ?? p.taskId;
        if (!taskId) return rpcError(id, RPC.INVALID_PARAMS, "params.id(=task id) 필요");
        // 먼저 HuginnRun 으로 시도, 아니면 HuginnIssue(contextId)로 — 최신 Run 을 Task 로.
        const vm = await getRunStatus(taskId);
        if (vm) return rpcOk(id, runVmToTask(vm));
        const issue = await getIssueRuns(taskId);
        if (!issue) return rpcError(id, RPC.TASK_NOT_FOUND, `task/context '${taskId}' 없음`);
        const latest = issue.runs[issue.runs.length - 1];
        return rpcOk(id, latest ? runVmToTask(latest) : issueToSubmittedTask(taskId, ""));
      }

      case "tasks/cancel": {
        const taskId: string = p.id ?? p.taskId;
        if (!taskId) return rpcError(id, RPC.INVALID_PARAMS, "params.id(=task id) 필요");
        const res = await rejectRun(taskId, "canceled via A2A", "a2a-client");
        if (!res.ok) return rpcError(id, RPC.TASK_NOT_CANCELABLE, `취소 실패: ${res.reason}`);
        // A2A cancel 결과는 항상 canceled Task 여야 한다. rejectRun 은 approval=Rejected + spec.suspend 만 쓰고
        // phase→Cancelled 전환은 operator 가 비동기로 하므로, 지금 phase 를 그대로 노출하면 working/input-required 가
        // 새어나가 cancel 시맨틱을 위반한다. 따라서 state 를 canceled 로 강제하고 직전 phase 는 metadata 로 노출.
        const vm = await getRunStatus(taskId);
        const task = vm
          ? runVmToTask(vm)
          : { kind: "task" as const, id: taskId, contextId: taskId, status: { state: "canceled" as const } };
        task.status = { state: "canceled" };
        if (vm) task.metadata = { ...(task.metadata ?? {}), suspendRequested: true, priorPhase: vm.phase };
        return rpcOk(id, task);
      }

      case "message/stream": {
        const goal = textFromMessage(p.message);
        if (!goal) return rpcError(id, RPC.INVALID_PARAMS, "message.parts 에 text 가 필요합니다");
        const issuingUser =
          typeof p.message?.metadata?.user === "string" ? p.message.metadata.user : "a2a-client";
        const res = await delegateIncident({ app: params.app, goal, source: "manual", issuingUser });
        if (!res.ok) {
          const code = res.reason === "agent-not-found" ? RPC.TASK_NOT_FOUND : RPC.INTERNAL_ERROR;
          return rpcError(id, code, `위임 실패: ${res.reason}`, res.error);
        }
        const issueName = res.issueName as string;
        // SSE: submitted → (Run 등장) working → … → completed/failed(final). 설계 §6.1.
        return sseResponse((emit) => streamIssue(issueName, params.app, id ?? null, emit, req.signal), req.signal);
      }

      case "tasks/resubscribe": {
        const taskId: string = p.id ?? p.taskId;
        if (!taskId) return rpcError(id, RPC.INVALID_PARAMS, "params.id(=task id) 필요");
        return sseResponse((emit) => streamTask(taskId, id ?? null, emit, req.signal), req.signal);
      }

      default:
        return rpcError(id, RPC.METHOD_NOT_FOUND, `알 수 없는 메서드: ${method}`);
    }
  } catch (err) {
    return rpcError(id, RPC.INTERNAL_ERROR, "내부 오류", err instanceof Error ? err.message : String(err));
  }
}
