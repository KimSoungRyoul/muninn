"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { Tabs, Button, Toggle, Empty } from "@/components/ui";
import {
  fmtMoney,
  fmtTokens,
  fmtDuration,
  fmtTimeAgo,
  fmtClock,
  StatusDot,
  StatusLabel,
  Meter,
  JsonViewer,
  HmPageHead,
  HmCard,
  RavenMark,
  highlightJson,
} from "@/components/common";
import { HM_DATA } from "@/lib/data";

// Huginn & Muninn — Run detail (★ flagship) + Runs list

const { useState: useS_RD, useEffect: useE_RD, useMemo: useM_RD } = React;

function HmRunsList({ onOpenRun }: any) {
  const D = HM_DATA;
  const [filter, setFilter] = useS_RD("all");
  const filtered = filter === "all" ? D.RECENT_RUNS : D.RECENT_RUNS.filter(r => r.status === filter);

  return (
    <>
      <HmPageHead title="실행 내역" sub="모든 agent 실행 · 행을 클릭하면 상세 보기">
        <Tabs pill value="24h" onChange={() => {}} tabs={[
          {label:"1시간", value:"1h"},{label:"24시간", value:"24h"},{label:"7일", value:"7d"},{label:"전체", value:"all"}
        ]}/>
      </HmPageHead>

      <HmCard flush>
        <div className="hm-chipbar">
          {[
            {v: "all",        l: "전체",       n: D.RECENT_RUNS.length},
            {v: "running",    l: "실행 중"},
            {v: "awaiting",   l: "승인 대기"},
            {v: "succeeded",  l: "성공"},
            {v: "failed",     l: "실패"},
            {v: "cancelled",  l: "취소"},
          ].map(c => (
            <span key={c.v} className={`hm-chip ${filter === c.v ? "is-active" : ""}`} onClick={() => setFilter(c.v)}>
              {c.v !== "all" && <StatusDot status={c.v}/>}
              {c.l}
              {c.n != null && <span style={{color:"var(--on-surface-muted)"}}>{c.n}</span>}
            </span>
          ))}
          <span style={{flex:1}}></span>
          <Button size="sm" variant="ghost" leftIcon="filter">필터</Button>
          <Button size="sm" variant="ghost" leftIcon="download">내보내기</Button>
        </div>
        <table className="hm-table">
          <thead>
            <tr>
              <th style={{width:140}}>상태</th>
              <th>Application</th>
              <th style={{width:120}}>시작</th>
              <th style={{width:100}}>소요</th>
              <th style={{width:80}}>단계</th>
              <th style={{width:80}}>비용</th>
              <th>결과</th>
              <th style={{width:24}}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} onClick={() => onOpenRun(r.id)}>
                <td><StatusLabel status={r.status === "awaiting" ? "awaiting" : r.status}>{r.status === "running" ? "실행 중" : r.status === "awaiting" ? "승인 대기" : r.status === "succeeded" ? "성공" : r.status === "failed" ? "실패" : r.status === "cancelled" ? "취소" : r.status}</StatusLabel></td>
                <td>
                  <div style={{display:"flex", flexDirection:"column", gap:1}}>
                    <span className="app-link">{r.app}</span>
                    <span className="hm-mono dim" style={{fontSize:10}}>{r.id}</span>
                  </div>
                </td>
                <td className="mono dim">{fmtClock(r.started)}</td>
                <td className="mono">{r.duration > 0 ? fmtDuration(r.duration) : "—"}</td>
                <td className="mono">{r.step ? `${r.step}/${r.max}` : "—"}</td>
                <td className="mono" style={r.cost > 1.0 ? {color:"var(--warning-55)"} : null}>{r.cost > 0 ? fmtMoney(r.cost) : "—"}</td>
                <td className="mono dim">{r.output || "—"}</td>
                <td><Icon name="chevronRight" size={14} style={{color:"var(--on-surface-muted)"}}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </HmCard>
    </>
  );
}

// ===== Run Detail — flagship =====
function HmRunDetail({ runId, onBack, awaitingMode }: any) {
  const R = HM_DATA.RUN_DETAIL;
  const [selectedStep, setSelectedStep] = useS_RD(4);
  const [follow, setFollow] = useS_RD(true);
  const [arrivedIx, setArrivedIx] = useS_RD(null);

  // mock SSE arrival pulse on the active step
  useE_RD(() => {
    const activeStep = R.steps.find(s => s.active || s.kind === "tool-pending");
    if (!activeStep) return;
    setArrivedIx(activeStep.ix);
    const t = setTimeout(() => setArrivedIx(null), 1200);
    return () => clearTimeout(t);
  }, []);

  // 전체 트랜스크립트(steps/memories/tools)는 데모 데이터상 RUN_DETAIL(run_82c0f1a) 에만 있다.
  // 그 외 runId 로 진입하면 LIVE_RUNS/RECENT_RUNS 에서 해당 run 을 찾아 요약 뷰를 보여준다.
  const hasFullDetail = !runId || runId === R.id;
  if (!hasFullDetail) {
    const summary = [...HM_DATA.LIVE_RUNS, ...HM_DATA.RECENT_RUNS].find(r => r.id === runId);
    return <RunSummaryDetail runId={runId} run={summary} onBack={onBack} fullRunId={R.id}/>;
  }

  // Allow page to enter awaiting state via prop
  const status = awaitingMode ? "awaiting" : R.status;

  return (
    <>
      {/* Header */}
      <div style={{display:"flex", alignItems:"flex-start", gap:14, marginBottom:14}}>
        <button className="btn btn-icon btn-sm" onClick={onBack}><Icon name="chevronLeft" size={14}/></button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <RavenMark which="huginn" size={18}/>
            <h1 style={{margin:0, fontFamily:"var(--font-sans)", fontSize:24, fontWeight:800, letterSpacing:"-0.025em"}}>{R.id}</h1>
            <StatusLabel status={status === "awaiting" ? "awaiting" : status}>
              <span style={{fontFamily:"var(--font-sans)", fontSize:13, fontWeight:600}}>{status === "running" ? "실행 중" : status === "awaiting" ? "승인 대기" : status === "succeeded" ? "성공" : status === "failed" ? "실패" : status}</span>
            </StatusLabel>
          </div>
          <div style={{fontSize:13, color:"var(--on-surface-muted)", marginTop:6, fontFamily:"var(--font-sans)"}}>
            <a href="#" style={{color:"var(--primary-50)", textDecoration:"none"}}>{R.app}</a>
            <span style={{margin:"0 6px"}}>·</span>
            <span>{R.appKind}</span>
            <span style={{margin:"0 6px"}}>·</span>
            <span style={{color:"var(--on-surface-variant)"}}>{R.event.source}/{R.event.summary}</span>
            <span style={{margin:"0 6px"}}>·</span>
            <span>시작 {fmtClock(R.started)} · {fmtTimeAgo(R.started)}</span>
          </div>
        </div>
        <div style={{display:"flex", gap:6}}>
          {status === "running" && <>
            <Button size="sm" variant="gray" leftIcon="clock">일시정지</Button>
            <Button size="sm" variant="danger" leftIcon="close">중단</Button>
          </>}
          {status === "succeeded" && <Button size="sm" variant="secondary" leftIcon="refresh">다시 재생</Button>}
        </div>
      </div>

      {/* Approval panel (only when awaiting) */}
      {status === "awaiting" && <ApprovalPanel runId={R.id}/>}

      {/* Top stats row */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14}}>
        <HmCard>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <RavenMark which="huginn" size={20}/>
            <Meter label="단계" current={R.step} cap={R.maxStep} format={v => v} />
          </div>
        </HmCard>
        <HmCard><Meter label="비용" current={R.cost} cap={R.maxCost} format={fmtMoney}/></HmCard>
        <HmCard><Meter label="토큰" current={R.tokens / 1000} cap={R.maxTokens / 1000} format={v => v.toFixed(1)} unit="k"/></HmCard>
        <HmCard>
          <div style={{display:"flex", flexDirection:"column", gap:6}}>
            <span style={{fontFamily:"var(--font-sans)", fontSize:11.5, color:"var(--on-surface-muted)", fontWeight:600}}>소요 시간</span>
            <span style={{fontFamily:"var(--font-sans)", fontSize:26, fontWeight:800, color:"var(--on-surface)", letterSpacing:"-0.02em"}}>{fmtDuration(Math.max(0, (HM_DATA.NOW.getTime() - new Date(R.started).getTime()) / 1000))}</span>
          </div>
        </HmCard>
      </div>

      {/* Split: timeline + transcript */}
      <div className="hm-split">
        {/* LEFT — timeline rail */}
        <div style={{display:"flex", flexDirection:"column", gap:18, position:"sticky", top:0}}>
          <HmCard title="Timeline" meta={`${R.step}/${R.maxStep} 단계`}>
            <div className="hm-timeline">
              {R.steps.map(s => {
                const isActive = s.active || s.kind === "tool-pending";
                const isDone = !isActive && s.finishedAt;
                const isPending = !isActive && !isDone;
                const cls = [
                  "hm-tl-step",
                  isActive && "is-active",
                  isDone && "is-done",
                  isPending && "is-pending",
                  selectedStep === s.ix && "is-selected",
                ].filter(Boolean).join(" ");
                const label = s.kind === "thought" ? "assistant" : s.tool ? `${s.tool.ns}.${s.tool.fn}` : "—";
                const sub = s.kind === "thought" ? "thinking" : s.tool?.result ? Object.entries(s.tool.result)[0]?.join(": ") : s.tool?.status === undefined ? "pending" : "queued";
                return (
                  <div key={s.ix} className={cls} onClick={() => setSelectedStep(s.ix)}>
                    <span className="hm-tl-dot"></span>
                    <div className="hm-tl-name">단계 {s.ix} · <span style={{fontFamily:"var(--font-mono)", fontSize:11}}>{label}</span></div>
                    <div className="hm-tl-detail">{sub}</div>
                  </div>
                );
              })}
              {/* Pending future steps */}
              {Array.from({length: R.maxStep - R.steps.length}).map((_, i) => (
                <div key={i + 100} className="hm-tl-step is-pending">
                  <span className="hm-tl-dot"></span>
                  <div className="hm-tl-name" style={{color:"var(--on-surface-disabled)"}}>단계 {R.steps.length + 1 + i}</div>
                </div>
              ))}
            </div>
          </HmCard>

          <HmCard title="Recall된 Memories" meta={`${R.recalledMemories.length}개 · Muninn`}>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {R.recalledMemories.map(m => (
                <div key={m.id} style={{display:"flex", flexDirection:"column", gap:3, padding:"6px 0", borderTop:"1px solid var(--border-subtle)"}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <RavenMark which="muninn" size={10}/>
                    <span className="hm-mono" style={{fontSize:11, color: m.score > 0.85 ? "var(--muninn-700)" : "var(--muninn-500)", fontWeight: m.score > 0.85 ? 600 : 400}}>{m.score.toFixed(2)}</span>
                  </div>
                  <span style={{fontFamily:"var(--font-sans)", fontSize:13, lineHeight:1.55, color:"var(--on-surface)", fontWeight:500}}>{m.fact}</span>
                </div>
              ))}
            </div>
          </HmCard>

          <HmCard title="사용한 도구">
            <div className="hm-toollist">
              {R.toolsUsed.map(t => (
                <div key={t.ns} className="row">
                  <span className="n">{t.ns}</span>
                  <span className="c">{t.count}</span>
                </div>
              ))}
            </div>
          </HmCard>
        </div>

        {/* RIGHT — transcript */}
        <div>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:10}}>
            <span style={{fontFamily:"var(--font-sans)", fontSize:12, color:"var(--on-surface-muted)", fontWeight:600}}>Transcript · agent 사고 + 도구 호출</span>
            <span style={{flex:1}}></span>
            <label style={{display:"flex", alignItems:"center", gap:6, fontSize:13, color:"var(--on-surface-variant)", fontFamily:"var(--font-sans)", fontWeight:500}}>
              <Toggle checked={follow} onChange={setFollow}/>
              자동 추적
            </label>
            <span style={{fontFamily:"var(--font-mono)", fontSize:11.5, color:"var(--on-surface-muted)"}}>[f]</span>
          </div>

          {R.steps.map((s, i) => <StepCard key={s.ix} step={s} arrived={arrivedIx === s.ix}/>)}

          {/* Live SSE feed marker */}
          <div style={{display:"flex", alignItems:"center", gap:8, padding:"12px 16px", fontFamily:"var(--font-sans)", fontSize:13, color:"var(--primary-40)", border:"1px dashed var(--primary-50)", borderRadius:8, background:"var(--primary-95)", fontWeight:500}}>
            <span className="spinner" style={{width:10, height:10, borderWidth:1.5, borderTopColor:"var(--huginn-500)"}}></span>
            <span>실시간 스트림 · 최신 단계로 자동 스크롤</span>
          </div>
        </div>
      </div>
    </>
  );
}

// 작은 통계 셀 (요약 run 상세에서 사용)
function StatCell({ label, value }: any) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:6}}>
      <span style={{fontFamily:"var(--font-sans)", fontSize:11.5, color:"var(--on-surface-muted)", fontWeight:600}}>{label}</span>
      <span style={{fontFamily:"var(--font-sans)", fontSize:20, fontWeight:800, color:"var(--on-surface)", letterSpacing:"-0.02em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{value}</span>
    </div>
  );
}

// RUN_DETAIL(전체 트랜스크립트) 이외의 run 을 위한 요약 상세 뷰.
// run 을 찾지 못하면 Not Found 상태를 보여준다.
function RunSummaryDetail({ runId, run, onBack, fullRunId }: any) {
  if (!run) {
    return (
      <div style={{padding:"40px 0"}}>
        <button className="btn btn-icon btn-sm" onClick={onBack} style={{marginBottom:16}}><Icon name="chevronLeft" size={14}/></button>
        <Empty icon="search" title="실행을 찾을 수 없습니다" sub={`${runId} 에 해당하는 실행이 없습니다.`}
          action={<Button size="sm" variant="secondary" onClick={onBack}>목록으로</Button>}/>
      </div>
    );
  }
  const kLabel = (s) => s === "running" ? "실행 중" : s === "awaiting" ? "승인 대기" : s === "succeeded" ? "성공" : s === "failed" ? "실패" : s === "queued" ? "대기 중" : s === "cancelled" ? "취소" : s;
  return (
    <>
      {/* Header */}
      <div style={{display:"flex", alignItems:"flex-start", gap:14, marginBottom:14}}>
        <button className="btn btn-icon btn-sm" onClick={onBack}><Icon name="chevronLeft" size={14}/></button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <RavenMark which="huginn" size={18}/>
            <h1 style={{margin:0, fontFamily:"var(--font-sans)", fontSize:24, fontWeight:800, letterSpacing:"-0.025em"}}>{run.id}</h1>
            <StatusLabel status={run.status}>
              <span style={{fontFamily:"var(--font-sans)", fontSize:13, fontWeight:600}}>{kLabel(run.status)}</span>
            </StatusLabel>
          </div>
          <div style={{fontSize:13, color:"var(--on-surface-muted)", marginTop:6, fontFamily:"var(--font-sans)"}}>
            <a href="#" style={{color:"var(--primary-50)", textDecoration:"none"}}>{run.app}</a>
            <span style={{margin:"0 6px"}}>·</span>
            <span>시작 {fmtClock(run.started)} · {fmtTimeAgo(run.started)}</span>
          </div>
        </div>
        <div style={{display:"flex", gap:6}}>
          {run.status === "running" && <>
            <Button size="sm" variant="gray" leftIcon="clock">일시정지</Button>
            <Button size="sm" variant="danger" leftIcon="close">중단</Button>
          </>}
          {run.status === "succeeded" && <Button size="sm" variant="secondary" leftIcon="refresh">다시 재생</Button>}
        </div>
      </div>

      {/* Approval panel (only when awaiting) */}
      {run.status === "awaiting" && <ApprovalPanel runId={run.id}/>}

      {/* Top stats row */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14}}>
        <HmCard>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <RavenMark which="huginn" size={20}/>
            <Meter label="단계" current={run.step ?? 0} cap={run.max} format={v => v}/>
          </div>
        </HmCard>
        <HmCard><StatCell label="비용" value={run.cost > 0 ? fmtMoney(run.cost) : "—"}/></HmCard>
        <HmCard><StatCell label="소요 시간" value={run.duration > 0 ? fmtDuration(run.duration) : "—"}/></HmCard>
        <HmCard><StatCell label="결과" value={run.output || "—"}/></HmCard>
      </div>

      {/* 전체 트랜스크립트는 데모 flagship run 에만 존재 */}
      <HmCard>
        <Empty icon="activity" title="상세 트랜스크립트가 없는 실행입니다"
          sub={`타임라인 · recall된 기억 · 도구 호출 트랜스크립트는 데모 데이터에서 ${fullRunId} 실행에만 포함되어 있습니다.`}
          action={<a href={`/runs/${fullRunId}`} style={{fontSize:13, color:"var(--primary-40)", textDecoration:"none", fontFamily:"var(--font-sans)", fontWeight:600}}>전체 트랜스크립트 예시 보기 →</a>}/>
      </HmCard>
    </>
  );
}

function StepCard({ step: s, arrived }: any) {
  const cls = `hm-step ${arrived ? "is-just-arrived" : ""}`;
  if (s.kind === "thought") {
    return (
      <div className={cls}>
        <div className="hm-step-head">
          <span className="ix">{String(s.ix).padStart(2, "0")}</span>
          <span className="kind is-thought">assistant · 사고</span>
          {s.tokens_in && <span style={{color:"var(--on-surface-muted)"}}>토큰 <span style={{color:"var(--on-surface-variant)"}}>{fmtTokens(s.tokens_in)}</span> in / <span style={{color:"var(--on-surface-variant)"}}>{fmtTokens(s.tokens_out)}</span> out</span>}
          <span className="when">{s.active ? "지금" : fmtClock(s.finishedAt)}</span>
        </div>
        <div className="hm-thought">{s.text}</div>
        {s.active && <div style={{marginTop:10, fontFamily:"var(--font-sans)", fontSize:12, color:"var(--primary-40)", fontWeight:500}}>
          <span className="spinner" style={{width:8, height:8, borderWidth:1, borderTopColor:"var(--primary-50)", marginRight:6, verticalAlign:"middle"}}></span>
          생성 중...
        </div>}
      </div>
    );
  }
  if (s.kind === "tool" || s.kind === "tool-pending") {
    const isPending = s.kind === "tool-pending";
    const isErr = s.tool?.status === "error";
    return (
      <div className={cls}>
        <div className="hm-step-head">
          <span className="ix">{String(s.ix).padStart(2, "0")}</span>
          <span className={`kind ${isErr ? "is-error" : "is-tool"}`}>도구 · {isPending ? "실행 중" : "결과"}</span>
          <span className="when">{isPending ? "실행 중..." : fmtClock(s.finishedAt)}</span>
        </div>
        <div className="hm-tool">
          <div className="hm-tool-head">
            <Icon name={s.tool.ns === "github" ? "code" : s.tool.ns === "muninn" ? "database" : "zap"} size={12} style={{color:"var(--muninn-700)"}}/>
            <span className="ns">{s.tool.ns}</span>
            <span className="sep">.</span>
            <span className="fn">{s.tool.fn}</span>
            <span className={`status ${isPending ? "run" : isErr ? "err" : "ok"}`}>
              {isPending ? <><span className="spinner" style={{width:8, height:8, borderWidth:1, borderTopColor:"currentColor", marginRight:4, verticalAlign:"middle"}}></span> 실행 중 · 2s</> : isErr ? "오류" : "성공"}
            </span>
          </div>
          <div className="hm-tool-body" dangerouslySetInnerHTML={{__html: highlightJson(s.tool.args)}}/>
          {!isPending && s.tool.result && (
            <div style={{borderTop:"1px solid var(--border-subtle)"}}>
              <JsonViewer data={s.tool.result} collapsed={false}/>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function ApprovalPanel({ runId }: any) {
  return (
    <div className="hm-approval">
      <div className="hm-approval-head">
        <Icon name="shield" size={16} style={{color:"var(--warning-55)"}}/>
        <span className="ttl">승인이 필요합니다</span>
        <span className="expires">87분 후 만료</span>
      </div>
      <div className="hm-approval-reasons">
        <div className="r"><span className="glyph">▲</span> dependency 변경 감지 (requirements.txt, +2 / -0)</div>
        <div className="r"><span className="glyph">▲</span> 큰 변경 (+180줄 / -22줄)</div>
      </div>

      <div style={{fontFamily:"var(--font-sans)", fontSize:12, color:"var(--on-surface-muted)", fontWeight:600, marginBottom:6}}>제안된 PR</div>
      <div style={{fontFamily:"var(--font-sans)", fontSize:16, fontWeight:700, color:"var(--on-surface)", marginBottom:4}}>fix(triton): raise memory limit and lock numpy 1.26.4</div>
      <div style={{fontFamily:"var(--font-mono)", fontSize:12.5, color:"var(--on-surface-muted)", marginBottom:12}}>branch: huginn/{runId}</div>
      <div className="hm-diff" dangerouslySetInnerHTML={{__html:
`<span class="ctx">spec:</span>
<span class="ctx">  resources:</span>
<span class="ctx">    limits:</span>
<span class="rem">      memory: 1Gi</span>
<span class="add">      memory: 4Gi</span>
<span class="ctx">requirements.txt:</span>
<span class="add">numpy==1.26.4</span>
<span class="add">pyarrow==15.0.2</span>`
      }}>
      </div>
      <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
        <Button variant="ghost" leftIcon="close">거절 (실행 중단)</Button>
        <Button variant="primary" leftIcon="check">승인하고 PR 생성</Button>
      </div>
    </div>
  );
}

export { HmRunsList, HmRunDetail };
