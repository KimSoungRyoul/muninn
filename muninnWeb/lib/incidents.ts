// muninnWeb = Muninn API — 사건(incident) 오케스트레이션 (서버 전용).
//
// HuginnAgent/HuginnIssue/HuginnRun CR(muninn.io/v1beta1) ↔ 콘솔 뷰 매핑과
// 위임(delegate)·조회(query)·승인(approve/reject)을 한곳에 모은다. 코파일럿 server tool
// (lib/copilot-tools)과 실 API 라우트(app/api/**)가 공통으로 호출한다(중복 로직 제거).
//
// 설계: muninn-goal-conversational-delegation.md §3(시퀀스)/§4(CR 계약)/§5(라우트).
// K8s 미연결(로컬 dev·자격 없음) 시 HM_DATA mock 으로 graceful fallback — 마이그레이션 중이라
// 콘솔이 클러스터 없이도 동작하게 둔다(설계 §2 "Migration in progress").

import * as k8s from "./k8s";
import { recordIncident } from "./db";
import { APPS, EVENTS, LIVE_RUNS, RECENT_RUNS } from "./data";
import type { RunStatus } from "./types";

// ---- CR phase(PascalCase) → 콘솔 status(소문자) 매핑(설계 §3.4) ----
const PHASE_TO_STATUS: Record<string, RunStatus> = {
  Queued: "queued",
  Pending: "queued",
  Running: "running",
  AwaitingApproval: "awaiting",
  Succeeded: "succeeded",
  Failed: "failed",
  Cancelled: "cancelled",
};
export function phaseToStatus(phase?: string): RunStatus {
  return PHASE_TO_STATUS[phase ?? ""] ?? "queued";
}

// ---- 콘솔 뷰 타입(코파일럿/표가 그대로 렌더) ----
export interface RunVM {
  id: string;
  app: string;
  status: RunStatus;
  phase: string;
  step: number | null;
  max: number;
  cost: number;
  output: string | null;
  issue: string | null;
  namespace: string;
  approval: string | null; // Pending | Approved | Rejected | Expired
  startedAt: string | null;
}

export interface IncidentVM {
  issue: string;
  app: string;
  source: string;
  severity: string;
  title: string;
  goal: string;
  phase: string;
  dedup: number;
  issuingUser: string | null;
  runs: RunVM[];
}

const ns = () => k8s.DEFAULT_NAMESPACE;
const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

/**
 * 보고 입력의 recalledMemoryIds 를 status.recalledMemoryIds(RecalledMemory[]) 로 정규화.
 * id 가 없는 항목은 버린다(빈/undefined id 가 status 에 들어가지 않게).
 */
export function normalizeRecalledMemoryIds(raw: unknown): Array<{ id: string; score?: string; reason?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: any) => {
      const id = typeof m === "string" ? m : m?.id;
      if (!id || typeof id !== "string") return null;
      const obj = typeof m === "object" && m ? m : {};
      return {
        id,
        ...(obj.score != null ? { score: String(obj.score) } : {}),
        ...(obj.reason ? { reason: String(obj.reason) } : {}),
      };
    })
    .filter((x): x is { id: string; score?: string; reason?: string } => x != null);
}

function runView(cr: any): RunVM {
  const st = cr?.status ?? {};
  const labels = cr?.metadata?.labels ?? {};
  return {
    id: cr?.metadata?.name ?? "",
    app: labels["muninn.io/agent"] ?? "",
    status: phaseToStatus(st.phase),
    phase: st.phase ?? "Queued",
    step: st.step == null ? null : Number(st.step),
    max: num(st.maxStep) || 12,
    cost: num(st.cost),
    output: st.output ?? null,
    issue: cr?.spec?.issueRef ?? null,
    namespace: cr?.metadata?.namespace ?? ns(),
    approval: st.approval?.state ?? null,
    startedAt: st.startedAt ?? null,
  };
}

// ---- 조회: 애플리케이션(HuginnAgent) ----
export interface AppVM {
  id: string;
  name: string;
  namespace: string;
  kind: string;
  output: string;
  repo: string;
  image: string;
}

function appView(cr: any): AppVM {
  const s = cr?.spec ?? {};
  return {
    id: cr?.metadata?.name ?? "",
    name: cr?.metadata?.name ?? "",
    namespace: cr?.metadata?.namespace ?? ns(),
    kind: s.kind ?? "other",
    output: s.output ?? "pull_request",
    repo: s.source?.repo ?? "",
    image: s.agent?.image ?? "",
  };
}

export async function listApplications(): Promise<AppVM[]> {
  if (!k8s.k8sEnabled()) {
    return APPS.map((a) => ({
      id: a.id, name: a.name, namespace: ns(), kind: a.kind, output: a.output, repo: a.repo, image: "",
    }));
  }
  const items = await k8s.listHuginnAgents(ns());
  return items.map(appView);
}

/** id 또는 name 으로 HuginnAgent CR 1개를 가져온다(없으면 null). */
export async function getApplicationCr(key: string): Promise<any | null> {
  if (!k8s.k8sEnabled()) return null;
  try {
    return await k8s.getHuginnAgent(ns(), key);
  } catch {
    // name 이 아닐 수 있으니 목록에서 name 매칭 재시도
    const items = await k8s.listHuginnAgents(ns());
    return items.find((a: any) => a?.metadata?.name === key) ?? null;
  }
}

// ---- 조회: 진행 중 사건(HuginnIssue + HuginnRun 조인) ----
// "어떤 App 에 장애(HuginnIssue) 나고 대처(HuginnRun) 진행중?" 응답의 본체.
const ACTIVE_PHASES = new Set(["Pending", "Running", "AwaitingApproval"]);

export async function queryIncidents(opts: { status?: "active" | "all"; app?: string } = {}): Promise<IncidentVM[]> {
  const wantActive = (opts.status ?? "active") === "active";

  // mock: EVENTS + runs 조인 (k8s 비활성 또는 k8s 조회 실패 시 graceful fallback)
  const mock = (): IncidentVM[] => {
    const runById = new Map<string, any>();
    for (const r of [...LIVE_RUNS, ...RECENT_RUNS]) if (!runById.has(r.id)) runById.set(r.id, r);
    return EVENTS.filter((e) => !opts.app || e.app === opts.app)
      .map<IncidentVM>((e) => {
        const runs = e.runIds.map((id) => runById.get(id)).filter(Boolean).map((r: any) => ({
          id: r.id, app: r.app, status: r.status as RunStatus, phase: r.status,
          step: r.step, max: r.max, cost: r.cost, output: r.output,
          issue: e.id, namespace: ns(), approval: r.status === "awaiting" ? "Pending" : null, startedAt: r.started,
        }));
        const phase = runs.some((r) => r.status === "running" || r.status === "queued") ? "Running"
          : runs.some((r) => r.status === "awaiting") ? "AwaitingApproval"
          : runs.some((r) => r.status === "succeeded") ? "Succeeded" : "Failed";
        return {
          issue: e.id, app: e.app, source: e.source, severity: e.severity, title: e.title,
          goal: e.title, phase, dedup: e.dedup, issuingUser: null, runs,
        };
      })
      .filter((i) => !wantActive || ACTIVE_PHASES.has(i.phase));
  };

  // k8sEnabled() 는 in-cluster 에서 SA 토큰 미마운트(automountServiceAccountToken=false)여도
  // KUBERNETES_SERVICE_HOST 만으로 true 가 될 수 있다. 그 경우 실제 호출은 자격/TLS 미비로
  // throw 하므로, 여기서 잡아 mock 으로 떨어뜨려 500 대신 graceful degrade 한다.
  if (!k8s.k8sEnabled()) return mock();

  try {
    const [issues, runs] = await Promise.all([k8s.listHuginnIssues(ns()), k8s.listHuginnRuns(ns())]);
    const runsByIssue = new Map<string, any[]>();
    for (const r of runs) {
      const key = r?.spec?.issueRef ?? "";
      (runsByIssue.get(key) ?? runsByIssue.set(key, []).get(key)!).push(r);
    }
    return issues
      .filter((i: any) => !opts.app || i?.spec?.agentRef === opts.app)
      .map<IncidentVM>((i: any) => {
        const name = i?.metadata?.name ?? "";
        const st = i?.status ?? {};
        const ev = i?.spec?.event ?? {};
        return {
          issue: name,
          app: i?.spec?.agentRef ?? "",
          source: ev.source ?? "manual",
          severity: ev.severity ?? "warning",
          title: ev.title ?? i?.spec?.goal ?? "",
          goal: i?.spec?.goal ?? "",
          phase: st.phase ?? "Pending",
          dedup: num(st.dedupCount),
          issuingUser: i?.spec?.issuingUser ?? null,
          runs: (runsByIssue.get(name) ?? []).map(runView),
        };
      })
      .filter((i) => !wantActive || ACTIVE_PHASES.has(i.phase));
  } catch (err) {
    console.warn("[muninn] queryIncidents: k8s 조회 실패 — mock 으로 fallback", err);
    return mock();
  }
}

export async function listRunsVM(opts: { status?: RunStatus; app?: string } = {}): Promise<RunVM[]> {
  const mock = (): RunVM[] => {
    const byId = new Map<string, any>();
    for (const r of [...LIVE_RUNS, ...RECENT_RUNS]) if (!byId.has(r.id)) byId.set(r.id, r);
    return [...byId.values()].map((r: any) => ({
      id: r.id, app: r.app, status: r.status, phase: r.status, step: r.step, max: r.max,
      cost: r.cost, output: r.output, issue: null, namespace: ns(),
      approval: r.status === "awaiting" ? "Pending" : null, startedAt: r.started,
    }));
  };

  let runs: RunVM[];
  if (!k8s.k8sEnabled()) {
    runs = mock();
  } else {
    // queryIncidents 와 동일: k8sEnabled 가 true 라도 실제 호출이 실패할 수 있어 mock 으로 fallback.
    try {
      runs = (await k8s.listHuginnRuns(ns())).map(runView);
    } catch (err) {
      console.warn("[muninn] listRunsVM: k8s 조회 실패 — mock 으로 fallback", err);
      runs = mock();
    }
  }
  if (opts.status) runs = runs.filter((r) => r.status === opts.status);
  if (opts.app) runs = runs.filter((r) => r.app === opts.app);
  return runs;
}

// 위임 후 폴링용 — issueName 으로 그 이슈의 phase/outcome + 생성된 Run 들을 조회.
// operator 가 HuginnIssue→HuginnRun 을 비동기 생성하므로, 코파일럿은 이걸로 run 등장→완료를 추적한다.
export async function getIssueRuns(issueName: string): Promise<{
  issue: string; phase: string; outcome: string | null; runRefs: string[]; runs: RunVM[];
} | null> {
  if (!k8s.k8sEnabled()) return null;
  let issue: any;
  try {
    issue = await k8s.getHuginnIssue(ns(), issueName);
  } catch {
    return null;
  }
  const runs = (await k8s.listHuginnRuns(ns()))
    .filter((r: any) => r?.spec?.issueRef === issueName)
    .map(runView);
  return {
    issue: issueName,
    phase: issue?.status?.phase ?? "Pending",
    outcome: issue?.status?.outcome ?? null,
    runRefs: issue?.status?.runRefs ?? runs.map((r) => r.id),
    runs,
  };
}

export async function getRunStatus(runId: string): Promise<RunVM | null> {
  if (!k8s.k8sEnabled()) {
    const all = [...LIVE_RUNS, ...RECENT_RUNS].find((r) => r.id === runId);
    if (!all) return null;
    return {
      id: all.id, app: all.app, status: all.status, phase: all.status, step: all.step, max: all.max,
      cost: all.cost, output: all.output, issue: null, namespace: ns(),
      approval: all.status === "awaiting" ? "Pending" : null, startedAt: all.started,
    };
  }
  try {
    return runView(await k8s.getHuginnRun(ns(), runId));
  } catch {
    return null;
  }
}

// ---- 위임: 운영자 프롬프트 → HuginnIssue CR 생성(설계 §3.2/§4.2) ----
export interface DelegateInput {
  app: string; // HuginnAgent name (=Application)
  goal: string;
  userPrompt?: string;
  issuingUser?: string;
  severity?: "info" | "warning" | "error" | "critical";
  recalledMemoryIds?: string[];
  // 트리거 출처. manual(대화형) 또는 webhook(grafana/airflow/argocd). 기본 manual.
  source?: "manual" | "grafana" | "airflow" | "argocd";
  // webhook 등에서 event 식별을 위해 fingerprint/title 을 직접 줄 수 있다(없으면 goal 에서 파생).
  fingerprint?: string;
  title?: string;
}
export interface DelegateResult {
  ok: boolean;
  issueName?: string;
  namespace?: string;
  app?: string;
  incidentId?: number;
  incidentRecorded?: boolean; // metaDB 이력 기록 성공 여부(실패해도 위임은 성공할 수 있음)
  reason?: string;
  error?: string; // 실패 시 원인 상세(구조화)
}

// 결정적이지 않아도 되는 짧은 무작위 접미사(CR name 충돌 회피용).
function rid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "manual";
}

export async function delegateIncident(input: DelegateInput): Promise<DelegateResult> {
  if (!k8s.k8sEnabled()) {
    // mock: CR 생성 불가 — 시뮬레이션 응답(코파일럿이 사용자에게 안내)
    return { ok: false, reason: "k8s-disabled", app: input.app };
  }
  const agent = await getApplicationCr(input.app);
  if (!agent) return { ok: false, reason: "agent-not-found", app: input.app };

  const namespace = agent?.metadata?.namespace ?? ns();
  const g = agent?.spec?.guardrails ?? {};
  const source = input.source ?? "manual";
  const issueName = `issue-${slug(input.app)}-${rid()}`;
  const fingerprint = input.fingerprint || `${source}:${slug(input.goal)}`;
  // K8s label 값은 ':' 등을 못 쓴다(정규식 (([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?).
  // fingerprint(콜론 포함)는 spec.event 에만 두고, 라벨에는 label-safe 로 정규화해 넣는다.
  const fingerprintLabel = fingerprint.replace(/[^A-Za-z0-9_.-]/g, "-").replace(/^[-_.]+|[-_.]+$/g, "").slice(0, 63);

  const body: Record<string, unknown> = {
    apiVersion: `${k8s.GROUP}/${k8s.VERSION}`,
    kind: "HuginnIssue",
    metadata: {
      name: issueName,
      namespace,
      labels: {
        "muninn.io/agent": input.app,
        "muninn.io/source": source,
        "muninn.io/event-fingerprint": fingerprintLabel,
      },
      // cascade GC — operator 가 누락 시 보강하지만 명시(설계 §4.2)
      ownerReferences: agent?.metadata?.uid
        ? [{
            apiVersion: `${k8s.GROUP}/${k8s.VERSION}`,
            kind: "HuginnAgent",
            name: agent.metadata.name,
            uid: agent.metadata.uid,
            controller: true,
          }]
        : undefined,
    },
    spec: {
      agentRef: input.app,
      event: {
        id: `e_${rid()}`,
        source,
        severity: input.severity ?? "warning",
        fingerprint,
        title: (input.title || input.goal).slice(0, 120),
      },
      goal: input.goal,
      issuingUser: input.issuingUser || undefined,
      userPrompt: input.userPrompt || undefined,
      // 회상한 근거 기억 id 동봉(감사 추적 + 에이전트 seed; 설계 §3.1/§7).
      ...(input.recalledMemoryIds?.length ? { recalledMemoryIds: input.recalledMemoryIds } : {}),
      inheritedGuardrails: {
        maxIterations: num(g.maxIterations) || 12,
        maxCostUsd: num(g.maxCostUsd) || 5,
        ...(g.maxTokens ? { maxTokens: Number(g.maxTokens) } : {}),
      },
      ...(agent?.spec?.bindings ? { inheritedBindings: agent.spec.bindings } : {}),
      identity: agent?.spec?.identity ?? { k8sNamespace: namespace },
      retryPolicy: { maxRuns: 3, backoff: "exponential" },
    },
  };

  // CR 생성 실패는 위임 실패로 구조화해 반환(핸들러/코파일럿이 안내). 500 crash 방지.
  let created: any;
  try {
    created = await k8s.createHuginnIssue(namespace, body);
  } catch (err) {
    return { ok: false, reason: "create-failed", app: input.app, error: err instanceof Error ? err.message : String(err) };
  }
  const createdName = created?.metadata?.name ?? issueName;

  // 사건 이력(metaDB) 시작 기록 — recall→위임 라이프사이클(설계 §7.3). 실패 시 결과에 노출(무음 금지).
  let incidentId: number | undefined;
  let incidentRecorded = false;
  try {
    incidentId = await recordIncident({
      issueName: createdName, appId: input.app, appName: input.app,
      issuingUser: input.issuingUser, userPrompt: input.userPrompt, goal: input.goal,
      recalledMemoryIds: input.recalledMemoryIds, status: "delegated",
    });
    incidentRecorded = true;
  } catch (err) {
    // 위임(CR)은 성공했으나 metaDB 이력 기록 실패 — 결과에 명시(계약 위반 가시화).
    console.warn("[delegate] incident_log 기록 실패(위임은 성공):", err instanceof Error ? err.message : err);
  }

  return { ok: true, issueName: createdName, namespace, app: input.app, incidentId, incidentRecorded };
}

// ---- 승인/거절: Muninn API 소유 필드(status.approval)만 merge-patch(설계 §4.3) ----
export async function approveRun(runId: string, decidedBy = "operator"): Promise<{ ok: boolean; runId: string; reason?: string }> {
  if (!k8s.k8sEnabled()) return { ok: false, runId, reason: "k8s-disabled" };
  await k8s.patchRunStatus(ns(), runId, {
    approval: { state: "Approved", decidedBy, decidedAt: new Date().toISOString() },
  });
  return { ok: true, runId };
}

export async function rejectRun(runId: string, reason = "", decidedBy = "operator"): Promise<{ ok: boolean; runId: string; reason?: string }> {
  if (!k8s.k8sEnabled()) return { ok: false, runId, reason: "k8s-disabled" };
  // 승인 거절 기록(API 소유) + Run suspend(operator 가 활성 Run 취소; operator-design §2.3)
  await k8s.patchRunStatus(ns(), runId, {
    approval: { state: "Rejected", decidedBy, decidedAt: new Date().toISOString(), ...(reason ? { reason } : {}) },
  });
  try {
    await k8s.patchRunSpec(ns(), runId, { suspend: true });
  } catch {
    // suspend 실패는 치명적 아님(거절 기록은 남음)
  }
  return { ok: true, runId };
}
