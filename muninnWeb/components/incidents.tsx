"use client";

// Incidents 보드 — /goal "조회" 핵심: 어떤 Application 에 장애(HuginnIssue)가 발생했고
// 대처(HuginnRun)가 진행 중인지 한눈에. 실데이터(/api/issues = query_incidents)를 fetch 한다.
// k8s 미연결(로컬)에서는 API 가 mock 으로 graceful fallback 하므로 항상 렌더된다.
// 위임(생성)은 우측 Muninn Assistant 에 자연어로 요청 → 이 보드에 반영된다.

import * as React from "react";
import { Icon } from "@/components/icons";
import { HmPageHead, HmCard, StatusLabel, fmtMoney, fmtTimeAgo, runStatusLabel, appInitials, PHASE_TO_STATUS, PHASE_LABEL } from "@/components/common";
import { Badge, Chip, Empty, Button, Skeleton } from "@/components/ui";
import { useWorkspace } from "@/lib/workspace-context";
import { useApi } from "@/lib/use-api";

const { useState, useEffect, useCallback, useMemo } = React;

interface RunVM {
  id: string; app: string; status: string; phase: string;
  step: number | null; max: number; cost: number; output: string | null;
  issue: string | null; approval: string | null; startedAt: string | null;
}
interface IncidentVM {
  issue: string; app: string; source: string; severity: string; title: string;
  goal: string; phase: string; dedup: number; issuingUser: string | null; runs: RunVM[];
}

const SEV_TONE: Record<string, any> = { critical: "error", error: "error", warning: "warning", info: "info" };
const SOURCE_LABEL: Record<string, string> = { manual: "대화형", grafana: "Grafana", airflow: "Airflow", argocd: "ArgoCD" };

// HuginnIssue phase(PascalCase) → status-dot 클래스 + 한국어 라벨(공용 PHASE_TO_STATUS/PHASE_LABEL 조합).
// 미지의 phase 는 status="queued" + 원문 phase 라벨로 폴백.
function phaseDisplay(phase: string): { status: string; label: string } {
  return { status: PHASE_TO_STATUS[phase] ?? "queued", label: PHASE_LABEL[phase] ?? phase };
}

// ---- 공유 렌더 블록(목록 카드 ↔ 상세 카드 중복 제거) ----
// 대처(HuginnRun) 목록 표 — 없으면 "생성 대기 중…" 폴백.
function IncidentRunsTable({ runs, onOpenRun }: { runs: RunVM[]; onOpenRun?: (id: string) => void }) {
  if (runs.length === 0) {
    return (
      <div className="dim" style={{ marginTop: 12, fontSize: 12.5, padding: "8px 0" }}>
        대처(HuginnRun) 생성 대기 중…
      </div>
    );
  }
  return (
    <div className="hm-table-scroll" style={{ marginTop: 12 }} tabIndex={0}>
      <table className="hm-table">
        <thead>
          <tr>
            <th>Run</th><th>상태</th><th>단계</th><th>비용</th><th>결과</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} onClick={() => onOpenRun?.(r.id)} style={{ cursor: onOpenRun ? "pointer" : "default" }}>
              <td><span className="hm-mono" style={{ fontSize: 12.5 }}>{r.id}</span></td>
              <td><StatusLabel status={r.status}>{runStatusLabel(r.status)}{r.approval ? ` · ${r.approval}` : ""}</StatusLabel></td>
              <td className="hm-mono">{r.step != null ? `${r.step}/${r.max}` : `–/${r.max}`}</td>
              <td className="hm-mono">{fmtMoney(r.cost)}</td>
              <td className="hm-cell-clip">
                {r.output || <span className="dim">–</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 사건 헤더(아바타 + app/issue + severity/source/phase 배지). 목록·상세 공용.
function IncidentCardHeader({ inc, ph }: { inc: IncidentVM; ph: { status: string; label: string } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--primary-95)", color: "var(--primary-40)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
          {appInitials(inc.app)}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="app-link" style={{ fontWeight: 700 }}>{inc.app}</span>
          <span className="hm-mono dim" style={{ fontSize: 11.5 }}>{inc.issue}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Badge tone={SEV_TONE[inc.severity] ?? "default"}>{inc.severity}</Badge>
        <Badge tone="default">{SOURCE_LABEL[inc.source] ?? inc.source}</Badge>
        <StatusLabel status={ph.status}>{ph.label}</StatusLabel>
      </div>
    </div>
  );
}

export function HmIncidents({ onOpenRun }: { onOpenRun?: (id: string) => void }) {
  const [items, setItems] = useState<IncidentVM[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues?status=${statusFilter}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // 다른 페이지(대시보드·앱 목록)와 동일하게 현재 워크스페이스로 스코프한다.
  // /api/issues 는 단일 app 필터만 지원하므로, 워크스페이스의 앱 집합으로 클라이언트에서 필터.
  const { workspaceId } = useWorkspace();
  const { data: apps = [], loading: appsLoading } = useApi<any[]>(`/api/apps?workspace=${encodeURIComponent(workspaceId)}`);
  // issues 와 apps 두 fetch 가 모두 준비되기 전엔 스켈레톤을 유지한다 — 한쪽만 도착하면
  // visible 이 잠깐 빈 배열이 되어 '장애 없음' Empty 가 깜빡이는 레이스를 막는다.
  const booting = loading || appsLoading;
  // 워크스페이스 앱 집합으로 클라이언트 필터 — apps/items 가 바뀔 때만 재계산.
  const visible = useMemo(() => {
    const wsAppNames = new Set((apps ?? []).map((a) => a.name));
    return items.filter((i) => wsAppNames.has(i.app));
  }, [apps, items]);

  const activeCount = visible.filter((i) => ["Pending", "Running", "AwaitingApproval"].includes(i.phase)).length;

  return (
    <div className="hm-page">
      <HmPageHead
        rune="runs"
        title="Incidents"
        sub="장애(HuginnIssue)와 대처(HuginnRun) — 어떤 Application 에 무엇이 진행 중인지"
      >
        <div className="flex items-center gap-2">
          <Chip active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>진행 중</Chip>
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>전체</Chip>
          <Button variant="ghost" size="sm" leftIcon="refresh" onClick={load}>새로고침</Button>
        </div>
      </HmPageHead>

      {/* 요약 스트립 */}
      <div className="hm-incident-summary" style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Badge tone="warning" dot>진행 중 {activeCount}</Badge>
        <Badge tone="default">표시 {visible.length}</Badge>
        <span className="dim" style={{ fontSize: 12.5, alignSelf: "center" }}>
          위임(새 장애 대응 생성)은 우측 <b>Muninn Assistant</b> 에 자연어로 요청하세요.
        </span>
      </div>

      {booting && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-busy="true">
          <span className="sr-only" role="status">Incidents 불러오는 중…</span>
          {Array.from({ length: 3 }, (_, i) => (
            <HmCard key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Skeleton w={32} h={32} r={8} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton w="40%" h={14} />
                  <Skeleton w="65%" h={12} />
                </div>
              </div>
              <Skeleton w="80%" h={13} style={{ marginTop: 12 }} />
            </HmCard>
          ))}
        </div>
      )}
      {error && !loading && (
        <HmCard><div className="dim" style={{ padding: 8 }}>조회 오류: {error}</div></HmCard>
      )}
      {!booting && !error && visible.length === 0 && (
        <Empty icon="alert" title="표시할 장애가 없습니다" sub="진행 중인 HuginnIssue 가 없거나, 클러스터에 연결되지 않았습니다." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {visible.map((inc) => {
          const ph = phaseDisplay(inc.phase);
          return (
            <HmCard key={inc.issue}>
              {/* 헤더: 앱 + severity + source + phase */}
              <IncidentCardHeader inc={inc} ph={ph} />

              {/* 목표 + 메타 */}
              <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--on-surface)" }}>{inc.title || inc.goal}</div>
              <div className="dim" style={{ marginTop: 4, fontSize: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
                {inc.issuingUser && <span>개시자 {inc.issuingUser}</span>}
                {inc.dedup > 0 && <span>dedup {inc.dedup}</span>}
                <span>대처 {inc.runs.length}건</span>
              </div>

              {/* 대처(HuginnRun) 목록 */}
              <IncidentRunsTable runs={inc.runs} onOpenRun={onOpenRun} />
            </HmCard>
          );
        })}
      </div>
    </div>
  );
}

// ---- 단일 사건 상세 (/incidents/[id]) — 위임 후 폴링/추적용. 코파일럿 open_incident 의 도착지 ----
export function HmIncidentDetail({
  issueName, onOpenRun, onBack,
}: { issueName: string; onOpenRun?: (id: string) => void; onBack?: () => void }) {
  const [inc, setInc] = useState<(IncidentVM & { outcome?: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(issueName)}`, { cache: "no-store" });
      if (res.status === 404) { setInc(null); setError("사건(HuginnIssue)을 찾을 수 없습니다"); return; }
      if (!res.ok) throw new Error(`API ${res.status}`);
      setInc(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setInc(null);
    } finally {
      setLoading(false);
    }
  }, [issueName]);

  useEffect(() => { load(); }, [load]);

  // 위임 직후 진입 시 run 이 아직 없을 수 있다 — phase 가 active 인 동안만 5s 폴링(terminal 도달 시 중단).
  useEffect(() => {
    if (!inc || !["Pending", "Running", "AwaitingApproval"].includes(inc.phase)) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [inc, load]);

  const ph = inc ? phaseDisplay(inc.phase) : null;

  return (
    <div className="hm-page">
      <HmPageHead rune="runs" title="사건 상세" sub={issueName}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>← 목록</Button>
          <Button variant="ghost" size="sm" leftIcon="refresh" onClick={load}>새로고침</Button>
        </div>
      </HmPageHead>

      {loading && <div className="dim" style={{ padding: 24 }}>불러오는 중…</div>}
      {error && !loading && (
        <Empty icon="alert" title={error} sub="클러스터에 연결되지 않았거나 해당 사건이 없습니다." />
      )}

      {inc && !loading && ph && (
        <HmCard>
          <IncidentCardHeader inc={inc} ph={ph} />

          <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--on-surface)" }}>{inc.title || inc.goal}</div>
          {inc.goal && inc.goal !== inc.title && (
            <div className="dim" style={{ marginTop: 4, fontSize: 12.5 }}>목표: {inc.goal}</div>
          )}
          <div className="dim" style={{ marginTop: 6, fontSize: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {inc.issuingUser && <span>개시자 {inc.issuingUser}</span>}
            {inc.dedup > 0 && <span>dedup {inc.dedup}</span>}
            <span>대처 {inc.runs.length}건</span>
            {inc.outcome && <span>결과 {inc.outcome}</span>}
          </div>

          <IncidentRunsTable runs={inc.runs} onOpenRun={onOpenRun} />
        </HmCard>
      )}
    </div>
  );
}
