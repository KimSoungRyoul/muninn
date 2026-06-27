"use client";
import React from "react";
// Huginn & Muninn — Apps list, App detail (with Events→Runs), Platform Tools, Memories, Settings
import { Icon } from "@/components/icons";
import { Button, IconButton, TextInput, Textarea, Select, Toggle, Badge, Tabs, Empty, SkeletonRows } from "@/components/ui";
import { fmtMoney, fmtDuration, fmtTimeAgo, fmtClock, StatusDot, StatusLabel, HmPageHead, HmKpi, HmCard, runStatusLabel, appInitials } from "@/components/common";
import { MarkdownView, MarkdownEditor } from "@/components/markdown";
import { useApi } from "@/lib/use-api";
import { useWorkspace } from "@/lib/workspace-context";
import { defaultAgentConfig, defaultCredentials } from "@/lib/agent-config";

const { useState: useS_HP, useEffect: useE_HP } = React;

// ===================================================================
// /apps — list
// ===================================================================
function HmAppsList({ onOpenApp, onNewApp, workspaceId }: any) {
  const { workspace } = useWorkspace();
  const ws = workspace;
  const { data: apps = [], loading } = useApi<any[]>(`/api/apps?workspace=${encodeURIComponent(workspaceId)}`);
  const firstLoad = loading && apps.length === 0;
  return (
    <>
      <HmPageHead title="Applications" sub={`${ws.name} 워크스페이스 · 등록된 ${apps.length}개 · 1개 DAG = 1개 Application`}>
        <Button size="sm" variant="ghost" leftIcon="search">필터</Button>
        <Button size="sm" variant="primary" leftIcon="plus" onClick={onNewApp}>새 Application 등록</Button>
      </HmPageHead>

      <HmCard flush>
        {firstLoad && <span className="sr-only" role="status">Applications 불러오는 중…</span>}
        <div className="hm-table-scroll" tabIndex={0} aria-busy={firstLoad}>
        <table className="hm-table">
          <thead>
            <tr>
              <th>이름</th>
              <th style={{width:110}}>종류</th>
              <th style={{width:120}}>결과 형식</th>
              <th>Platform tools</th>
              <th style={{width:130}}>24시간 실행</th>
              <th style={{width:130}}>마지막 실행</th>
              <th style={{width:24}}></th>
            </tr>
          </thead>
          {firstLoad ? <SkeletonRows rows={5} cols={7}/> : (
          <tbody>
            {apps.length === 0 && (
              <tr><td colSpan={7}><Empty icon="layers" title="이 Workspace 에 등록된 Application 이 없어요" sub="첫 Application 을 등록해보세요." action={<Button variant="primary" leftIcon="plus" onClick={onNewApp}>Application 등록</Button>}/></td></tr>
            )}
            {apps.map(a => (
              <tr key={a.id} onClick={() => onOpenApp(a.id)}>
                <td>
                  <div style={{display:"flex", alignItems:"center", gap:10}}>
                    <span style={{width:30,height:30,borderRadius:8,background:"var(--primary-95)",color:"var(--primary-40)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,letterSpacing:"-0.02em"}}>
                      {appInitials(a.name)}
                    </span>
                    <div style={{display:"flex", flexDirection:"column", gap:2}}>
                      <span className="app-link">{a.name}</span>
                      <span className="hm-mono dim" style={{fontSize:11.5}}>{a.repo}</span>
                    </div>
                  </div>
                </td>
                <td><Badge tone="default">{a.kind}</Badge></td>
                <td>
                  <span style={{fontSize:12.5, fontWeight:600, color: a.output === "pull_request" ? "var(--primary-40)" : "var(--muninn-700)"}}>
                    {a.output === "pull_request" ? "Pull Request" : "GitHub Issue"}
                  </span>
                </td>
                <td>
                  <span style={{display:"inline-flex", gap:4, flexWrap:"wrap"}}>
                    {["github", a.kind === "airflow" ? "airflow" : "argocd", "loki", "tempo"].map(t => (
                      <span key={t} style={{fontSize:11.5, padding:"3px 8px", background:"var(--surface-container)", borderRadius:4, color:"var(--on-surface-variant)", fontWeight:500}}>{t}</span>
                    ))}
                  </span>
                </td>
                <td className="mono">
                  <span style={{fontSize:14, fontWeight:600}}>{a.runs24h}</span>
                  {a.failed24h > 0 && <span style={{color:"var(--error-50)", marginLeft:8, fontWeight:600}}>{a.failed24h} fail</span>}
                  {a.runs24h > 0 && a.failed24h === 0 && <span style={{color:"var(--positive-50)", marginLeft:8, fontWeight:600}}>ok</span>}
                </td>
                <td className="mono dim">{a.lastRun ? fmtTimeAgo(a.lastRun) : "—"}</td>
                <td><Icon name="chevronRight" size={16} style={{color:"var(--on-surface-muted)"}}/></td>
              </tr>
            ))}
          </tbody>
          )}
        </table>
        </div>
      </HmCard>
    </>
  );
}

// ===================================================================
// /apps/[id] — detail (Overview / Events / Bindings)
// ===================================================================
function HmAppDetail({ appId, onBack, onOpenRun, initialTab }: any) {
  const [tab, setTab] = useS_HP(initialTab || "overview");
  // mock 직접 참조 대신 API 로 조회(미연결 시 라우트가 mock fallback).
  const { data: a, loading } = useApi<any>(`/api/apps/${encodeURIComponent(appId)}`);
  const { data: events = [] } = useApi<any[]>(`/api/apps/${encodeURIComponent(appId)}/events`);
  const { data: mems } = useApi<any>(`/api/apps/${encodeURIComponent(appId)}/memories`);
  const { data: allRuns = [] } = useApi<any[]>(`/api/runs`);

  const appEvents = events ?? [];
  const appRuns = a?.runs ?? [];
  const memCount = (mems?.app?.length ?? 0);

  if (loading || !a) {
    return (
      <div style={{ padding: "40px 0" }}>
        <button className="btn btn-icon btn-sm" onClick={onBack} style={{ marginBottom: 16 }}><Icon name="chevronLeft" size={16}/></button>
        <Empty icon="layers" title="불러오는 중…" sub="Application 정보를 조회하고 있어요."/>
      </div>
    );
  }

  return (
    <>
      <div style={{display:"flex", alignItems:"flex-start", gap:14, marginBottom:18}}>
        <button className="btn btn-icon btn-sm" onClick={onBack}><Icon name="chevronLeft" size={16}/></button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", alignItems:"center", gap:12}}>
            <span style={{width:36,height:36,borderRadius:10,background:"var(--primary-95)",color:"var(--primary-40)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,letterSpacing:"-0.02em"}}>
              {appInitials(a.name)}
            </span>
            <h1 style={{margin:0, fontFamily:"var(--font-sans)", fontSize:24, fontWeight:800, letterSpacing:"-0.025em"}}>{a.name}</h1>
            <Badge tone="default">{a.kind}</Badge>
          </div>
          <div style={{fontSize:13, color:"var(--on-surface-muted)", marginTop:6, fontFamily:"var(--font-sans)"}}>
            결과 형식: <b style={{color:"var(--on-surface)", fontWeight:600}}>{a.output === "pull_request" ? "Pull Request" : "GitHub Issue"}</b> · <a href="#" style={{color:"var(--primary-40)", textDecoration:"none", fontWeight:500}}>{a.repo} ↗</a>
          </div>
        </div>
        <div style={{display:"flex", gap:6}}>
          <Button size="sm" variant="ghost" leftIcon="edit" onClick={() => setTab("settings")}>편집</Button>
          <Button size="sm" variant="ghost">비활성</Button>
          <Button size="sm" variant="ghost" leftIcon="trash" style={{color:"var(--error-50)"}}>삭제</Button>
        </div>
      </div>

      <div style={{marginBottom:18}}>
        <Tabs value={tab} onChange={setTab} tabs={[
          {label:"개요", value:"overview"},
          {label:"Events", value:"events", count: appEvents.length},
          {label:"Memories", value:"memories", count: memCount},
          {label:"Platform tools", value:"bindings"},
          {label:"설정", value:"settings"},
        ]}/>
      </div>

      {tab === "overview" && <OverviewTab a={a} appEvents={appEvents} appRuns={appRuns} onOpenRun={onOpenRun} setTab={setTab}/>}
      {tab === "events"   && <EventsTab a={a} events={appEvents} allRuns={allRuns} onOpenRun={onOpenRun}/>}
      {tab === "memories" && <AppMemoriesTab app={a} mems={mems}/>}
      {tab === "bindings" && <BindingsTab app={a}/>}
      {tab === "settings" && <AgentSettingsTab app={a}/>}
    </>
  );
}

// ===================================================================
// /apps/[id] · 설정 — HuginnAgent 런타임 + 자격(Secrets) 조회/수정
// ===================================================================
function CredKindIcon(kind) {
  return kind === "kubeconfig" ? "layers" : kind === "pat" ? "gitBranch" : "lock";
}

function AgentSettingsTab({ app }) {
  // baseline 을 state 로 보관 → 저장 성공 시 끌어올려 dirty 해제(mock PATCH 비영속이라 app.agent 는 불변).
  const [baseCfg, setBaseCfg] = useS_HP(() => ({ ...defaultAgentConfig(app) }));
  const [cfg, setCfg] = useS_HP(() => ({ ...defaultAgentConfig(app) }));
  const [creds, setCreds] = useS_HP(() => defaultCredentials(app).map(c => ({ ...c, draft: "", cleared: false })));
  const [saving, setSaving] = useS_HP(false);
  const [saved, setSaved] = useS_HP(null);

  const setCfgK = (k, v) => { setSaved(null); setCfg(c => ({ ...c, [k]: v })); };
  const setDraft = (key, v) => { setSaved(null); setCreds(cs => cs.map(c => c.key === key ? { ...c, draft: v, cleared: false } : c)); };
  const clearCred = (key) => { setSaved(null); setCreds(cs => cs.map(c => c.key === key ? { ...c, draft: "", cleared: true } : c)); };
  const undoClear = (key) => { setSaved(null); setCreds(cs => cs.map(c => c.key === key ? { ...c, cleared: false } : c)); };

  const onKubeFile = (key) => (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setDraft(key, String(r.result || ""));
    r.onerror = () => setSaved({ tone: "error", msg: `파일 읽기 실패: ${f.name}` });
    r.readAsText(f);
    e.target.value = "";
  };

  const dirtyCreds = creds.filter(c => (c.draft && c.draft.trim() !== "") || c.cleared);
  const cfgChanged = JSON.stringify(cfg) !== JSON.stringify(baseCfg);
  const changed = cfgChanged || dirtyCreds.length > 0;

  async function onSave() {
    setSaving(true); setSaved(null);
    const payload = {
      agent: { image: cfg.image, runtime: cfg.runtime, soulRef: cfg.soulRef, argocdServer: cfg.argocdServer },
      credentials: dirtyCreds.map(c => ({
        key: c.key,
        action: (c.draft && c.draft.trim() !== "") ? "set" : "clear",
        // 값(value)은 전송 후 즉시 폐기되며 어디에도 저장하지 않는다.
        value: (c.draft && c.draft.trim() !== "") ? c.draft : undefined,
      })),
    };
    try {
      const res = await fetch(`/api/apps/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const now = new Date().toISOString();
      setCreds(cs => cs.map(c => {
        if (c.draft && c.draft.trim() !== "") return { ...c, set: true, updatedAt: now, draft: "", cleared: false };
        if (c.cleared) return { ...c, set: false, updatedAt: null, draft: "", cleared: false };
        return c;
      }));
      setBaseCfg({ ...cfg }); // baseline 갱신 → cfg dirty 해제
      setSaved({ tone: "success", msg: `저장됨 · 시크릿 값은 Secret 에만 보관됩니다(여기엔 노출 안 됨).` });
    } catch (e) {
      setSaved({ tone: "error", msg: `저장 실패: ${e.message}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1) 에이전트 런타임 */}
      <HmCard title="에이전트 런타임" meta="HuginnRun(Job/Pod)이 claude run 으로 SDK 를 실행할 때 사용">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 2px" }}>
          <TextInput label="런타임 이미지 (spec.agent.image)" className="input mono"
            value={cfg.image} onChange={e => setCfgK("image", e.target.value)}
            hint="GitHub Packages: ghcr.io/kimsoungryoul/muninn/agent-runtime:<tag>" />
          <div className="hm-grid-2">
            <Select label="런타임" value={cfg.runtime} onChange={e => setCfgK("runtime", e.target.value)}
              options={[{ value: "claude-code", label: "claude-code" }]} />
            <TextInput label="SOUL.md ConfigMap (soulRef)" value={cfg.soulRef || ""}
              onChange={e => setCfgK("soulRef", e.target.value)} hint="에이전트 정체성 프롬프트" />
          </div>
          <TextInput label="ArgoCD Server (ARGOCD_SERVER)" className="input mono" value={cfg.argocdServer || ""}
            onChange={e => setCfgK("argocdServer", e.target.value)} hint="비밀 아님 · argocd CLI 접속 주소(비우면 미사용)" />
        </div>
      </HmCard>

      {/* 2) 자격(Secrets) */}
      <HmCard title="자격 (Secrets)" meta="K8s Secret(env)으로만 주입(§5.1, §6.2) · write-only — 값은 저장 후 표시되지 않음">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {creds.map((c, i) => {
            const isKube = c.kind === "kubeconfig";
            const willSet = c.draft && c.draft.trim() !== "";
            const secretRef = c.secretName ? `${c.secretName}/${c.key}` : c.key;
            return (
              <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 2px", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Icon name={CredKindIcon(c.kind)} size={16} style={{ color: "var(--on-surface-muted)" }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{c.label}</span>
                  <span className="hm-mono dim" style={{ fontSize: 11 }} title="Secret/key">{secretRef}</span>
                  {c.required && <Badge tone="default">필수</Badge>}
                  {c.cleared
                    ? <Badge tone="error" dot>삭제 예정</Badge>
                    : willSet
                      ? <Badge tone="primary" dot>{c.set ? "교체 예정" : "등록 예정"}</Badge>
                      : c.set
                        ? <Badge tone="success" dot>등록됨{c.updatedAt ? ` · ${fmtTimeAgo(c.updatedAt)}` : ""}</Badge>
                        : <Badge tone="warning" dot>미등록</Badge>}
                  <span style={{ flex: 1 }} />
                  {c.set && !c.cleared && !c.required && (
                    <Button size="sm" variant="ghost" style={{ color: "var(--error-50)" }} onClick={() => clearCred(c.key)}>삭제</Button>
                  )}
                  {c.cleared && (
                    <Button size="sm" variant="ghost" onClick={() => undoClear(c.key)}>되돌리기</Button>
                  )}
                </div>
                {c.hint && <span style={{ fontSize: 11.5, color: "var(--on-surface-muted)" }}>{c.hint}</span>}
                {!c.cleared && (isKube ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Textarea value={c.draft} onChange={e => setDraft(c.key, e.target.value)}
                      aria-label={`${c.label} 입력`}
                      placeholder={c.set ? "등록됨 — 교체하려면 새 kubeconfig 를 붙여넣거나 파일을 업로드하세요" : "kubeconfig YAML 붙여넣기"}
                      style={{ minHeight: 96, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                    <label className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
                      <Icon name="upload" size={14} /> 파일 선택
                      <input type="file" accept=".yaml,.yml,.conf,.config,text/*" style={{ display: "none" }} onChange={onKubeFile(c.key)} />
                    </label>
                  </div>
                ) : (
                  <input className="input mono" type="password" autoComplete="off" value={c.draft}
                    aria-label={`${c.label} 값 입력`}
                    onChange={e => setDraft(c.key, e.target.value)}
                    placeholder={c.set ? "•••••••• — 교체하려면 새 값 입력" : "값 입력"} />
                ))}
              </div>
            );
          })}
        </div>
      </HmCard>

      {/* 저장 바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button variant="primary" leftIcon="check" disabled={!changed || saving} onClick={onSave}>
          {saving ? "저장 중…" : "변경사항 저장"}
        </Button>
        {changed && <span style={{ fontSize: 12, color: "var(--on-surface-muted)" }}>{dirtyCreds.length + (cfgChanged ? 1 : 0)}개 변경됨</span>}
        {saved && (
          <span style={{ fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, color: saved.tone === "error" ? "var(--error-50)" : "var(--positive-50)" }}>
            <Icon name={saved.tone === "error" ? "xCircle" : "checkCircle"} size={15} /> {saved.msg}
          </span>
        )}
      </div>
    </div>
  );
}

function defaultSoulMd(a) {
  return [
    `# ${a.name} · Huginn agent identity`,
    "",
    `당신은 \`${a.name}\` (${a.kind}) 의 **Huginn agent** 입니다. 들어온 alert 를 조사하고, Muninn 에서 유사한 과거 사건을 recall 한 뒤, observability 도구로 가설을 검증하고, 결과를 PR 또는 Issue 로 정리하여 등록합니다.`,
    "",
    "## 운영 정책 (DevOps policy)",
    "",
    "- replicas autoscaling 자동 조정 OK (HPA `min=2, max=10`)",
    "- 배포는 반드시 승인 후 진행",
    "- DB schema 변경 PR 은 항상 reject",
    "- 신규 dependency 추가는 승인 필수",
    "",
    "## 조사 우선순위",
    "",
    "1. 최근 24시간 동일 fingerprint 의 Memory recall",
    "2. Loki 에서 해당 namespace 로그 수집",
    "3. Mimir 에서 CPU/Memory/QPS 패턴 도출",
    "4. 가설 검증 후 PR/Issue 초안 작성",
    "",
    "> 승인이 필요한 액션은 반드시 `awaiting_approval` 로 멈춤 상태로 널긴다.",
  ].join("\n");
}

function OverviewTab({ a, appEvents, appRuns, onOpenRun, setTab }: any) {
  const [soul, setSoul] = useS_HP(() => defaultSoulMd(a));
  const [editing, setEditing] = useS_HP(false);
  // 성공률: 하드코딩 대신 앱의 24시간 run/실패 수에서 계산
  const successRate = a.runs24h > 0 ? (((a.runs24h - a.failed24h) / a.runs24h) * 100).toFixed(1) : "0";
  return (
    <>
      <div className="hm-kpi-grid">
        <HmKpi label="24시간 Events" value={`${appEvents.length}`} hint="webhook 수신"/>
        <HmKpi label="7일 실행"      value={`${a.runs24h * 7}`} delta={4} dir="up"/>
        <HmKpi label="성공률"        value={successRate} unit="%" delta={2.1} dir="up"/>
        <HmKpi label="7일 비용"      value={fmtMoney(a.cost7d)} hint={`한도 ${fmtMoney(350)}`}/>
      </div>

      <HmCard title="SOUL.md · agent identity prompt" meta="자동 생성 · 4일 전 업데이트 · Markdown"
        action={<Button size="sm" variant="ghost" leftIcon="edit" onClick={() => setEditing(true)}>편집</Button>}>
        <MarkdownView src={soul}/>
      </HmCard>

      <MarkdownEditor
        open={editing}
        title="Agent identity prompt 편집"
        filename={`apps/${a.id}/SOUL.md`}
        value={soul}
        onSave={(v) => { setSoul(v); setEditing(false); }}
        onClose={() => setEditing(false)}
      />

      <div style={{height:14}}/>
      <HmCard title="최근 이벤트" meta={`${appEvents.length}건 · Events 탭에서 자세히`}
        action={<a href="#" onClick={e => {e.preventDefault(); setTab("events");}} style={{fontSize:13, color:"var(--primary-40)", textDecoration:"none", fontFamily:"var(--font-sans)", fontWeight:600}}>모두 보기 →</a>}
        flush>
        <div className="hm-table-scroll" tabIndex={0}>
        <table className="hm-table">
          <tbody>
            {appEvents.slice(0, 5).map(e => (
              <tr key={e.id} onClick={() => onOpenRun(e.runIds[0])}>
                <td style={{width:130}}><StatusLabel status={e.severity}>{e.severity}</StatusLabel></td>
                <td>
                  <div style={{display:"flex", flexDirection:"column", gap:2}}>
                    <span style={{fontWeight:600, fontSize:14, color:"var(--on-surface)"}}>{e.title}</span>
                    <span className="hm-mono dim" style={{fontSize:11.5}}>{e.source} · {e.fingerprint}</span>
                  </div>
                </td>
                <td className="mono dim" style={{width:120}}>{fmtTimeAgo(e.time)}</td>
                <td className="mono" style={{width:90}}>
                  <span style={{color:"var(--primary-40)", fontWeight:600}}>Run {e.runIds.length}건</span>
                </td>
                <td className="shrink"><Icon name="chevronRight" size={16} style={{color:"var(--on-surface-muted)"}}/></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </HmCard>
    </>
  );
}

// ===================================================================
// Events tab — events with nested runs (1:N)
// ===================================================================
function EventsTab({ a, events, allRuns = [], onOpenRun }: any) {
  const [expanded, setExpanded] = useS_HP(new Set([events[0]?.id]));

  const toggle = (id) => {
    setExpanded(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <>
      <HmCard flush>
        <div className="hm-chipbar">
          <span style={{fontSize:13, color:"var(--on-surface-muted)", fontWeight:500}}>
            1개의 Event 는 여러 개의 Run 을 가질 수 있어요 (재시도, replay)
          </span>
          <span style={{flex:1}}></span>
          <Button size="sm" variant="ghost" leftIcon="filter">필터</Button>
          <Button size="sm" variant="ghost" leftIcon="download">내보내기</Button>
        </div>
        <div className="hm-table-scroll" tabIndex={0}>
          {events.map(e => {
            const isOpen = expanded.has(e.id);
            const runs = e.runIds.map(rid => allRuns.find(r => r.id === rid)).filter(Boolean);
            return (
              <div key={e.id} style={{borderBottom:"1px solid var(--border-subtle)"}}>
                {/* Event row */}
                <div className="hm-evrow" style={{display:"grid", gridTemplateColumns:"36px 130px 1fr 110px 110px 24px", gap:12, alignItems:"center", padding:"16px 20px", cursor:"pointer", background: isOpen ? "var(--surface-container-low)" : "transparent"}}
                     onClick={() => toggle(e.id)}>
                  <span style={{transition:"transform 150ms", transform: isOpen ? "rotate(90deg)" : "none", display:"inline-flex", color:"var(--on-surface-muted)"}}>
                    <Icon name="chevronRight" size={16}/>
                  </span>
                  <StatusLabel status={e.severity}>{e.severity}</StatusLabel>
                  <div style={{display:"flex", flexDirection:"column", gap:3, minWidth:0}}>
                    <span style={{fontWeight:700, fontSize:14, color:"var(--on-surface)"}}>{e.title}</span>
                    <span style={{fontSize:12.5, color:"var(--on-surface-muted)"}}>
                      <span style={{fontFamily:"var(--font-mono)", color:"var(--muninn-700)", fontWeight:600}}>{e.source}</span>
                      <span style={{margin:"0 6px"}}>·</span>
                      <span style={{fontFamily:"var(--font-mono)"}}>{e.fingerprint}</span>
                      {e.dedup > 0 && <>
                        <span style={{margin:"0 6px"}}>·</span>
                        <span style={{color:"var(--warning-50)", fontWeight:600}}>+{e.dedup} dedup</span>
                      </>}
                    </span>
                  </div>
                  <span className="hm-mono dim" style={{fontSize:13}}>{fmtTimeAgo(e.time)}</span>
                  <span style={{fontSize:13, fontWeight:600, color:"var(--primary-40)"}}>Run {runs.length}건</span>
                  <span></span>
                </div>

                {/* Nested runs */}
                {isOpen && (
                  <div style={{padding:"4px 20px 14px 64px", background:"var(--surface-container-low)"}}>
                    <div style={{fontSize:11.5, fontWeight:700, color:"var(--on-surface-muted)", marginBottom:8, textTransform:"none", letterSpacing:0}}>
                      AGENT RUNS · 이 이벤트가 트리거한 실행 {runs.length}건
                    </div>
                    <div style={{display:"flex", flexDirection:"column", gap:4}}>
                      {runs.map((r, i) => (
                        <div key={r.id} className="hm-evsubrow" style={{display:"grid", gridTemplateColumns:"20px 140px 100px 100px 100px 1fr 20px", gap:12, alignItems:"center", padding:"10px 12px", background:"var(--surface)", border:"1px solid var(--border-subtle)", borderRadius:8, cursor:"pointer"}}
                             onClick={(ev) => { ev.stopPropagation(); onOpenRun(r.id); }}>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--on-surface-muted)", fontWeight:600}}>#{i + 1}</span>
                          <StatusLabel status={r.status}>{runStatusLabel(r.status)}</StatusLabel>
                          <span className="hm-mono" style={{fontSize:12.5}}>{fmtClock(r.started)}</span>
                          <span className="hm-mono" style={{fontSize:12.5}}>{fmtDuration(r.duration)}</span>
                          <span className="hm-mono" style={{fontSize:12.5, fontWeight:600}}>{r.cost > 0 ? fmtMoney(r.cost) : "—"}</span>
                          <span style={{fontSize:13, color:"var(--on-surface-muted)"}}>{r.output || "—"}</span>
                          <Icon name="chevronRight" size={14} style={{color:"var(--on-surface-muted)"}}/>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </HmCard>
    </>
  );
}

function BindingsTab({ app: a }: any) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:14}}>
      <HmCard title="Deployment · 배포 도구" meta="1개 연결" flush>
        <div className="hm-binding">
          <span className="gly"><Icon name="package" size={15}/></span>
          <div className="body">
            <div className="name">
              {a.kind === "airflow" ? "Airflow" : "ArgoCD"}
              <span className="inst">instance: production-{a.kind === "airflow" ? "airflow" : "argocd"} ↗</span>
              <StatusDot status="healthy"/>
            </div>
            <div className="kv">
              <span>{a.kind === "airflow" ? "dag_id" : "app_name"}</span><span>{a.name}</span>
              <span>허용 도구</span><span>get_application, get_resource_tree</span>
              <span>최근 점검</span><span>4일 전 · 정상</span>
            </div>
          </div>
          <div style={{display:"flex", gap:6}}>
            <Button size="sm" variant="ghost">테스트</Button>
            <Button size="sm" variant="ghost">편집</Button>
          </div>
        </div>
      </HmCard>

      <HmCard title="Source · 소스 코드" meta="1개 연결" flush>
        <div className="hm-binding">
          <span className="gly"><Icon name="code" size={15}/></span>
          <div className="body">
            <div className="name">
              GitHub
              <span className="inst">repo: {a.repo} ↗</span>
              <StatusDot status="healthy"/>
            </div>
            <div className="kv">
              <span>기본 브랜치</span><span>main</span>
              <span>secret</span><span>gh-{a.name.split("-")[0]}-pat <span style={{color:"var(--on-surface-muted)"}}>(12일 전 교체)</span></span>
              <span>허용 도구</span><span>read_file, search_code, list_files, create_pr</span>
              <span>PR 설정</span><span>labels: huginn, automated · 항상 draft · workflow 변경 시 승인 필요</span>
            </div>
          </div>
          <div style={{display:"flex", gap:6}}>
            <Button size="sm" variant="ghost">검증</Button>
            <Button size="sm" variant="ghost">편집</Button>
          </div>
        </div>
      </HmCard>

      <HmCard title="Observability · 관측" meta="5개 연결 · 1개 identity" flush>
        <div className="hm-binding">
          <span className="gly"><Icon name="hash" size={15}/></span>
          <div className="body">
            <div className="name">Identity</div>
            <div className="kv">
              <span>otel_service_name</span><span>{a.name}</span>
              <span>k8s namespace</span><span>ai-platform</span>
              <span>k8s labels</span><span>{`{app: "${a.name}"}`}</span>
            </div>
          </div>
        </div>
        {[
          { gly: "chart", name: "Grafana", inst: "platform-grafana ↗", kv: [["default dashboard uid", "abc123"]], isDefault: true },
          { gly: "fileText", name: "Loki", inst: "prod-loki ↗", kv: [["default query", `{app="${a.name}"}`]], isDefault: true },
          { gly: "activity", name: "Tempo", inst: "prod-tempo ↗", kv: [["default service", a.name]], isDefault: true },
          { gly: "activity", name: "Mimir", inst: "prod-mimir ↗", kv: [["default filter", `{kubernetes_app="${a.name}"}`]], isDefault: true },
        ].map((b, i) => (
          <div className="hm-binding" key={i}>
            <span className="gly"><Icon name={b.gly} size={15}/></span>
            <div className="body">
              <div className="name">
                {b.name}
                <span className="inst">instance: {b.inst}</span>
                <StatusDot status="healthy"/>
                {b.isDefault && <Badge tone="primary">기본</Badge>}
              </div>
              <div className="kv">
                {b.kv.map(([k, v], ki) => <React.Fragment key={ki}><span>{k}</span><span>{v}</span></React.Fragment>)}
              </div>
            </div>
            <div style={{display:"flex", gap:6}}>
              <Button size="sm" variant="ghost">Test</Button>
              <Button size="sm" variant="ghost">Edit</Button>
            </div>
          </div>
        ))}
      </HmCard>
    </div>
  );
}

// ===================================================================
// App detail — Memories tab (this app's memories + recallable global ones)
// ===================================================================
function AppMemoriesTab({ app: a, mems }: any) {
  const [q, setQ] = useS_HP("");
  const [includeGlobal, setIncludeGlobal] = useS_HP(true);

  // /api/apps/[id]/memories → { app: Memory[], global: Memory[] }
  const appMems = mems?.app ?? [];
  const globalMems = mems?.global ?? [];
  const list = q
    ? [...appMems, ...(includeGlobal ? globalMems : [])].filter(m => m.fact.toLowerCase().includes(q.toLowerCase()) || m.tags.some(t => t.includes(q.toLowerCase())))
    : [...appMems, ...(includeGlobal ? globalMems : [])];

  return (
    <>
      <HmCard>
        <div style={{display:"flex", gap:12, alignItems:"center"}}>
          <div style={{flex:1}}>
            <div className="input-with-icon">
              <Icon name="search" size={15}/>
              <input className="input" placeholder={`${a.name} 의 Memories 검색...`} value={q} onChange={e => setQ(e.target.value)} style={{fontSize:14, height:40}}/>
            </div>
          </div>
          <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:"var(--on-surface-variant)", fontFamily:"var(--font-sans)", fontWeight:500}}>
            <Toggle checked={includeGlobal} onChange={setIncludeGlobal}/>
            Global Memories 포함
          </label>
        </div>
      </HmCard>

      <div style={{height:14}}/>

      <div style={{display:"flex", gap:14, marginBottom:14, padding:"12px 16px", background:"var(--primary-95)", border:"1px solid var(--primary-50)", borderRadius:10}}>
        <Icon name="info" size={16} style={{color:"var(--primary-40)", marginTop:2}}/>
        <div style={{fontSize:13, color:"var(--on-surface)", lineHeight:1.6}}>
          이 Application 의 Huginn 실행 시 <b>{appMems.length}개</b>의 전용 Memory 와 <b>{globalMems.length}개</b>의 Global Memories이 recall 대상이 됩니다. 새 Memory 는 실행 종료 시 자동으로 distill 되어 추가됩니다.
        </div>
      </div>

      {/* App-specific */}
      {appMems.length > 0 && (
        <>
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
            <h2 style={{margin:0, fontSize:15, fontWeight:700, color:"var(--on-surface)"}}>App 전용 Memories</h2>
            <span style={{fontSize:12, color:"var(--on-surface-muted)", fontWeight:500}}>{appMems.length}개</span>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:10, marginBottom:18}}>
            {appMems.map(m => <MemoryCard key={m.id} m={m} scope="app"/>)}
          </div>
        </>
      )}

      {/* Global */}
      {includeGlobal && (
        <>
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
            <h2 style={{margin:0, fontSize:15, fontWeight:700, color:"var(--on-surface)"}}>Global Memories</h2>
            <span style={{fontSize:12, color:"var(--on-surface-muted)", fontWeight:500}}>{globalMems.length}개 · 모든 Application 공유</span>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {globalMems.map(m => <MemoryCard key={m.id} m={m} scope="global"/>)}
          </div>
        </>
      )}
    </>
  );
}

function MemoryCard({ m, scope, onEdit, onDelete, admin }: any) {
  const [fact, setFact] = useS_HP(m.fact);
  const [editing, setEditing] = useS_HP(false);
  return (
    <div className="hm-memory" style={scope === "global" ? {borderLeftColor:"var(--primary-50)"} : null}>
      <div style={{display:"flex", alignItems:"flex-start", gap:10}}>
        <span style={{
          fontSize:10.5, fontWeight:700, padding:"3px 8px", borderRadius:4, letterSpacing:0,
          background: scope === "global" ? "var(--primary-95)" : "var(--muninn-50)",
          color: scope === "global" ? "var(--primary-40)" : "var(--muninn-700)",
          flexShrink:0, marginTop:2,
        }}>
          {scope === "global" ? "GLOBAL" : "APP 전용"}
        </span>
        <div className="fact" style={{flex:1}}>
          <MarkdownView src={fact}/>
        </div>
        {admin && (
          <div style={{display:"flex", gap:4, flexShrink:0}}>
            <IconButton icon="edit" size="sm" onClick={() => { setEditing(true); onEdit?.(m); }}/>
            <IconButton icon="trash" size="sm" onClick={() => onDelete?.(m)}/>
          </div>
        )}
        <MarkdownEditor
          open={editing}
          title={`Memory 편집 · ${scope === "global" ? "Global" : "App 전용"}`}
          filename={m.id}
          value={fact}
          hint={<span>짧은 fact 는 한 문단으로, 몇 줄 이상은 <kbd># 제목</kbd> / <kbd>- 목록</kbd> 으로 구조화하세요.</span>}
          onSave={(v) => { setFact(v); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      </div>
      <div className="meta">
        {m.appName && <span style={{fontFamily:"var(--font-sans)", fontSize:13, color:"var(--on-surface)", fontWeight:600}}>{m.appName}</span>}
        {!m.appName && <span style={{fontFamily:"var(--font-sans)", fontSize:13, color:"var(--primary-40)", fontWeight:600}}>모든 Application 공유</span>}
        {m.run && <span className="hm-mono" style={{color:"var(--on-surface-muted)"}}>{m.run}</span>}
        <span>{m.when}</span>
        <span className="tags">
          {m.tags.map(t => <span key={t} className="tag" style={scope === "global" ? {background:"var(--primary-95)", color:"var(--primary-40)"} : null}>{t}</span>)}
        </span>
        <span className={`score ${m.score > 0.85 ? "is-high" : ""}`} style={scope === "global" ? {color: m.score > 0.85 ? "var(--primary-30, #008A3D)" : "var(--primary-40)"} : null}>
          {m.score.toFixed(2)} {m.score > 0.85 && "✦"}
        </span>
      </div>
    </div>
  );
}

// ===================================================================
// Settings > Memories — admin manages global + per-app memories
// ===================================================================
function HmMemories() {
  // Application 필터 드롭다운 소스도 mock 직접 참조 대신 /api/apps 로 조회.
  const { data: apps = [] } = useApi<any[]>("/api/apps");
  // 페이지와 recall(copilot/API)이 동일 소스를 보도록 /api/memories 를 통한다.
  // (DATABASE_URL 있으면 postgres, 없으면 API 가 mock(HM_DATA)으로 graceful fallback.)
  const [all, setAll] = useS_HP<any[]>([]);
  const [loading, setLoading] = useS_HP(true);
  const [error, setError] = useS_HP<string | null>(null);
  const [scopeFilter, setScopeFilter] = useS_HP("all");
  const [appFilter, setAppFilter] = useS_HP("all");
  const [q, setQ] = useS_HP("");

  useE_HP(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/memories?limit=200", { cache: "no-store" });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        if (alive) setAll(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        if (alive) { setError(e?.message ?? "조회 실패"); setAll([]); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  let list = all;
  if (scopeFilter === "global") list = list.filter(m => m.scope === "global");
  if (scopeFilter === "app")    list = list.filter(m => m.scope === "app");
  if (appFilter !== "all")      list = list.filter(m => m.appId === appFilter);
  if (q) list = list.filter(m => m.fact.toLowerCase().includes(q.toLowerCase()) || m.tags.some((t: string) => t.includes(q.toLowerCase())));

  // group by app for app-scoped
  const globalList = list.filter(m => m.scope === "global");
  const appBucket: any = {};
  list.filter(m => m.scope === "app").forEach((m: any) => {
    if (!appBucket[m.appId]) appBucket[m.appId] = { name: m.appName, items: [] };
    appBucket[m.appId].items.push(m);
  });

  return (
    <>
      <HmPageHead title="Memories" sub="Muninn — 과거 사건에서 distill 된 recall 단편. admin 이 직접 등록·수정할 수 있어요.">
        <Button size="sm" variant="primary" leftIcon="plus">Memory 추가</Button>
      </HmPageHead>

      {/* Stats strip */}
      <div className="hm-kpi-grid">
        <HmKpi label="전체 Memories"       value={`${all.length}`}/>
        <HmKpi label="Global"        value={`${all.filter(m => m.scope === "global").length}`} hint="모든 Application 공유"/>
        <HmKpi label="App 전용"      value={`${all.filter(m => m.scope === "app").length}`}/>
        <HmKpi label="Curated"       value={`${all.filter(m => m.curated).length}`} hint="admin 직접 등록"/>
      </div>

      {/* Search + filter */}
      <HmCard>
        <div style={{display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap"}}>
          <div className="hm-filter-grow" style={{flex:"1 1 280px"}}>
            <label style={{display:"block", marginBottom:6, fontSize:12, color:"var(--on-surface-muted)", fontWeight:600}}>검색</label>
            <div className="input-with-icon">
              <Icon name="search" size={15}/>
              <input className="input" placeholder="Memory 본문 또는 태그로 검색..." value={q} onChange={e => setQ(e.target.value)} style={{fontSize:14, height:40}}/>
            </div>
          </div>
          <div>
            <label style={{display:"block", marginBottom:6, fontSize:12, color:"var(--on-surface-muted)", fontWeight:600}}>Scope</label>
            <Tabs pill value={scopeFilter} onChange={setScopeFilter} tabs={[
              {label:"전체", value:"all"},
              {label:"Global", value:"global"},
              {label:"App 전용", value:"app"},
            ]}/>
          </div>
          <div>
            <label style={{display:"block", marginBottom:6, fontSize:12, color:"var(--on-surface-muted)", fontWeight:600}}>Application</label>
            <Select value={appFilter} onChange={e => setAppFilter(e.target.value)} options={[
              {value:"all", label:"전체"},
              ...(apps ?? []).map(a => ({ value: a.id, label: a.name })),
            ]}/>
          </div>
        </div>
      </HmCard>

      <div style={{height:18}}/>

      {loading && (
        <HmCard><div style={{padding:"40px 24px"}}><Empty icon="database" title="불러오는 중…" sub="Memory 를 조회하고 있어요."/></div></HmCard>
      )}
      {error && !loading && (
        <HmCard><div style={{padding:"40px 24px"}}><Empty icon="alert" title="조회 오류" sub={error}/></div></HmCard>
      )}

      {/* Global section */}
      {(!loading && !error && scopeFilter !== "app" && globalList.length > 0) && (
        <div style={{marginBottom:22}}>
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
            <span style={{fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:9999, background:"var(--primary-95)", color:"var(--primary-40)", letterSpacing:0}}>GLOBAL</span>
            <h2 style={{margin:0, fontSize:16, fontWeight:700, color:"var(--on-surface)"}}>Global Memories</h2>
            <span style={{fontSize:12.5, color:"var(--on-surface-muted)"}}>{globalList.length}개 · 모든 Application 의 recall 대상</span>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {globalList.map(m => <MemoryCard key={m.id} m={m} scope="global" admin/>)}
          </div>
        </div>
      )}

      {/* Per-app sections */}
      {!loading && !error && scopeFilter !== "global" && Object.entries(appBucket).map(([appId, bucket]: [string, any]) => (
        <div key={appId} style={{marginBottom:22}}>
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
            <span style={{fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:9999, background:"var(--muninn-50)", color:"var(--muninn-700)", letterSpacing:0}}>APP</span>
            <h2 style={{margin:0, fontSize:16, fontWeight:700, color:"var(--on-surface)"}}>{bucket.name}</h2>
            <span style={{fontSize:12.5, color:"var(--on-surface-muted)"}}>{bucket.items.length}개</span>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {bucket.items.map(m => <MemoryCard key={m.id} m={m} scope="app" admin/>)}
          </div>
        </div>
      ))}

      {!loading && !error && list.length === 0 && (
        <HmCard>
          <div style={{padding:"40px 24px"}}>
            <Empty icon="database" title="조건에 맞는 Memory 가 없어요" sub="검색어나 필터를 조정해보세요."/>
          </div>
        </HmCard>
      )}
    </>
  );
}

// ===================================================================
// /settings/platform-tools — Deployment / Observability / Registry
// ===================================================================
function HmPlatformTools() {
  const [tab, setTab] = useS_HP("deployment");

  return (
    <>
      <HmPageHead title="플랫폼 도구" sub="Huginn 이 사용하는 플랫폼 인프라 도구 · admin 전용">
        <Button size="sm" variant="primary" leftIcon="plus">인스턴스 등록</Button>
      </HmPageHead>

      {/* Tier 1 — main category */}
      <div className="hm-pt-tier1">
        <Tabs value={tab} onChange={setTab} tabs={[
          {label:"Deployment",    value:"deployment"},
          {label:"Observability", value:"observability"},
          {label:"Registry",      value:"registry"},
        ]}/>
      </div>

      {tab === "deployment"    && <DeploymentSection/>}
      {tab === "observability" && <ObservabilitySection/>}
      {tab === "registry"      && <RegistrySection/>}
    </>
  );
}

// ---------- Reusable Tool section card ----------
function ToolSection({ name, kind, desc, count, brandColor, brandMark, children, onRegister }: any) {
  return (
    <section className="hm-tool-section">
      <header className="hm-tool-section-head">
        <div style={{display:"flex", alignItems:"center", gap:14, flex:1, minWidth:0}}>
          <span className="hm-tool-mark" style={{background: brandColor || "var(--surface-container)"}}>
            {brandMark}
          </span>
          <div style={{display:"flex", flexDirection:"column", gap:3, minWidth:0}}>
            <div style={{display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap"}}>
              <h2 style={{margin:0, fontSize:18, fontWeight:800, color:"var(--on-surface)", letterSpacing:"-0.02em"}}>{name}</h2>
              {kind && <span style={{fontSize:12, color:"var(--on-surface-muted)", fontWeight:600, fontFamily:"var(--font-mono)", whiteSpace:"nowrap"}}>{kind}</span>}
              {count != null && <span style={{fontSize:12, color:"var(--on-surface-muted)", fontWeight:500, whiteSpace:"nowrap"}}>· {count}개 인스턴스</span>}
            </div>
            {desc && <div style={{fontSize:13, color:"var(--on-surface-muted)", lineHeight:1.5}}>{desc}</div>}
          </div>
        </div>
        <Button size="sm" variant="gray" leftIcon="plus" onClick={onRegister}>인스턴스 등록</Button>
      </header>

      <div className="hm-tool-section-body">
        {children}
      </div>
    </section>
  );
}

// ===== Deployment =====
function DeploymentSection() {
  const [sub, setSub] = useS_HP("cd");
  const TABS = [
    { id: "cd",       label: "CD / GitOps",            tools: "ArgoCD",  count: 3 },
    { id: "workflow", label: "Workflow orchestration", tools: "Airflow", count: 1 },
  ];

  return (
    <div style={{display:"flex", flexDirection:"column", gap:18}}>
      <ToolSubTabs tabs={TABS} value={sub} onChange={setSub}/>

      {sub === "cd" && (
        <ToolSection
          name="ArgoCD"
          kind="continuous-delivery"
          desc="GitOps 기반의 K8s 애플리케이션 연속 배포. Application sync 상태와 resource tree 를 분석합니다."
          count={3}
          brandColor="#EF7B4D"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="9" fill="none" stroke="white" strokeWidth="2.2"/><circle cx="12" cy="12" r="3" fill="white"/></svg>}
        >
          <PlatformTable
            cols={[
              {key:"name", label:"이름", render: r => <span className="app-link">{r.name}</span>},
              {key:"server", label:"서버", mono:true, render: r => <span style={{color:"var(--on-surface-muted)"}}>{r.server}</span>},
              {key:"st", label:"상태", width:120, render: r => <StatusLabel status={r.st}>{r.st}</StatusLabel>},
              {key:"apps", label:"Apps", width:90, mono:true, render: r => <span style={{fontWeight:600}}>{r.apps}</span>},
              {key:"used", label:"사용 중 (App)", width:130, render: r => <span style={{fontWeight:600}}>{r.used}개</span>},
              {key:"last", label:"마지막 점검", width:130, mono:true, render: r => <span style={{color:"var(--on-surface-muted)"}}>{r.last}</span>},
            ]}
            rows={[
              { name: "production-argocd", server: "argocd.platform.local",     st: "healthy",  apps: 187, used: 12, last: "2분 전" },
              { name: "staging-argocd",    server: "argocd-stg.platform.local", st: "healthy",  apps:  42, used:  3, last: "4분 전" },
              { name: "dev-argocd",        server: "argocd-dev.local",          st: "unreach",  apps:   0, used:  0, last: "1일 전" },
            ]}
          />
        </ToolSection>
      )}

      {sub === "workflow" && (
        <ToolSection
          name="Airflow"
          kind="workflow-orchestration"
          desc="DAG 기반 워크플로우 오케스트레이션. 실패한 task 의 로그와 의존성을 추적합니다."
          count={1}
          brandColor="#017CEE"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 3 L20 17 L4 17 Z" fill="white"/></svg>}
        >
          <PlatformTable
            cols={[
              {key:"name", label:"이름", render: r => <span className="app-link">{r.name}</span>},
              {key:"server", label:"서버", mono:true, render: r => <span style={{color:"var(--on-surface-muted)"}}>{r.server}</span>},
              {key:"st", label:"상태", width:120, render: r => <StatusLabel status={r.st}>{r.st}</StatusLabel>},
              {key:"apps", label:"DAGs", width:90, mono:true, render: r => <span style={{fontWeight:600}}>{r.apps}</span>},
              {key:"used", label:"사용 중 (App)", width:130, render: r => <span style={{fontWeight:600}}>{r.used}개</span>},
              {key:"last", label:"마지막 점검", width:130, mono:true, render: r => <span style={{color:"var(--on-surface-muted)"}}>{r.last}</span>},
            ]}
            rows={[
              { name: "platform-airflow", server: "airflow.platform.local", st: "healthy", apps: 43, used: 8, last: "2분 전" },
            ]}
          />
        </ToolSection>
      )}
    </div>
  );
}

// ===== Shared sub-tab nav — used across Deployment / Observability / Registry =====
function ToolSubTabs({ tabs, value, onChange }: any) {
  if (tabs.length <= 1) return null; // skip nav when only one sub-category
  return (
    <div className="hm-subtabs-wrap">
      <div className="hm-subtabs" role="tablist" aria-label="Sub-category">
        {tabs.map(t => {
          const on = value === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              className={`hm-subtab ${on ? "is-on" : ""}`}
              onClick={() => onChange(t.id)}
            >
              <span className="hm-subtab-lbl">{t.label}</span>
              {t.tools && <span className="hm-subtab-tools">· {t.tools}</span>}
              {t.count != null && <span className="hm-subtab-count">{t.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ObservabilitySection() {
  const obsCols = [
    {key:"name", label:"이름", render: r => <span className="app-link">{r.name}</span>},
    {key:"e", label:"엔드포인트", mono:true, render: r => <span style={{color:"var(--on-surface-muted)"}}>{r.e}</span>},
    {key:"st", label:"상태", width:120, render: r => <StatusLabel status={r.st}>{r.st}</StatusLabel>},
    {key:"used", label:"사용 중 (App)", width:130, render: r => <span style={{fontWeight:600}}>{r.used}개</span>},
  ];
  const [sub, setSub] = useS_HP("dashboard");
  const TABS = [
    { id: "dashboard", label: "Dashboard", tools: "Grafana",          count: 1 },
    { id: "metrics",   label: "Metrics",   tools: "Mimir",  count: 2 },
    { id: "logging",   label: "Logging",   tools: "Loki",             count: 2 },
    { id: "tracing",   label: "Tracing",   tools: "Tempo",            count: 1 },
    { id: "profiling", label: "Profiling", tools: "Pyroscope",        count: 2 },
  ];

  return (
    <div style={{display:"flex", flexDirection:"column", gap:18}}>
      <ToolSubTabs tabs={TABS} value={sub} onChange={setSub}/>

      {sub === "dashboard" && (
        <ToolSection
          name="Grafana"
          kind="dashboard"
          desc="metric / log / trace 통합 대시보드. Huginn 이 panel 별 데이터를 분석 시 deep-link 로 활용합니다."
          count={1}
          brandColor="#F46800"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="3.5" fill="white"/><circle cx="12" cy="12" r="8" fill="none" stroke="white" strokeWidth="1.6" strokeDasharray="2 3"/></svg>}
        >
          <PlatformTable cols={obsCols}
            rows={[
              { name: "platform-grafana", e: "grafana.platform:3000", st: "healthy", used: 6 },
            ]}
          />
        </ToolSection>
      )}

      {sub === "metrics" && (
        <ToolSection
          name="Mimir"
          kind="time-series"
          desc="Prometheus 호환 메트릭(Mimir). 고압축·장기 보관이 강점으로, infra/app 메트릭을 쿼리합니다."
          count={2}
          brandColor="#E74C3C"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 9 12 13 16 20 7"/><circle cx="20" cy="7" r="1.4" fill="white"/></svg>}
        >
          <PlatformTable
            cols={[
              {key:"k", label:"역할", width:110, mono:true, render: r => <span style={{fontWeight:600, color:"var(--muninn-700)"}}>{r.k}</span>},
              ...obsCols,
            ]}
            rows={[
              { k: "vmselect", name: "prod-mimir",         e: "mimir-query.observability:8481", st: "healthy", used: 9 },
              { k: "vminsert", name: "prod-mimir-ingest",  e: "mimir-ingest.observability:8480", st: "healthy", used: 9 },
            ]}
          />
        </ToolSection>
      )}

      {sub === "logging" && (
        <ToolSection
          name="Loki"
          kind="log-aggregation"
          desc="LogQL 기반 로그 수집·검색. Huginn 의 1순위 로그 분석 백엔드입니다."
          count={2}
          brandColor="#4D9BB8"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 6h16M4 12h12M4 18h8"/></svg>}
        >
          <PlatformTable cols={obsCols}
            rows={[
              { name: "prod-loki", e: "loki.observability:3100", st: "healthy", used: 9 },
              { name: "dev-loki",  e: "loki-dev:3100",           st: "healthy", used: 2 },
            ]}
          />
        </ToolSection>
      )}

      {sub === "tracing" && (
        <ToolSection
          name="Tempo"
          kind="distributed-tracing"
          desc="분산 트레이싱. P99 latency 가 튀는 케이스에서 span 트리를 분석할 때 사용."
          count={1}
          brandColor="#A88AED"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/></svg>}
        >
          <PlatformTable cols={obsCols}
            rows={[
              { name: "prod-tempo", e: "tempo.observability:3200", st: "healthy", used: 4 },
            ]}
          />
        </ToolSection>
      )}

      {sub === "profiling" && (
        <ToolSection
          name="Pyroscope"
          kind="continuous-profiling"
          desc="eBPF 기반 샘플링으로 CPU / memory flamegraph 를 상시 수집. 상승 중인 latency 의 hot path 를 변경점 전후로 비교합니다."
          count={2}
          brandColor="#E8772E"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="3"  y="5"  width="18" height="3" rx="1"/><rect x="5"  y="9"  width="14" height="3" rx="1"/><rect x="7"  y="13" width="10" height="3" rx="1"/><rect x="9"  y="17" width="6"  height="3" rx="1"/></svg>}
        >
          <PlatformTable
            cols={[
              {key:"k", label:"에이전트", width:110, mono:true, render: r => <span style={{fontWeight:600, color:"var(--muninn-700)"}}>{r.k}</span>},
              ...obsCols,
            ]}
            rows={[
              { k: "ebpf", name: "pyroscope-prod",   e: "pyroscope.observability:4040", st: "healthy",  used: 6 },
              { k: "sdk",  name: "pyroscope-py-sdk", e: "pyroscope.observability:4040", st: "degraded", used: 2 },
            ]}
          />
        </ToolSection>
      )}
    </div>
  );
}

// ===== Registry =====
function RegistrySection() {
  const [sub, setSub] = useS_HP("container");
  const TABS = [
    { id: "container", label: "Container registry", tools: "Harbor", count: 2 },
  ];

  return (
    <div style={{display:"flex", flexDirection:"column", gap:18}}>
      <ToolSubTabs tabs={TABS} value={sub} onChange={setSub}/>

      {sub === "container" && (
        <ToolSection
          name="Harbor"
          kind="container-registry"
          desc="컨테이너 이미지 레지스트리. PR 생성 전 image vulnerability scan 결과를 recall 할 때 사용합니다."
          count={2}
          brandColor="#60B932"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 3v18M5 12h14M8 8l8 8M16 8l-8 8"/></svg>}
        >
          <PlatformTable
            cols={[
              {key:"name", label:"이름", render: r => <span className="app-link">{r.name}</span>},
              {key:"server", label:"엔드포인트", mono:true, render: r => <span style={{color:"var(--on-surface-muted)"}}>{r.server}</span>},
              {key:"st", label:"상태", width:120, render: r => <StatusLabel status={r.st}>{r.st}</StatusLabel>},
              {key:"projects", label:"Projects", width:100, mono:true, render: r => <span style={{fontWeight:600}}>{r.projects}</span>},
              {key:"repos", label:"Repos", width:90, mono:true, render: r => <span style={{fontWeight:600}}>{r.repos}</span>},
              {key:"storage", label:"Storage", width:110, mono:true, render: r => <span style={{color:"var(--on-surface-muted)"}}>{r.storage}</span>},
              {key:"used", label:"사용 중 (App)", width:130, render: r => <span style={{fontWeight:600}}>{r.used}개</span>},
            ]}
            rows={[
              { name: "harbor-prod",    server: "harbor.platform.local",     st: "healthy",  projects: 24, repos: 412, storage: "1.2 TB",  used: 11 },
              { name: "harbor-staging", server: "harbor-stg.platform.local", st: "healthy",  projects:  9, repos: 138, storage: "320 GB",  used:  4 },
            ]}
          />
        </ToolSection>
      )}
    </div>
  );
}

function PlatformTable({ rows, cols }: any) {
  return (
    <div className="hm-table-scroll" tabIndex={0}>
      <table className="hm-table">
        <thead>
          <tr>{cols.map(c => <th key={c.key} style={c.width ? {width: c.width} : null}>{c.label}</th>)}<th style={{width:24}}></th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name}>
              {cols.map(c => <td key={c.key} className={c.mono ? "mono" : ""}>{c.render ? c.render(r) : r[c.key]}</td>)}
              <td><Icon name="chevronRight" size={16} style={{color:"var(--on-surface-muted)"}}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { HmAppsList, HmAppDetail, HmMemories, HmPlatformTools };
