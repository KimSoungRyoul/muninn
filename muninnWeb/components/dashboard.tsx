"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { Button, Tabs, Empty } from "@/components/ui";
import { HmPageHead, HmKpi, HmCard, StackedBars, StatusLabel, fmtMoney, fmtDuration, fmtTimeAgo } from "@/components/common";
import { HM_DATA } from "@/lib/data";

// Huginn & Muninn — Dashboard page

function HmDashboard({ onNav, onOpenRun, onOpenApp, workspaceId }: any) {
  const D = HM_DATA;
  const ws = D.WORKSPACES.find(w => w.id === workspaceId) || D.WORKSPACES[0];
  const wsApps = D.APPS.filter(a => a.workspaceId === workspaceId);
  const wsAppNames = new Set(wsApps.map(a => a.name));
  const liveRuns = D.LIVE_RUNS.filter(r => wsAppNames.has(r.app));

  const wsRuns24h = wsApps.reduce((s, a) => s + a.runs24h, 0);
  const wsFailed24h = wsApps.reduce((s, a) => s + a.failed24h, 0);
  const successRate = wsRuns24h > 0 ? ((wsRuns24h - wsFailed24h) / wsRuns24h * 100).toFixed(1) : "0";

  // 평균 비용/실행: 현재 워크스페이스 run 들의 평균 (하드코딩 대신 실제 데이터로 계산)
  const wsRecentRuns = D.RECENT_RUNS.filter(r => wsAppNames.has(r.app));
  const avgCostPerRun = wsRecentRuns.length
    ? wsRecentRuns.reduce((s, r) => s + r.cost, 0) / wsRecentRuns.length
    : 0;

  // 승인 대기: 워크스페이스 내 awaiting run. hint/link 는 실제 run 이 있을 때만 노출한다.
  const awaitingRuns = liveRuns.filter(r => r.status === "awaiting");
  const oldestAwaiting = awaitingRuns.reduce(
    (acc, r) => (acc && new Date(acc.started) <= new Date(r.started) ? acc : r),
    awaitingRuns[0]
  );
  const agoKo = (iso: string) => {
    const m = Math.max(0, (D.NOW.getTime() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${Math.floor(m)}분 전`;
    if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
    return `${Math.floor(m / 1440)}일 전`;
  };

  const kpis = [
    { label: "24시간 실행",        value: `${wsRuns24h}`,         delta: 12,   dir: "up",   hint: "어제 대비 +12" },
    { label: "성공률",             value: successRate,    unit: "%",   delta: 2.1,  dir: "up",   hint: "+2.1pp" },
    { label: "평균 비용/실행",     value: `$${avgCostPerRun.toFixed(3)}`,               delta: 13,   dir: "down", hint: "-$0.011" },
    { label: "승인 대기",           value: awaitingRuns.length.toString(),                                accent: "amber", hint: oldestAwaiting ? `가장 오래된 건 ${agoKo(oldestAwaiting.started)}` : "대기 중인 승인 없음", link: oldestAwaiting ? () => onOpenRun(oldestAwaiting.id) : undefined },
  ];

  const topFailing = wsApps
    .filter(a => a.failed24h > 0)
    .sort((a, b) => b.failed24h - a.failed24h)
    .slice(0, 5);

  const monthCost = 182.40, monthCap = 500;
  const monthByApp = [
    { name: "ai-router-svc",  pct: 48, color: "var(--huginn-500)" },
    { name: "payment-worker", pct: 19, color: "var(--muninn-500)" },
    { name: "search-indexer", pct: 12, color: "var(--primary-50)" },
    { name: "data-etl",       pct:  8, color: "#5B7C7A" },
    { name: "others",         pct: 13, color: "var(--on-surface-muted)" },
  ];

  return (
    <>
      <HmPageHead title="대시보드" sub={`${ws.name} 워크스페이스 · 실시간 운영 현황 · 최근 24시간`}>
        <Tabs pill value="24h" onChange={() => {}} tabs={[
          {label:"1시간", value:"1h"},{label:"6시간", value:"6h"},{label:"24시간", value:"24h"},{label:"7일", value:"7d"},
        ]}/>
        <Button variant="ghost" size="sm" leftIcon="refresh"/>
      </HmPageHead>

      {/* KPI grid */}
      <div className="hm-kpi-grid">
        {kpis.map((k, i) => <HmKpi key={i} {...k}/>)}
      </div>

      {/* Flow + Top failing */}
      <div style={{display:"grid", gridTemplateColumns:"1.6fr 1fr", gap:12, marginBottom:12}}>
        <HmCard
          title="실행 추이"
          meta="24시간 · 30분 단위"
          action={<span className="hm-mono" style={{fontSize:12,color:"var(--on-surface-muted)",display:"flex",gap:14,fontFamily:"var(--font-sans)",fontWeight:500}}>
            <span><span className="status-dot is-succeeded" style={{marginRight:4}}></span>성공</span>
            <span><span className="status-dot is-failed" style={{marginRight:4}}></span>실패</span>
            <span><span className="status-dot is-awaiting" style={{marginRight:4}}></span>승인 대기</span>
          </span>}
        >
          <StackedBars buckets={D.FLOW} h={160}/>
        </HmCard>

        <HmCard title="실패 빈도 상위" meta="최근 24시간">
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {topFailing.map((a, i) => (
              <div key={a.id} style={{display:"flex", alignItems:"center", gap:12, cursor:"pointer"}}
                   onClick={() => onOpenApp(a.id)}>
                <span style={{fontFamily:"var(--font-mono)", fontSize:13, color:"var(--on-surface-muted)", width:18, fontWeight:600}}>{i + 1}</span>
                <span style={{fontFamily:"var(--font-sans)", fontWeight:700, fontSize:14, color:"var(--on-surface)", flex:1, letterSpacing:"-0.005em"}}>{a.name}</span>
                <span className="hm-mono" style={{fontSize:13, color:"var(--error-50)", fontWeight:700}}>{a.failed24h}건 실패</span>
                <span className="hm-mono" style={{fontSize:13, color:"var(--on-surface-muted)"}}>/ {a.runs24h}</span>
                {/* mini fail-rate bar */}
                <span style={{width:60, height:4, background:"var(--surface-container)", borderRadius:2, overflow:"hidden"}}>
                  <span style={{display:"block", height:"100%", width:`${(a.failed24h/a.runs24h*100).toFixed(0)}%`, background:"var(--error-50)"}}></span>
                </span>
              </div>
            ))}
          </div>
        </HmCard>
      </div>

      {/* Live runs */}
      <HmCard
        title="실시간 실행"
        meta="실시간 갱신"
        action={<a href="#" onClick={e => {e.preventDefault(); onNav("apps");}} style={{fontSize:13, color:"var(--primary-40)", textDecoration:"none", fontFamily:"var(--font-sans)", fontWeight:600}}>전체 보기 →</a>}
        flush
      >
        <table className="hm-table">
          <thead>
            <tr>
              <th style={{width:130}}>상태</th>
              <th>Application</th>
              <th style={{width:90}}>단계</th>
              <th style={{width:80}}>비용</th>
              <th style={{width:90}}>소요</th>
              <th style={{width:120}}>시작</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {liveRuns.length === 0 && (
              <tr><td colSpan={7} style={{padding:"24px"}}><Empty icon="activity" title="실행 중인 작업이 없어요" sub={`${ws.name} 워크스페이스에 활성 실행이 없습니다.`}/></td></tr>
            )}
            {liveRuns.map(r => (
              <tr key={r.id} onClick={() => onOpenRun(r.id)} className={r.id === "run_82c0f1a" ? "hm-row-arrival" : ""}>
                <td><StatusLabel status={r.status === "running" ? "running" : r.status === "awaiting" ? "awaiting" : r.status === "queued" ? "queued" : r.status}>
                  {r.status === "running" ? "실행 중" : r.status === "awaiting" ? "승인 대기" : r.status === "queued" ? "대기 중" : r.status}
                </StatusLabel></td>
                <td><span className="app-link">{r.app}</span></td>
                <td className="mono">{r.step != null ? `${r.step}/${r.max}` : "—"}</td>
                <td className="mono">{r.cost > 0 ? fmtMoney(r.cost) : "—"}</td>
                <td className="mono">{r.duration > 0 ? fmtDuration(r.duration) : "—"}</td>
                <td className="mono dim">{fmtTimeAgo(r.started)}</td>
                <td className="shrink"><Icon name="chevronRight" size={14} style={{color:"var(--on-surface-muted)"}}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </HmCard>

      {/* Cost burn */}
      <div style={{marginTop:12}}>
        <HmCard title="이번 달 비용" meta={`${fmtMoney(monthCost)} / ${fmtMoney(monthCap)}`}>
          <div style={{display:"flex", flexDirection:"column", gap:12}}>
            <div style={{height:8, background:"var(--surface-container)", borderRadius:2, overflow:"hidden", display:"flex"}}>
              {monthByApp.map((a, i) => (
                <span key={i} title={`${a.name} ${a.pct}%`} style={{width:`${a.pct * (monthCost/monthCap)}%`, height:"100%", background:a.color}}></span>
              ))}
            </div>
            <div style={{display:"flex", gap:18, flexWrap:"wrap"}}>
              {monthByApp.map((a, i) => (
                <div key={i} style={{display:"flex", alignItems:"center", gap:6, fontSize:12.5, fontFamily:"var(--font-sans)", fontWeight:500}}>
                  <span style={{width:8, height:8, background:a.color, borderRadius:2}}></span>
                  <span style={{color:"var(--on-surface)"}}>{a.name}</span>
                  <span style={{color:"var(--on-surface-muted)"}}>{a.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </HmCard>
      </div>
    </>
  );
}

export { HmDashboard };
