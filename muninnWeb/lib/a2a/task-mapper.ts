// A2A Task ↔ muninn HuginnRun 매핑(순수 함수) — 통합의 핵심.
// 설계: docs/design/muninn-a2a-integration.md §2.1. lib/incidents.ts:phaseToStatus 와 같은 출처.

import type { RunStatus } from "../types";
import type { RunVM } from "../incidents";
import type { A2ATask, A2ATaskState, A2AStatusUpdateEvent } from "./types";

// 콘솔 status(소문자, RunVM.status) → A2A TaskState.
// RunVM.status 는 실/mock 양쪽에서 정규화돼 있어(incidents.ts runView/mock) phase 보다 신뢰성이 높아 매핑의 단일 소스다.
// (HuginnRun.phase→A2A 직매핑은 RunVM.status 로 일원화해 제거 — 중복/표류 방지.)
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
// 완전 종료(terminal). 스트림 종료 판정 isStreamFinal 의 보조 — 모듈 로컬(공개 불필요).
function isTerminal(state: A2ATaskState): boolean {
  return TERMINAL.has(state);
}

// 스트림을 닫아야 하는 상태: 종료 상태 + input-required.
// input-required(≡AwaitingApproval)는 에이전트가 입력(승인) 대기로 '멈추는' 인터럽트라, 스트림을 final 로 닫아
// 제어를 클라이언트에 돌려줘야 한다(설계 §1/§6.1: HITL 승인 폴링을 A2A input-required 스트리밍으로 대체).
// isTerminal(완전 종료)과는 의미가 다르므로 별도 헬퍼로 둔다.
export function isStreamFinal(state: A2ATaskState): boolean {
  return isTerminal(state) || state === "input-required";
}

// K8s list 는 순서를 보장하지 않으므로(재시도 시 attempt-2 Run 등) startedAt 내림차순으로 최신 Run 을 고른다.
// startedAt 미설정(아직 Job 미기동 = 가장 최근 생성된 attempt)은 가장 최신으로 취급해야 하므로 future sentinel 로 치환한다.
// 센티넬 동률(미기동 attempt 다수)은 id(operator 의 -a<N> 단조 접미사 포함)로 2차 정렬해 결정성을 확보한다.
const NOT_STARTED = "9999-12-31T23:59:59Z";
export function latestRun(runs: RunVM[] | undefined | null): RunVM | null {
  if (!runs?.length) return null;
  const key = (r: RunVM) => r.startedAt ?? NOT_STARTED;
  return [...runs].sort((a, b) => key(b).localeCompare(key(a)) || (b.id ?? "").localeCompare(a.id ?? ""))[0];
}

// HuginnRun(VM) → A2A Task. contextId = HuginnIssue(없으면 run id 로 대체).
export function runVmToTask(vm: RunVM): A2ATask {
  const task: A2ATask = {
    kind: "task",
    id: vm.id,
    contextId: vm.issue ?? vm.id,
    status: { state: statusToA2AState(vm.status), ...(vm.startedAt ? { timestamp: vm.startedAt } : {}) },
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

// 스트리밍용 증분 이벤트(message/stream · tasks/resubscribe). final=스트림 종료 상태(종료 + input-required).
export function runVmToStatusUpdate(vm: RunVM): A2AStatusUpdateEvent {
  const state = statusToA2AState(vm.status);
  return {
    kind: "status-update",
    taskId: vm.id,
    contextId: vm.issue ?? vm.id,
    status: { state, ...(vm.startedAt ? { timestamp: vm.startedAt } : {}) },
    final: isStreamFinal(state),
    metadata: { app: vm.app, phase: vm.phase, step: vm.step, cost: vm.cost, approval: vm.approval },
  };
}
