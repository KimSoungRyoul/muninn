// A2A JSON-RPC 엔드포인트 — POST /a2a/agents/:app.
// 설계: docs/design/muninn-a2a-integration.md §4(V2)/§5. 기존 lib/incidents 함수를 재사용해
// A2A 메서드를 muninn CR 조작으로 매핑한다(CR=진실의 원천, A2A=facade).
//
// 구현: message/send → delegateIncident, tasks/get → getRunStatus/getIssueRuns, tasks/cancel → rejectRun.
// 미구현(PoC): message/stream · tasks/resubscribe(SSE) · pushNotificationConfig → P2/P3(설계 §4/§6.1).
import { NextRequest, NextResponse } from "next/server";
import { delegateIncident, getRunStatus, getIssueRuns, rejectRun } from "@/lib/incidents";
import type { RunVM } from "@/lib/incidents";
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

// task.id 가 Run 이름이면 그 Run, contextId(Issue 이름)이면 그 Issue 의 최신 Run 으로 해석한다.
// message/send 가 위임 직후 contextId(issueName)를 task.id 로 돌려주므로, 후속 호출이 그 id 로 와도 일관 동작.
async function resolveRun(idOrContext: string): Promise<RunVM | null> {
  const vm = await getRunStatus(idOrContext);
  if (vm) return vm;
  const issue = await getIssueRuns(idOrContext);
  return issue?.runs[issue.runs.length - 1] ?? null;
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
        // Run 미생성 구간(위임 직후)엔 Issue 가 있어도 Run 이 없으므로 submitted Task 를 돌려준다.
        const vm = await getRunStatus(taskId);
        if (vm) return rpcOk(id, runVmToTask(vm));
        const issue = await getIssueRuns(taskId);
        if (!issue) return rpcError(id, RPC.TASK_NOT_FOUND, `task/context '${taskId}' 없음`);
        const latest = issue.runs[issue.runs.length - 1];
        return rpcOk(id, latest ? runVmToTask(latest) : issueToSubmittedTask(taskId, params.app));
      }

      case "tasks/cancel": {
        const taskId: string = p.id ?? p.taskId;
        if (!taskId) return rpcError(id, RPC.INVALID_PARAMS, "params.id(=task id) 필요");
        // 존재 확인 후 실제 Run id 에만 rejectRun 한다. 없는 id 로 부르면 rejectRun→patchRunStatus 가
        // k8s 404 를 던져 INTERNAL_ERROR(-32603)로 새므로, 먼저 resolveRun 으로 해석해 TASK_NOT_FOUND 를 준다.
        const vm = await resolveRun(taskId);
        if (!vm) return rpcError(id, RPC.TASK_NOT_FOUND, `task/context '${taskId}' 없음(또는 취소할 Run 없음)`);
        const res = await rejectRun(vm.id, "canceled via A2A", "a2a-client");
        if (!res.ok) return rpcError(id, RPC.TASK_NOT_CANCELABLE, `취소 실패: ${res.reason}`);
        // cancel 결과는 항상 canceled Task(phase→Cancelled 전환은 operator 가 비동기). 직전 phase 는 metadata.
        return rpcOk(id, {
          kind: "task",
          id: vm.id,
          contextId: vm.issue ?? taskId,
          status: { state: "canceled" },
          metadata: { suspendRequested: true, priorPhase: vm.phase },
        });
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
        // taskId 가 Run 이면 streamTask, contextId(Issue)면 streamIssue 로 분기한다.
        // message/send 가 task.id=issueName 을 돌려주므로, 그 id 로 재구독해도 -32001 이 아니라 정상 스트림.
        const vm = await getRunStatus(taskId);
        if (vm) return sseResponse((emit) => streamTask(taskId, id ?? null, emit, req.signal), req.signal);
        const issue = await getIssueRuns(taskId);
        if (issue) return sseResponse((emit) => streamIssue(taskId, params.app, id ?? null, emit, req.signal), req.signal);
        return rpcError(id, RPC.TASK_NOT_FOUND, `task/context '${taskId}' 없음`);
      }

      default:
        return rpcError(id, RPC.METHOD_NOT_FOUND, `알 수 없는 메서드: ${method}`);
    }
  } catch (err) {
    return rpcError(id, RPC.INTERNAL_ERROR, "내부 오류", err instanceof Error ? err.message : String(err));
  }
}
