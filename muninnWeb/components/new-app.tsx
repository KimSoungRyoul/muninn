"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { Button, Badge } from "@/components/ui";
import { HM_DATA } from "@/lib/data";
// Huginn & Muninn — New Application registration page
// Single-page form with sectioned cards + live preview sidebar.

const { useState: useS_NA } = React;

function HmNewApp({ workspaceId, onCancel, onCreated }: any) {
  const D = HM_DATA;
  const ws = D.WORKSPACES.find(w => w.id === workspaceId) || D.WORKSPACES[0];

  const [form, setForm] = useS_NA({
    name: "",
    description: "",
    repo: "",
    kind: "fastapi",
    output: "pull_request",
    bindings: {
      argocd: true, airflow: false,
      grafana: true, mimir: false,
      loki: true,
      tempo: true, pyroscope: false,
      harbor: false,
    },
    severityThreshold: "warning",
    maxIters: 12,
    maxCostUsd: 5,
    dailyRunCap: 50,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setBinding = (k, v) => setForm(f => ({ ...f, bindings: { ...f.bindings, [k]: v }}));

  const errors: any = {};
  if (!form.name.trim()) errors.name = "이름은 필수입니다.";
  else if (!/^[a-z0-9-]+$/.test(form.name)) errors.name = "소문자 · 숫자 · 하이픈만 사용해주세요.";
  if (!form.repo.trim()) errors.repo = "저장소는 필수입니다.";
  else if (!/^[\w.-]+\/[\w.-]+$/.test(form.repo)) errors.repo = "owner/repo 형식이어야 합니다.";

  const canSubmit = Object.keys(errors).length === 0;

  return (
    <>
      <div className="hm-newapp-head">
        <button className="btn btn-icon btn-sm" onClick={onCancel} aria-label="뒤로"><Icon name="chevronLeft" size={16}/></button>
        <div style={{flex:1, minWidth:0}}>
          <h1 className="hm-newapp-title">새 Application 등록</h1>
          <div className="hm-newapp-sub">
            <span style={{color:"var(--on-surface)", fontWeight:600}}>{ws.name}</span> 워크스페이스 ·
            Huginn 이 자율 운영할 새 서비스를 등록합니다.
          </div>
        </div>
        <div style={{display:"flex", gap:6}}>
          <Button size="sm" variant="ghost" onClick={onCancel}>취소</Button>
          <Button size="sm" variant="primary" leftIcon="check" disabled={!canSubmit}
                  onClick={() => onCreated && onCreated(form)}>
            Application 등록
          </Button>
        </div>
      </div>

      <div className="hm-newapp-layout">
        <div className="hm-newapp-main">
          <FormSection step={1} title="기본 정보" sub="식별자 · 저장소 위치">
            <NaField label="Application 이름" required error={errors.name}
                     hint="소문자, 숫자, 하이픈만 사용. 워크스페이스 내에서 유일해야 합니다.">
              <input className={`input mono ${errors.name && form.name ? "is-error" : ""}`}
                     placeholder="ai-router-svc"
                     value={form.name} onChange={e => set("name", e.target.value)}/>
            </NaField>

            <NaField label="설명" hint="이 Application 이 무엇을 운영하는지 한 줄로.">
              <input className="input"
                     placeholder="AI 추론 라우터 — Triton 백엔드로 트래픽을 분배"
                     value={form.description} onChange={e => set("description", e.target.value)}/>
            </NaField>

            <NaField label="GitHub 저장소" required error={errors.repo}
                     hint="owner/repo 형식. Huginn 이 코드 분석 · PR 생성 시 사용합니다.">
              <div className="input-with-icon">
                <Icon name="code" size={16}/>
                <input className={`input mono ${errors.repo && form.repo ? "is-error" : ""}`}
                       placeholder="acme/ai-router-svc"
                       value={form.repo} onChange={e => set("repo", e.target.value)}/>
              </div>
            </NaField>
          </FormSection>

          <FormSection step={2} title="종류" sub="런타임 종류에 따라 권장 도구가 자동으로 선택됩니다.">
            <KindCards value={form.kind} onChange={v => {
              set("kind", v);
              // Auto-toggle deployment bindings based on kind
              setForm(f => ({
                ...f, kind: v,
                bindings: {
                  ...f.bindings,
                  argocd:  v !== "airflow",
                  airflow: v === "airflow",
                },
              }));
            }}/>
          </FormSection>

          <FormSection step={3} title="결과 형식" sub="Huginn 이 분석을 마치고 사용자에게 보고하는 방식.">
            <OutputCards value={form.output} onChange={v => set("output", v)}/>
          </FormSection>

          <FormSection step={4} title="Platform tools 연결"
                       sub={`${Object.values(form.bindings).filter(Boolean).length}개 선택 · 등록 후 상세 페이지에서 자유롭게 추가 / 편집할 수 있어요.`}>
            <PlatformToolsPicker bindings={form.bindings} setBinding={setBinding} kind={form.kind}/>
          </FormSection>

          <FormSection step={5} title="이벤트 트리거"
                       sub="Huginn 을 자동으로 깨우는 조건. webhook URL 은 등록 후 자동 생성됩니다.">
            <NaField label="최소 심각도"
                     hint="이 단계 이상의 이벤트에 대해서만 Run 이 생성됩니다.">
              <SeverityRow value={form.severityThreshold} onChange={v => set("severityThreshold", v)}/>
            </NaField>

            <NaField label="수신 webhook URL"
                     hint="외부 시스템 (alertmanager, grafana) 에서 POST 하세요. 등록 후 활성화됩니다.">
              <div className="input-with-icon">
                <Icon name="globe" size={16}/>
                <input className="input mono" readOnly
                       value={`https://muninn-api.platform.local/api/hooks/${form.name || "<name>"}`}
                       style={{color: form.name ? "var(--on-surface-variant)" : "var(--on-surface-muted)"}}/>
              </div>
            </NaField>
          </FormSection>

          <FormSection step={6} title="안전 한도"
                       sub="단일 Run 이 사용할 수 있는 자원 상한. 초과 시 사람에게 인계됩니다.">
            <div className="hm-newapp-limits">
              <NaField label="Run 당 최대 iteration" hint="LLM 단계 수 상한">
                <input type="number" min={1} max={50} className="input mono"
                       value={form.maxIters} onChange={e => set("maxIters", +e.target.value || 1)}/>
              </NaField>
              <NaField label="Run 당 최대 비용" hint="USD 기준">
                <div className="hm-input-suffix">
                  <input type="number" step={0.5} min={0} className="input mono"
                         value={form.maxCostUsd} onChange={e => set("maxCostUsd", +e.target.value || 0)}/>
                  <span className="hm-input-suffix-lbl">USD</span>
                </div>
              </NaField>
              <NaField label="일일 Run 상한" hint="24시간 슬라이딩 윈도우 기준">
                <input type="number" min={1} className="input mono"
                       value={form.dailyRunCap} onChange={e => set("dailyRunCap", +e.target.value || 1)}/>
              </NaField>
            </div>
          </FormSection>
        </div>

        <aside className="hm-newapp-side">
          <NewAppPreview form={form} ws={ws} canSubmit={canSubmit} errors={errors}/>
        </aside>
      </div>
    </>
  );
}

// ===================================================================
// Sub-components
// ===================================================================

function FormSection({ step, title, sub, children }: any) {
  return (
    <section className="hm-form-section">
      <header className="hm-form-section-head">
        {step != null && <span className="hm-form-step">{step}</span>}
        <div style={{minWidth:0}}>
          <h2 className="hm-form-section-title">{title}</h2>
          {sub && <p className="hm-form-section-sub">{sub}</p>}
        </div>
      </header>
      <div className="hm-form-section-body">{children}</div>
    </section>
  );
}

function NaField({ label, required, hint, error, children }: any) {
  return (
    <div className="hm-na-field">
      <label className="hm-na-label">
        {label}
        {required && <span style={{color:"var(--error-50)", marginLeft:3}}>*</span>}
      </label>
      {children}
      {error
        ? <div className="hm-na-hint is-error"><Icon name="alert" size={12}/>{error}</div>
        : (hint && <div className="hm-na-hint">{hint}</div>)}
    </div>
  );
}

function KindCards({ value, onChange }: any) {
  const kinds = [
    { id:"triton",  name:"Triton",  desc:"NVIDIA Triton Inference Server · GPU 모델 추론",        icon:"activity" },
    { id:"fastapi", name:"FastAPI", desc:"Python FastAPI 웹 서비스 · 일반 K8s 워크로드",          icon:"code" },
    { id:"airflow", name:"Airflow", desc:"DAG 기반 배치 파이프라인 (1 DAG = 1 App)",              icon:"gitBranch" },
    { id:"other",   name:"기타",     desc:"위 분류에 속하지 않는 사용자 정의 워크로드",            icon:"package" },
  ];
  return (
    <div className="hm-kind-grid">
      {kinds.map(k => (
        <button key={k.id} type="button"
                className={`hm-kind-card ${value === k.id ? "is-on" : ""}`}
                onClick={() => onChange(k.id)}>
          <span className="hm-kind-icon"><Icon name={k.icon} size={20}/></span>
          <div className="hm-kind-meta">
            <div className="hm-kind-name">{k.name}</div>
            <div className="hm-kind-desc">{k.desc}</div>
          </div>
          <span className="hm-kind-check" aria-hidden={value !== k.id}>
            <Icon name="check" size={13}/>
          </span>
        </button>
      ))}
    </div>
  );
}

function OutputCards({ value, onChange }: any) {
  const outs = [
    {
      id:"pull_request",
      name:"Pull Request",
      tag:"권장",
      desc:"코드 수정으로 해결 가능한 경우. Huginn 이 직접 PR 을 생성해 사람의 승인을 받습니다.",
      hint:"label: huginn, automated · 항상 draft",
      icon:"gitBranch",
    },
    {
      id:"github_issue",
      name:"GitHub Issue",
      desc:"수동 조치 / 추가 조사가 필요한 경우. 분석 리포트를 GitHub Issue 로 남깁니다.",
      hint:"label: huginn, triage",
      icon:"alert",
    },
  ];
  return (
    <div className="hm-output-grid">
      {outs.map(o => (
        <button key={o.id} type="button"
                className={`hm-output-card ${value === o.id ? "is-on" : ""}`}
                onClick={() => onChange(o.id)}>
          <span className="hm-output-icon"><Icon name={o.icon} size={18}/></span>
          <div className="hm-output-body">
            <div className="hm-output-name">
              {o.name}
              {o.tag && <span className="hm-output-tag">{o.tag}</span>}
            </div>
            <div className="hm-output-desc">{o.desc}</div>
            <div className="hm-output-hint mono">{o.hint}</div>
          </div>
          <span className="hm-output-radio">
            <span className={`hm-radio-dot ${value === o.id ? "is-on" : ""}`}/>
          </span>
        </button>
      ))}
    </div>
  );
}

function PlatformToolsPicker({ bindings, setBinding, kind }: any) {
  const deploymentTools = [
    { id:"argocd",  name:"ArgoCD",  desc:"GitOps 기반 K8s 배포",  brand:"#EF7B4D", autoFor:["fastapi","triton","other"] },
    { id:"airflow", name:"Airflow", desc:"DAG 오케스트레이션",      brand:"#017CEE", autoFor:["airflow"] },
  ];
  const obsTools = [
    { id:"grafana",         name:"Grafana",         desc:"메트릭 · 로그 · 트레이스 통합 대시보드", brand:"#F46800" },
    { id:"mimir", name:"Mimir", desc:"시계열 메트릭",                          brand:"#E74C3C" },
    { id:"loki",            name:"Loki",            desc:"LogQL 기반 로그 검색",                    brand:"#4D9BB8" },
    { id:"tempo",           name:"Tempo",           desc:"분산 트레이싱",                          brand:"#A88AED" },
    { id:"pyroscope",       name:"Pyroscope",       desc:"CPU · memory 프로파일링",                 brand:"#E8772E" },
  ];
  const registryTools = [
    { id:"harbor", name:"Harbor", desc:"컨테이너 이미지 레지스트리", brand:"#60B932" },
  ];

  const Group = ({ title, tools }: any) => (
    <div className="hm-pt-group">
      <div className="hm-pt-group-head">{title}</div>
      <div className="hm-pt-group-items">
        {tools.map(it => {
          const recommended = it.autoFor && it.autoFor.includes(kind);
          const on = !!bindings[it.id];
          return (
            <label key={it.id} className={`hm-pt-item ${on ? "is-on" : ""}`}>
              <input type="checkbox" checked={on}
                     onChange={e => setBinding(it.id, e.target.checked)}/>
              <span className="hm-pt-checkbox">
                <span className="hm-pt-checkmark"><Icon name="check" size={11}/></span>
              </span>
              <span className="hm-pt-brand" style={{background: it.brand}}/>
              <div className="hm-pt-body">
                <div className="hm-pt-name">
                  {it.name}
                  {recommended && <span className="hm-pt-rec">권장</span>}
                </div>
                <div className="hm-pt-desc">{it.desc}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="hm-pt-picker">
      <div className="hm-pt-required">
        <Icon name="check" size={14}/>
        <span><b>GitHub</b> 은 모든 Application 에 자동으로 연결됩니다. (필수)</span>
      </div>
      <Group title="Deployment" tools={deploymentTools}/>
      <Group title="Observability" tools={obsTools}/>
      <Group title="Registry" tools={registryTools}/>
    </div>
  );
}

function SeverityRow({ value, onChange }: any) {
  const items = [
    { id:"info",     label:"Info+",     desc:"모든 이벤트 (노이즈 많음)" },
    { id:"warning",  label:"Warning+",  desc:"기본값 · 적절히 필터링" },
    { id:"error",    label:"Error+",    desc:"실제 장애 의심" },
    { id:"critical", label:"Critical",  desc:"긴급 alarm 만" },
  ];
  return (
    <div className="hm-sev-row">
      {items.map(it => (
        <button key={it.id} type="button"
                className={`hm-sev-btn ${value === it.id ? "is-on" : ""}`}
                onClick={() => onChange(it.id)}>
          <span className="hm-sev-radio">
            <span className={`hm-radio-dot ${value === it.id ? "is-on" : ""}`}/>
          </span>
          <div className="hm-sev-meta">
            <div className="hm-sev-lbl">{it.label}</div>
            <div className="hm-sev-desc">{it.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function NewAppPreview({ form, ws, canSubmit, errors }: any) {
  const initials = (form.name.split("-").map(s => s[0]).slice(0,2).join("") || "?").toUpperCase();
  const bound = Object.entries(form.bindings).filter(([,v]) => v).map(([k]) => k);
  const sevColor = {
    info:"var(--on-surface-muted)", warning:"var(--warning-50)",
    error:"var(--error-50)", critical:"var(--error-50)",
  }[form.severityThreshold];

  return (
    <div className="hm-newapp-preview">
      <div className="hm-newapp-preview-head">
        <span>미리보기</span>
        <span className="hm-newapp-preview-status">
          <span className={`hm-newapp-preview-dot ${canSubmit ? "is-ok" : ""}`}/>
          {canSubmit ? "등록 준비됨" : `${Object.keys(errors).length}개 필수 입력`}
        </span>
      </div>

      <div className="hm-newapp-preview-card">
        <div className="hm-newapp-preview-name">
          <span className="hm-newapp-preview-avatar">{initials}</span>
          <div style={{minWidth:0, flex:1}}>
            <div className="hm-newapp-preview-app">
              {form.name || <span style={{color:"var(--on-surface-muted)", fontWeight:500}}>이름 미입력</span>}
            </div>
            <div className="hm-newapp-preview-ws">{ws.name}</div>
          </div>
        </div>

        <dl className="hm-newapp-preview-meta">
          <dt>종류</dt>
          <dd><Badge tone="default">{form.kind}</Badge></dd>

          <dt>결과</dt>
          <dd style={{color: form.output === "pull_request" ? "var(--primary-40)" : "var(--muninn-700)", fontWeight:600}}>
            {form.output === "pull_request" ? "Pull Request" : "GitHub Issue"}
          </dd>

          <dt>저장소</dt>
          <dd className="mono" style={{wordBreak:"break-all"}}>{form.repo || "—"}</dd>

          <dt>심각도</dt>
          <dd>
            <span className="hm-newapp-preview-sev-dot" style={{background: sevColor}}/>
            {form.severityThreshold}
          </dd>

          <dt>도구</dt>
          <dd>
            <span className="hm-newapp-preview-tools">
              <span className="hm-newapp-preview-tool github">GitHub</span>
              {bound.slice(0,4).map(t => (
                <span key={t} className="hm-newapp-preview-tool">{t}</span>
              ))}
              {bound.length > 4 && <span className="hm-newapp-preview-tool more">+{bound.length - 4}</span>}
            </span>
          </dd>

          <dt>한도</dt>
          <dd className="mono" style={{fontSize:12}}>
            {form.maxIters} iter · ${form.maxCostUsd} · {form.dailyRunCap}/day
          </dd>
        </dl>
      </div>

      <div className="hm-newapp-preview-tip">
        <Icon name="info" size={14}/>
        <div>
          등록 직후 첫 webhook 호출까지는 <b style={{color:"var(--on-surface)"}}>약 30초</b> 가 걸립니다.
          이후 secret · custom prompt · 추가 도구는 상세 페이지에서 편집할 수 있어요.
        </div>
      </div>
    </div>
  );
}

export { HmNewApp };
