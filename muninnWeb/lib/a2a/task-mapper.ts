// A2A Task ↔ muninn HuginnRun 매핑(순수 함수) — 통합의 핵심.
// 설계: docs/design/muninn-a2a-integration.md §2.1. lib/incidents.ts:phaseToStatus 와 같은 출처.

import type { RunStatus } from "../types";
import type { RunVM } from "../incidents";
import type { A2ATask, A2ATaskState, A2AStatusUpdateEvent } from "./types";

// HuginnRun.phase(PascalCase) → A2A TaskState.
const PHASE_TO_A2A: Record<string, A2ATaskState> = {
  Queued: "submitted",
  Pending: "submitted",
  Running: "working",
  AwaitingApproval: "input-required", // ★ HITL ↔ A2A input-required
  Succeeded: "completed",
  Failed: "failed",
  Cancelled: "canceled",
};
export function phaseToA2AState(phase?: string): A2ATaskState {
  return PHASE_TO_A2A[phase ?? ""] ?? "submitted";
}

// 콘솔 status(소문자, RunVM.status) → A2A TaskState.
// RunVM.status 는 실/mock 양쪽에서 정규화돼 있어 phase 보다 신뢰성이 높다(incidents.ts runView/mock 참고).
const STATUS_TO_A2A: Record<RunStatus, A2ATaskState> = {
  queued: "submitted",
  running: "working",
  awaiting: "input-required",
  succeeded: "completed",
  failed: "failed",
  cancelled: "canceled",
};
export function statusToA2AState(s: RunStatus): A2ATaskState {
  return STATUS_TO_A2A[s] ?? "submitted";
}

const TERMINAL: ReadonlySet<A2ATaskState> = new Set<A2ATaskState>([
  "completed",
  "failed",
  "canceled",
  "rejected",
]);
export function isTerminal(state: A2ATaskState): boolean {
  return TERMINAL.has(state);
}

// HuginnRun(VM) → A2A Task. contextId = HuginnIssue(없으면 run id 로 대체).
export function runVmToTask(vm: RunVM): A2ATask {
  const task: A2ATask = {
    kind: "task",
    id: vm.id,
    contextId: vm.issue ?? vm.id,
    status: { state: statusToA2AState(vm.status) },
    metadata: {
      app: vm.app,
      phase: vm.phase,
      step: vm.step,
      maxStep: vm.max,
      cost: vm.cost,
      approval: vm.approval,
      namespace: vm.namespace,
      ...(vm.startedAt ? { startedAt: vm.startedAt } : {}),
    },
  };
  if (vm.output) {
    task.artifacts = [
      {
        artifactId: `${vm.id}-output`,
        name: "output",
        parts: [{ kind: "text", text: vm.output }],
      },
    ];
  }
  return task;
}

// 위임 직후(아직 Run 미생성) — HuginnIssue 레벨의 submitted Task.
export function issueToSubmittedTask(issueName: string, app: string): A2ATask {
  return {
    kind: "task",
    id: issueName,
    contextId: issueName,
    status: { state: "submitted" },
    metadata: { app, level: "issue", note: "operator 가 곧 HuginnRun 을 생성합니다." },
  };
}

// 스트리밍용 증분 이벤트(message/stream · tasks/resubscribe). final=종료 상태 도달.
export function runVmToStatusUpdate(vm: RunVM, final?: boolean): A2AStatusUpdateEvent {
  const state = statusToA2AState(vm.status);
  return {
    kind: "status-update",
    taskId: vm.id,
    contextId: vm.issue ?? vm.id,
    status: { state },
    final: final ?? isTerminal(state),
    metadata: { app: vm.app, phase: vm.phase, step: vm.step, cost: vm.cost, approval: vm.approval },
  };
}
