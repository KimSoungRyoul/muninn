// A2A 스트리밍(SSE) 헬퍼 — message/stream · tasks/resubscribe.
// 설계: docs/design/muninn-a2a-integration.md §4(V2 P2)/§6.1. operator watch 대신 폴링 기반(PoC) —
// HuginnRun.status.phase 를 주기적으로 읽어 A2A status-update 이벤트로 emit, 종료 상태에서 닫는다.
import { getRunStatus, getIssueRuns } from "../incidents";
import { runVmToStatusUpdate, issueToSubmittedTask, latestRun } from "./task-mapper";

type Emit = (data: unknown) => void;

const POLL_MS = 1500;
const MAX_TICKS = 200; // ≈5분 상한(P2 에서 operator watch 로 대체)
const MAX_MISSES = 3; // getRunStatus 가 연속 null 일 때 일시 장애 내성(이만큼 후에야 -32001)

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

// HuginnRun(task.id) 을 종료 상태까지 폴링하며 JSON-RPC SSE 결과를 emit.
export async function streamTask(taskId: string, rpcId: unknown, emit: Emit, signal?: AbortSignal) {
  try {
    let misses = 0;
    let contextId = taskId; // 마지막으로 관측한 Run 의 contextId(=issue) — timeout 이벤트에 정확히 채우려고 유지.
    for (let i = 0; i < MAX_TICKS && !aborted(signal); i++) {
      const vm = await getRunStatus(taskId);
      if (!vm) {
        // 일시 조회 실패 내성 — 연속 MAX_MISSES 회 null 일 때만 '없음'으로 종료.
        if (++misses >= MAX_MISSES) {
          emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32001, message: `task '${taskId}' 없음` } });
          return;
        }
        await sleep(POLL_MS, signal);
        continue;
      }
      misses = 0;
      const ev = runVmToStatusUpdate(vm);
      contextId = ev.contextId;
      emit({ jsonrpc: "2.0", id: rpcId, result: ev });
      if (ev.final) return;
      await sleep(POLL_MS, signal);
    }
    if (!aborted(signal)) emit(timeoutEvent(taskId, contextId, rpcId));
  } catch {
    emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: "stream-error" } });
  }
}

// HuginnIssue(contextId) 의 최신 Run 을 종료까지 폴링하며 emit(위임 직후 Run 미생성 구간 포함).
export async function streamIssue(issueName: string, app: string, rpcId: unknown, emit: Emit, signal?: AbortSignal) {
  try {
    emit({ jsonrpc: "2.0", id: rpcId, result: issueToSubmittedTask(issueName, app) });
    for (let i = 0; i < MAX_TICKS && !aborted(signal); i++) {
      const issue = await getIssueRuns(issueName);
      // Issue 가 사라졌으면(삭제) 5분 폴링하지 말고 즉시 종료(스트림 진입 전 존재 확인했으므로 null=삭제).
      if (!issue) {
        emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32001, message: `context '${issueName}' 없음` } });
        return;
      }
      const latest = latestRun(issue.runs);
      if (latest) {
        const ev = runVmToStatusUpdate(latest);
        emit({ jsonrpc: "2.0", id: rpcId, result: ev });
        if (ev.final) return;
      }
      await sleep(POLL_MS, signal);
    }
    if (!aborted(signal)) emit(timeoutEvent(issueName, issueName, rpcId));
  } catch {
    emit({ jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: "stream-error" } });
  }
}
