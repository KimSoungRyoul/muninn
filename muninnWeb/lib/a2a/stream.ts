// A2A 스트리밍(SSE) 헬퍼 — message/stream · tasks/resubscribe.
// 설계: docs/design/muninn-a2a-integration.md §4(V2 P2)/§6.1. operator watch 대신 폴링 기반(PoC) —
// HuginnRun.status.phase 를 주기적으로 읽어 emit. 스펙: 스트림의 첫 프레임은 Task(kind:"task"), 이후 status-update.
// 종료: 단일 Run(streamTask)은 Run 종료, contextId(streamIssue)는 Issue 종료(재시도 backoff 동안 열어둠).
import { getRunStatus, getIssueRuns } from "../incidents";
import { runVmToStatusUpdate, runVmToTask, issueToSubmittedTask, latestRun, isStreamFinal } from "./task-mapper";
import { statusToA2AState } from "./task-mapper";
import type { RunVM } from "../incidents";

type Emit = (data: unknown) => void;

const POLL_MS = 1500;
const MAX_TICKS = 200; // ≈5분 상한(P2 에서 operator watch 로 대체)
const MAX_MISSES = 3; // 조회가 연속 null 일 때 일시 장애 내성(이만큼 후에야 -32001)

// Issue 레벨 종료 phase — 이 경우에만 contextId 스트림을 닫는다(latest Run 이 failed 여도 재시도 중이면 열어둠).
const ISSUE_TERMINAL = new Set(["Succeeded", "Failed", "Cancelled"]);

export function sseResponse(
  producer: (emit: Emit) => Promise<void>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* 닫힌 컨트롤러 — 무시 */
        }
      };
      // 클라이언트가 연결을 끊으면(req.signal abort) 즉시 스트림을 닫아 폴링 루프가 빨리 빠져나오게 한다.
      const onAbort = () => {
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await producer(emit);
      } catch {
        // 내부 상세는 노출하지 않는다(서버 로그는 producer 측에서). 클라이언트엔 일반화된 JSON-RPC 에러만.
        emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "stream-error" } });
      } finally {
        signal?.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    // { once:true } 는 abort 가 '발생'해야만 리스너를 제거한다. 정상(타임아웃) 경로에선 직접 제거하지 않으면
    // 같은 signal 에 매 tick 리스너가 쌓여 MaxListenersExceededWarning + 누수가 난다. 양쪽 경로 모두 정리한다.
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// MAX_TICKS 소진 시 보내는 비종료 timeout 신호 — 클라이언트가 '하드 끊김'과 구분해 tasks/resubscribe 하도록.
function timeoutEvent(taskId: string, contextId: string, rpcId: unknown) {
  return {
    jsonrpc: "2.0",
    id: rpcId,
    result: {
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "working" },
      final: false,
      metadata: { timeout: true, note: "poll budget exhausted — tasks/resubscribe 로 재구독하세요." },
    },
  };
}

const aborted = (signal?: AbortSignal) => signal?.aborted === true;
// 동일 상태 중복 emit 방지용 시그니처(state·step·phase·approval).
const sig = (vm: RunVM) => `${vm.status}|${vm.step}|${vm.phase}|${vm.approval ?? ""}`;

// HuginnRun(task.id) 을 종료 상태까지 폴링. 스펙: 첫 프레임은 Task, 이후 status-update(변화 시에만).
export async function streamTask(taskId: string, rpcId: unknown, emit: Emit, signal?: AbortSignal) {
  try {
    let misses = 0;
    let first = true;
    let last = "";
    let contextId = taskId;
    for (let i = 0; i < MAX_TICKS && !aborted(signal); i++) {
      const vm = await getRunStatus(taskId);
      if (!vm) {
        if (++misses >= MAX_MISSES) {
          emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32001, message: `task '${taskId}' 없음` } });
          return;
        }
        await sleep(POLL_MS, signal);
        continue;
      }
      misses = 0;
      contextId = vm.issue ?? taskId;
      if (first) {
        // 스펙: 구독 시 첫 이벤트는 현재 상태의 Task 스냅샷.
        emit({ jsonrpc: "2.0", id: rpcId, result: runVmToTask(vm) });
        first = false;
        last = sig(vm);
        if (isStreamFinal(statusToA2AState(vm.status))) return;
      } else if (sig(vm) !== last) {
        last = sig(vm);
        const ev = runVmToStatusUpdate(vm);
        emit({ jsonrpc: "2.0", id: rpcId, result: ev });
        if (ev.final) return;
      }
      await sleep(POLL_MS, signal);
    }
    if (!aborted(signal)) emit(timeoutEvent(taskId, contextId, rpcId));
  } catch {
    emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: "stream-error" } });
  }
}

// HuginnIssue(contextId) 폴링. 첫 프레임 Task, 이후 status-update(변화 시). 종료는 Issue 레벨(재시도 동안 열어둠).
// app 스코프 강제: 이 Issue 에 속한 Run 중 r.app === app 인 것만 본다(라우트의 tasks/get 과 동일 패턴).
export async function streamIssue(issueName: string, app: string, rpcId: unknown, emit: Emit, signal?: AbortSignal) {
  try {
    let misses = 0;
    let first = true;
    let last = "";
    for (let i = 0; i < MAX_TICKS && !aborted(signal); i++) {
      const issue = await getIssueRuns(issueName);
      if (!issue) {
        // null=삭제 또는 일시 조회 실패 — 연속 MAX_MISSES 회일 때만 종료(streamTask 와 동일 내성).
        if (++misses >= MAX_MISSES) {
          emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32001, message: `context '${issueName}' 없음` } });
          return;
        }
        await sleep(POLL_MS, signal);
        continue;
      }
      misses = 0;
      const latest = latestRun((issue.runs ?? []).filter((r) => r.app === app));
      // ★ Issue 스트림의 'final' 은 Run 종료성이 아니라 Issue 종료성으로 판정한다.
      //   runVmToStatusUpdate(latest).final 은 Run 상태(isStreamFinal) 기준이라, 재시도 backoff 중
      //   attempt-1 이 failed 면 final:true 가 새어나가 스펙 준수 클라이언트가 조기 종료 → attempt-2 를 못 본다.
      //   따라서 streamFinal = Issue 종료(Succeeded/Failed/Cancelled) 또는 latest 가 input-required 일 때만 true.
      const issueDone = ISSUE_TERMINAL.has(issue.phase);
      const awaitingNow = !!latest && statusToA2AState(latest.status) === "input-required";
      const streamFinal = issueDone || awaitingNow;

      if (first) {
        // 스펙: 첫 프레임은 Task 스냅샷. Run 이 있으면 그 Task, 없으면 submitted Task.
        emit({ jsonrpc: "2.0", id: rpcId, result: latest ? runVmToTask(latest) : issueToSubmittedTask(issueName, app) });
        first = false;
        last = latest ? sig(latest) : "submitted";
        // 첫 프레임이 Task 라도 이미 종료 상태면 종료 status-update(final:true)로 닫는다.
        if (streamFinal && latest) {
          emit({ jsonrpc: "2.0", id: rpcId, result: { ...runVmToStatusUpdate(latest), final: true } });
          return;
        }
      } else if (streamFinal) {
        // 종료 tick — sig 미변경이어도 반드시 final:true 프레임을 한 번 보낸 뒤 닫는다(스펙: 종료 프레임 보장).
        if (latest) emit({ jsonrpc: "2.0", id: rpcId, result: { ...runVmToStatusUpdate(latest), final: true } });
        return;
      } else if (latest && sig(latest) !== last) {
        // 중간 delta — final 은 항상 false(Run 이 failed 여도 Issue 가 살아있으면 닫지 않음).
        last = sig(latest);
        emit({ jsonrpc: "2.0", id: rpcId, result: { ...runVmToStatusUpdate(latest), final: false } });
      }
      await sleep(POLL_MS, signal);
    }
    if (!aborted(signal)) emit(timeoutEvent(issueName, issueName, rpcId));
  } catch {
    emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: "stream-error" } });
  }
}
