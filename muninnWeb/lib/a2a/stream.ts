// A2A 스트리밍(SSE) 헬퍼 — message/stream · tasks/resubscribe.
// 설계: docs/design/muninn-a2a-integration.md §4(V2 P2)/§6.1. operator watch 대신 폴링 기반(PoC) —
// HuginnRun.status.phase 를 주기적으로 읽어 A2A status-update 이벤트로 emit, 종료 상태에서 닫는다.
import { getRunStatus, getIssueRuns } from "../incidents";
import { runVmToStatusUpdate, issueToSubmittedTask, latestRun } from "./task-mapper";

type Emit = (data: unknown) => void;

const POLL_MS = 1500;
const MAX_TICKS = 200; // ≈5분 상한(2 P2 에서 operator watch 로 대체)

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
      try {
        await producer(emit);
      } catch (err) {
        // JSON-RPC 봉투로 감싸 비표준 SSE 이벤트를 막는다(클라이언트 파서 일관성). id 는 producer 가 모르므로 null.
        emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "stream-error", data: String(err) } });
      } finally {
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

// HuginnRun(task.id) 을 종료 상태까지 폴링하며 JSON-RPC SSE 결과를 emit.
export async function streamTask(taskId: string, rpcId: unknown, emit: Emit, signal?: AbortSignal) {
  try {
    for (let i = 0; i < MAX_TICKS && !aborted(signal); i++) {
      const vm = await getRunStatus(taskId);
      if (!vm) {
        emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32001, message: `task '${taskId}' 없음` } });
        return;
      }
      const ev = runVmToStatusUpdate(vm);
      emit({ jsonrpc: "2.0", id: rpcId, result: ev });
      if (ev.final) return;
      await sleep(POLL_MS, signal);
    }
    if (!aborted(signal)) emit(timeoutEvent(taskId, taskId, rpcId));
  } catch (err) {
    emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: "stream-error", data: String(err) } });
  }
}

// HuginnIssue(contextId) 의 최신 Run 을 종료까지 폴링하며 emit(위임 직후 Run 미생성 구간 포함).
export async function streamIssue(issueName: string, app: string, rpcId: unknown, emit: Emit, signal?: AbortSignal) {
  try {
    emit({ jsonrpc: "2.0", id: rpcId, result: issueToSubmittedTask(issueName, app) });
    for (let i = 0; i < MAX_TICKS && !aborted(signal); i++) {
      const issue = await getIssueRuns(issueName);
      const latest = latestRun(issue?.runs);
      if (latest) {
        const ev = runVmToStatusUpdate(latest);
        emit({ jsonrpc: "2.0", id: rpcId, result: ev });
        if (ev.final) return;
      }
      await sleep(POLL_MS, signal);
    }
    if (!aborted(signal)) emit(timeoutEvent(issueName, issueName, rpcId));
  } catch (err) {
    emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: "stream-error", data: String(err) } });
  }
}
