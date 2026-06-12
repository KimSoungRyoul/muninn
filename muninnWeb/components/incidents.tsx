"use client";

// Incidents 보드 — /goal "조회" 핵심: 어떤 Application 에 장애(HuginnIssue)가 발생했고
// 대처(HuginnRun)가 진행 중인지 한눈에. 실데이터(/api/issues = query_incidents)를 fetch 한다.
// k8s 미연결(로컬)에서는 API 가 mock 으로 graceful fallback 하므로 항상 렌더된다.
// 위임(생성)은 우측 Muninn Assistant 에 자연어로 요청 → 이 보드에 반영된다.

import * as React from "react";
import { Icon } from "@/components/icons";
import { HmPageHead, HmCard, StatusLabel, fmtMoney, fmtTimeAgo } from "@/components/common";
import { Badge, Chip, Empty, Button } from "@/components/ui";
import { useWorkspace } from "@/lib/workspace-context";
import { HM_DATA } from "@/lib/data";

const { useState, useEffect, useCallback } = React;

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

// HuginnIssue phase(PascalCase) → status-dot 클래스 + 한국어 라벨.
const PHASE_MAP: Record<string, { status: string; label: string }> = {
  Pending: { status: "queued", label: "대기" },
  Running: { status: "running", label: "진행 중" },
  AwaitingApproval: { status: "awaiting", label: "승인 대기" },
  Succeeded: { status: "succeeded", label: "완료" },
  Failed: { status: "failed", label: "실패" },
  Cancelled: { status: "cancelled", label: "취소" },
};
const RUN_LABEL: Record<string, string> = {
  queued: "대기", running: "실행 중", awaiting: "승인 대기",
  succeeded: "성공", failed: "실패", cancelled: "취소",
};

function appInitials(name: string) {
  return name.split("-").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
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
  const wsAppNames = new Set(
    HM_DATA.APPS.filter((a) => a.workspaceId === workspaceId).map((a) => a.name)
  );
  const visible = items.filter((i) => wsAppNames.has(i.app));

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

      {loading && <div className="dim" style={{ padding: 24 }}>불러오는 중…</div>}
      {error && !loading && (
        <HmCard><div className="dim" style={{ padding: 8 }}>조회 오류: {error}</div></HmCard>
      )}
      {!loading && !error && visible.length === 0 && (
        <Empty icon="alert" title="표시할 장애가 없습니다" sub="진행 중인 HuginnIssue 가 없거나, 클러스터에 연결되지 않았습니다." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {visible.map((inc) => {
          const ph = PHASE_MAP[inc.phase] ?? { status: "queued", label: inc.phase };
          return (
            <HmCard key={inc.issue}>
              {/* 헤더: 앱 + severity + source + phase */}
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

              {/* 목표 + 메타 */}
              <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--on-surface)" }}>{inc.title || inc.goal}</div>
              <div className="dim" style={{ marginTop: 4, fontSize: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
                {inc.issuingUser && <span>개시자 {inc.issuingUser}</span>}
                {inc.dedup > 0 && <span>dedup {inc.dedup}</span>}
                <span>대처 {inc.runs.length}건</span>
              </div>

              {/* 대처(HuginnRun) 목록 */}
              {inc.runs.length > 0 ? (
                <table className="hm-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Run</th><th>상태</th><th>단계</th><th>비용</th><th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inc.runs.map((r) => (
                      <tr key={r.id} onClick={() => onOpenRun?.(r.id)} style={{ cursor: onOpenRun ? "pointer" : "default" }}>
                        <td><span className="hm-mono" style={{ fontSize: 12.5 }}>{r.id}</span></td>
                        <td><StatusLabel status={r.status}>{RUN_LABEL[r.status] ?? r.status}{r.approval ? ` · ${r.approval}` : ""}</StatusLabel></td>
                        <td className="hm-mono">{r.step != null ? `${r.step}/${r.max}` : `–/${r.max}`}</td>
                        <td className="hm-mono">{fmtMoney(r.cost)}</td>
                        <td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.output || <span className="dim">–</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="dim" style={{ marginTop: 12, fontSize: 12.5, padding: "8px 0" }}>
                  대처(HuginnRun) 생성 대기 중…
                </div>
              )}
            </HmCard>
          );
        })}
      </div>
    </div>
  );
}
