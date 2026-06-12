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
// 데이터 출처 표식 — k8s 조회 실패 시 mock 폴백을 실데이터로 오인하지 않게 코파일럿/UI 가 구분.
export type DataSource = "k8s" | "mock";

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
  // 거절/승인 사유 표면화(관측성, 리뷰 LOW) — runner 의 _approval_detail 이 'rejected: <사유>' 를 남기도록
  // 평탄화된 state 외에 보조 필드도 노출한다(approval 이 dict 일 때만 채워짐).
  approvalReason?: string | null;
  approvalDecidedBy?: string | null;
  startedAt: string | null;
  source?: DataSource;
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
  dataSource?: DataSource;
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

// K8s label 값으로 안전한 형태인지(정규식 (([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?, 최대 63자).
// app/issue 이름은 CR name 이라 통상 label-safe 이나, 외부 입력일 수 있어 방어적으로 검사한다.
const LABEL_VALUE_RE = /^([A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?)?$/;
function isLabelSafe(v: string): boolean {
  return v.length <= 63 && LABEL_VALUE_RE.test(v);
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
    // 거절 사유 표면화(관측성): reasons[].detail 우선, 없으면 자기류 reason 필드(rejectRun 이 둘 다 기록).
    approvalReason: st.approval?.reason ?? st.approval?.reasons?.[0]?.detail ?? null,
    approvalDecidedBy: st.approval?.decidedBy ?? null,
    startedAt: st.startedAt ?? null,
    source: "k8s",
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

/** name 으로 HuginnAgent CR 1개를 가져온다(없으면 null). */
export async function getApplicationCr(key: string): Promise<any | null> {
  if (!k8s.k8sEnabled()) return null;
  try {
    return await k8s.getHuginnAgent(ns(), key);
  } catch (err: any) {
    // 404 만 null(미존재)로 처리한다. 그 외(RBAC/네트워크)는 재throw — 풀 LIST 폴백은
    // get 이 이미 name 기준이라 동일 name 을 다시 찾을 수 없어 무의미했고 오류만 삼켰다.
    const code = err?.statusCode ?? err?.code ?? err?.response?.statusCode;
    if (code === 404) return null;
    throw err;
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
          issue: e.id, namespace: ns(), approval: r.status === "awaiting" ? "Pending" : null,
          startedAt: r.started, source: "mock" as DataSource,
        }));
        const phase = runs.some((r) => r.status === "running" || r.status === "queued") ? "Running"
          : runs.some((r) => r.status === "awaiting") ? "AwaitingApproval"
          : runs.some((r) => r.status === "succeeded") ? "Succeeded" : "Failed";
        return {
          issue: e.id, app: e.app, source: e.source, severity: e.severity, title: e.title,
          goal: e.title, phase, dedup: e.dedup, issuingUser: null, runs, dataSource: "mock" as DataSource,
        };
      })
      .filter((i) => !wantActive || ACTIVE_PHASES.has(i.phase));
  };

  // k8sEnabled() 는 in-cluster 에서 SA 토큰 미마운트(automountServiceAccountToken=false)여도
  // KUBERNETES_SERVICE_HOST 만으로 true 가 될 수 있다. 그 경우 실제 호출은 자격/TLS 미비로
  // throw 하므로, 여기서 잡아 mock 으로 떨어뜨려 500 대신 graceful degrade 한다.
  if (!k8s.k8sEnabled()) return mock();

  // app 필터가 있으면 muninn.io/agent 라벨로 서버측 필터(풀 덤프 회피). issue/run 양쪽 동일 라벨.
  const agentSel = opts.app && isLabelSafe(opts.app) ? `muninn.io/agent=${opts.app}` : undefined;

  try {
    const [issues, runs] = await Promise.all([
      k8s.listHuginnIssues(ns(), agentSel),
      k8s.listHuginnRuns(ns(), agentSel),
    ]);
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
          dataSource: "k8s" as DataSource,
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
      approval: r.status === "awaiting" ? "Pending" : null, startedAt: r.started, source: "mock" as DataSource,
    }));
  };

  // app 필터는 muninn.io/agent 라벨로 서버측 축소(풀 덤프 회피). status(phase)는 라벨이 아니라 JS 필터.
  const agentSel = opts.app && isLabelSafe(opts.app) ? `muninn.io/agent=${opts.app}` : undefined;

  let runs: RunVM[];
  if (!k8s.k8sEnabled()) {
    runs = mock();
  } else {
    // queryIncidents 와 동일: k8sEnabled 가 true 라도 실제 호출이 실패할 수 있어 mock 으로 fallback.
    try {
      runs = (await k8s.listHuginnRuns(ns(), agentSel)).map(runView);
    } catch (err) {
      console.warn("[muninn] listRunsVM: k8s 조회 실패 — mock 으로 fallback", err);
      runs = mock();
    }
  }
  if (opts.status) runs = runs.filter((r) => r.status === opts.status);
  // 라벨 미부여 CR 방어용으로 app JS 필터도 유지(서버측 라벨 필터가 1차).
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
  // operator 가 자식 Run 에 muninn.io/issue=<issueName> 라벨을 항상 부여 — 서버측 필터로 풀 덤프 회피.
  // issueName 은 CR name 이라 통상 label-safe. spec.issueRef JS 필터는 라벨 누락 CR 방어용으로 유지.
  const issueSel = isLabelSafe(issueName) ? `muninn.io/issue=${issueName}` : undefined;
  const runs = (await k8s.listHuginnRuns(ns(), issueSel))
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
      approval: all.status === "awaiting" ? "Pending" : null, startedAt: all.started, source: "mock",
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

// fingerprint(콜론 등 포함 가능) → K8s label-safe 값. delegateIncident 와 dedup 이 동일 라벨을 보게 한다.
export function fingerprintLabelOf(fingerprint: string): string {
  return fingerprint.replace(/[^A-Za-z0-9_.-]/g, "-").replace(/^[-_.]+|[-_.]+$/g, "").slice(0, 63);
}

// webhook/위임 입력으로부터 정규 fingerprint 문자열(spec.event.fingerprint)을 만든다.
export function eventFingerprint(source: string, rawFingerprint: string | undefined, goal: string): string {
  return rawFingerprint || `${source}:${slug(goal)}`;
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
  const fingerprint = eventFingerprint(source, input.fingerprint, input.goal);
  // K8s label 값은 ':' 등을 못 쓴다(정규식 (([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?).
  // fingerprint(콜론 포함)는 spec.event 에만 두고, 라벨에는 label-safe 로 정규화해 넣는다.
  const fingerprintLabel = fingerprintLabelOf(fingerprint);

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
export interface DecisionResult {
  ok: boolean;
  runId: string;
  reason?: string;            // 실패 분류: k8s-disabled | not-found | invalid-state | expired | patch-failed
  phase?: string;             // invalid-state 시 현재 phase
  approvalState?: string | null; // invalid-state 시 현재 approval.state
  error?: string;             // patch-failed 시 상세
}

// 승인/거절 가능 상태인지 검증한다(읽기-검사-패치). 종료된 Run 재결정·이미 결정된 승인 재결정·만료 차단.
// 읽기-검사-패치 race 는 남지만 늦은/중복 결정의 대부분을 막는다.
async function loadApprovableRun(runId: string): Promise<{ cr: any } | DecisionResult> {
  let cr: any;
  try {
    cr = await k8s.getHuginnRun(ns(), runId);
  } catch (err: any) {
    const code = err?.statusCode ?? err?.code ?? err?.response?.statusCode;
    if (code === 404) return { ok: false, runId, reason: "not-found" };
    return { ok: false, runId, reason: "patch-failed", error: err instanceof Error ? err.message : String(err) };
  }
  const st = cr?.status ?? {};
  const phase: string = st.phase ?? "";
  const approvalState: string | null = st.approval?.state ?? null;
  if (phase !== "AwaitingApproval" || approvalState !== "Pending") {
    return { ok: false, runId, reason: "invalid-state", phase, approvalState };
  }
  // 만료(expiresAt) 경과 차단 — operator/web 어느 쪽이든 만료 강제.
  const expiresAt = st.approval?.expiresAt;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    return { ok: false, runId, reason: "expired", phase, approvalState };
  }
  return { cr };
}

export async function approveRun(runId: string, decidedBy = "operator"): Promise<DecisionResult> {
  if (!k8s.k8sEnabled()) return { ok: false, runId, reason: "k8s-disabled" };
  const loaded = await loadApprovableRun(runId);
  if ("ok" in loaded) return loaded;
  try {
    await k8s.patchRunStatus(ns(), runId, {
      approval: { state: "Approved", decidedBy, decidedAt: new Date().toISOString() },
    });
  } catch (err) {
    return { ok: false, runId, reason: "patch-failed", error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, runId };
}

export async function rejectRun(runId: string, reason = "", decidedBy = "operator"): Promise<DecisionResult> {
  if (!k8s.k8sEnabled()) return { ok: false, runId, reason: "k8s-disabled" };
  const loaded = await loadApprovableRun(runId);
  if ("ok" in loaded) return loaded;
  // 승인 거절 기록(API 소유) + Run suspend(operator 가 활성 Run 취소; operator-design §2.3).
  // 거절 사유는 CRD 계약(reasons[{type,detail}])과 자기류 reason 필드 둘 다 기록 — operator 가
  // ApprovalStatus.reason/decidedAt 을 추가하는 중이므로 그대로 유지(중복 작업 금지).
  try {
    await k8s.patchRunStatus(ns(), runId, {
      approval: {
        state: "Rejected",
        decidedBy,
        decidedAt: new Date().toISOString(),
        ...(reason ? { reason, reasons: [{ type: "OperatorRejected", detail: reason }] } : {}),
      },
    });
  } catch (err) {
    return { ok: false, runId, reason: "patch-failed", error: err instanceof Error ? err.message : String(err) };
  }
  try {
    await k8s.patchRunSpec(ns(), runId, { suspend: true });
  } catch {
    // suspend 실패는 치명적 아님(거절 기록은 남음)
  }
  return { ok: true, runId };
}

// ---- 승인 요청 전이(런타임 승인루프의 API 측, CONTRACT §3 / operator-design §2.2) ----
// 런너가 위험 작업 직전 report 에 requestApproval 을 보내면, report 라우트가 이 헬퍼로
// API 소유 status(phase=AwaitingApproval, approval.state=Pending …)를 merge-patch 한다.
// approval 만료는 기본 90분(MUNINN_APPROVAL_TTL_MINUTES 로 override).

export interface ApprovalReason {
  type: string;
  detail?: string;
}

// 이미 종료(terminal)된 Run 은 승인 전이를 받지 않는다 — 늦은/중복 requestApproval 이
// 종료된 Run 을 다시 AwaitingApproval 로 되돌리지 않게 한다(상태 검증).
const TERMINAL_PHASES = new Set(["Succeeded", "Failed", "Cancelled"]);
export function isTerminalPhase(phase?: string): boolean {
  return TERMINAL_PHASES.has(phase ?? "");
}

function approvalTtlMinutes(): number {
  const v = Number(process.env.MUNINN_APPROVAL_TTL_MINUTES);
  return Number.isFinite(v) && v > 0 ? v : 90;
}

/**
 * requestApproval 보고로부터 API 소유 status 조각(phase=AwaitingApproval + approval Pending)을
 * 만든다. reasons 는 [{type, detail?}] 로 정규화(문자열만 온 경우도 수용). expiresAt=now+TTL.
 */
export function buildApprovalRequest(reasons: unknown): {
  phase: "AwaitingApproval";
  approval: { state: "Pending"; reasons?: ApprovalReason[]; requestedAt: string; expiresAt: string };
} {
  const now = Date.now();
  const requestedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + approvalTtlMinutes() * 60_000).toISOString();
  const normReasons = normalizeApprovalReasons(reasons);
  return {
    phase: "AwaitingApproval",
    approval: {
      state: "Pending",
      ...(normReasons.length ? { reasons: normReasons } : {}),
      requestedAt,
      expiresAt,
    },
  };
}

/** 승인 사유 배열 정규화 — {type, detail?} 형태로. 문자열은 type 으로 수용, 빈 항목은 버린다. */
export function normalizeApprovalReasons(raw: unknown): ApprovalReason[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any): ApprovalReason | null => {
      if (typeof r === "string") return r ? { type: r } : null;
      if (r && typeof r === "object" && typeof r.type === "string" && r.type) {
        return { type: r.type, ...(typeof r.detail === "string" && r.detail ? { detail: r.detail } : {}) };
      }
      return null;
    })
    .filter((x): x is ApprovalReason => x != null);
}

// ---- webhook dedup(설계 §4.4) — 활성 동일 fingerprint Issue 가 있으면 새 Issue 생성 대신 dedupCount++ ----
export interface DedupResult {
  hit: boolean;
  issueName?: string;   // 기존 활성 Issue name(hit 일 때)
  dedupCount?: number;  // 증가 후 카운트
}

/**
 * 위임 전 호출 — fingerprint 라벨로 활성(Pending/Running/AwaitingApproval) HuginnIssue 를 찾아,
 * 있으면 status.dedupCount 를 +1 merge-patch 하고 hit=true 를 반환한다. 없으면 hit=false(새로 생성).
 * Redis 도입 전 K8s 라벨 기반 MVP. fingerprint 는 label-safe 로 정규화된 값을 받는다.
 *
 * **불변식(리뷰 LOW)**: dedup 조회 namespace 와 delegateIncident 의 Issue 생성 namespace 는 반드시
 * 일치해야 한다. 둘 다 ns()(=k8s.DEFAULT_NAMESPACE)를 기준으로 한다 — delegateIncident 는
 * `agent.metadata.namespace ?? ns()` 로 생성하지만, agent CR 도 listApplications/getApplicationCr 가
 * ns() 에서 조회하므로 단일 namespace 운영에서 둘이 같다. agent CR 을 다른 namespace 에 두는 멀티-
 * namespace 배치로 확장하면, dedup 이 생성 namespace 를 보지 못해 중복 Issue 가 양산되므로(매번 hit=false)
 * 이 함수에 대상 namespace 를 인자로 받아 delegate 와 공유해야 한다.
 */
export async function dedupActiveIssue(app: string, fingerprintLabel: string): Promise<DedupResult> {
  if (!k8s.k8sEnabled() || !fingerprintLabel || !isLabelSafe(fingerprintLabel)) return { hit: false };
  let issues: any[];
  try {
    issues = await k8s.listHuginnIssues(ns(), `muninn.io/event-fingerprint=${fingerprintLabel}`);
  } catch {
    // 조회 실패 시 dedup 을 건너뛰고 생성으로 진행(과소 dedup이 과다 생성보다 안전).
    return { hit: false };
  }
  const active = issues.find((i: any) => {
    const sameApp = !app || i?.spec?.agentRef === app || i?.metadata?.labels?.["muninn.io/agent"] === app;
    return sameApp && ACTIVE_PHASES.has(i?.status?.phase ?? "Pending");
  });
  if (!active) return { hit: false };

  const name = active?.metadata?.name as string;
  const next = num(active?.status?.dedupCount) + 1;
  try {
    await k8s.patchIssueStatus(ns(), name, { dedupCount: next });
  } catch {
    // 카운트 증가 실패해도 dedup-hit 판정은 유지(중복 Issue 생성 회피가 우선).
  }
  return { hit: true, issueName: name, dedupCount: next };
}
