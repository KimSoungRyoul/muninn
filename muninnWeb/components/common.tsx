"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { BRAND_LOGO_PATH, BRAND_LOGO_VIEWBOX } from "@/components/logo-data";
import { DEMO_NOW } from "@/lib/demo-clock";
// Huginn & Muninn — custom components and shared utils

const { useState: useS_HM } = React;

// ---------- Formatters ----------
const fmtMoney = (n) => `$${n.toFixed(2)}`;
const fmtTokens = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : `${n}`;
const fmtDuration = (s) => {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2,"0")}m ${String(sec).padStart(2,"0")}s`;
};
// mock 데이터의 모든 timestamp 는 DEMO_NOW 기준 상대값이므로,
// 실제 벽시계(Date.now())가 아니라 DEMO_NOW 를 기준으로 경과시간을 계산한다.
// (그렇지 않으면 데모 시각과 현재 시각의 차이만큼 "17d ago" 처럼 잘못 표시된다.)
const fmtTimeAgo = (iso) => {
  const d = Math.max(0, (DEMO_NOW.getTime() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
};
const fmtClock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour12: false });

// ---------- StatusDot ----------
function StatusDot({ status }: any) {
  return <span className={`status-dot is-${status}`} aria-label={status}></span>;
}
function StatusLabel({ status, children }: any) {
  return <span className="status-label"><StatusDot status={status}/>{children || status}</span>;
}

// ---------- Run status → 한국어 라벨 (단일 소스) ----------
// HuginnRun status(소문자) → 콘솔 표시 라벨. 콘솔 곳곳의 인라인 삼항/지역 맵을 여기로 통합.
const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "대기 중",
  running: "실행 중",
  awaiting: "승인 대기",
  succeeded: "성공",
  failed: "실패",
  cancelled: "취소",
};
function runStatusLabel(status: string): string {
  return RUN_STATUS_LABEL[status] ?? status;
}

// ---------- HuginnIssue phase(PascalCase) → status-dot 클래스 + 한국어 라벨 (단일 소스) ----------
// 서버 전용 lib/incidents.ts 의 PHASE_TO_STATUS 와 같은 매핑이지만, "use client" 컴포넌트가
// 직접 import 할 수 있도록 여기에 둔다(서버 모듈은 클라이언트에서 import 불가).
const PHASE_TO_STATUS: Record<string, string> = {
  Pending: "queued",
  Queued: "queued",
  Running: "running",
  AwaitingApproval: "awaiting",
  Succeeded: "succeeded",
  Failed: "failed",
  Cancelled: "cancelled",
};
const PHASE_LABEL: Record<string, string> = {
  Pending: "대기",
  Queued: "대기",
  Running: "진행 중",
  AwaitingApproval: "승인 대기",
  Succeeded: "완료",
  Failed: "실패",
  Cancelled: "취소",
};

// ---------- 앱 슬러그 → 이니셜 (단일 소스) ----------
// "foo-bar-baz" → "FB" (하이픈 구분 토큰의 첫 글자 2개 대문자). 빈 입력은 빈 문자열.
function appInitials(name: string): string {
  return name.split("-").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

// ---------- RuneGlyph ----------
const RUNES = {
  dashboard: "ᛟ",  // Othala — homeland
  apps: "ᛗ",       // Mannaz — man / community
  runs: "ᚺ",       // Hagalaz — Huginn
  events: "ᛟ",
  memories: "ᛗ",   // Muninn nest
  platform: "ᚦ",   // Thurisaz — gateway
  settings: "ᛟ",
};
function RuneGlyph({ name }: any) {
  return <span className="rune">{RUNES[name] || "ᛟ"}</span>;
}

// ===========================================================
//  Raven Logos — Huginn (사고) & Muninn (기억)
// ===========================================================
//  RavenSilhouette: single closed silhouette path, profile facing LEFT,
//  one color (--on-surface, theme-aware), optional ground line + two legs.
//  Huginn = silhouette as-is + spark above head.
//  Muninn = same silhouette mirrored to face right + dashed orbit (memory).

function RavenSilhouette({ color, withGround = true }: any) {
  return (
    <g>
      {/* Ground line */}
      {withGround && <rect x="22" y="89" width="34" height="1.4" rx="0.4" fill={color}/>}

      {/* Raven — single closed silhouette path, profile facing LEFT */}
      <path
        fill={color}
        fillRule="evenodd"
        d="
          M 8 38
          Q 18 30, 30 28
          Q 42 22, 54 24
          Q 66 28, 72 38
          Q 80 48, 84 60
          L 96 80
          L 86 84
          L 70 72
          Q 60 76, 52 76
          L 52 89
          L 49 89
          L 49 76
          L 44 76
          L 40 89
          L 37 89
          L 37 76
          Q 30 74, 28 64
          Q 26 56, 28 48
          L 24 46
          L 30 44
          L 22 40
          L 30 38
          L 22 36
          L 8 38
          Z
        "
      />

      {/* Eye */}
      <circle cx="38" cy="32" r="1.6" fill="white"/>
    </g>
  );
}

function HuginnLogo({ size = 64, color, withGlow = true, withGround = true }: any) {
  const c = color || "var(--on-surface)";
  const accent = "var(--huginn-500)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Huginn · 사고">
      {withGlow && (
        <path
          d="M 16 4 L 18 11 L 25 13 L 18 15 L 16 22 L 14 15 L 7 13 L 14 11 Z"
          fill={accent}
        />
      )}
      <RavenSilhouette color={c} withGround={withGround}/>
    </svg>
  );
}

function MuninnLogo({ size = 64, color, withGlow = true, withGround = true }: any) {
  const c = color || "var(--on-surface)";
  const accent = "var(--muninn-500)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Muninn · 기억">
      {withGlow && (
        <g>
          <ellipse cx="78" cy="12" rx="9" ry="3.4" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="3 2.6"/>
          <circle cx="78" cy="12" r="1.8" fill={accent}/>
        </g>
      )}
      {/* Mirror to face right for Muninn (looking back to memory) */}
      <g transform="translate(100 0) scale(-1 1)">
        <RavenSilhouette color={c} withGround/>
      </g>
    </svg>
  );
}

// Backwards-compat
function RavenMark({ which = "huginn", size = 16, color }: any) {
  const Comp = which === "muninn" ? MuninnLogo : HuginnLogo;
  return <Comp size={size} color={color} withGlow={size >= 32}/>;
}

// ===========================================================
//  BrandLogo — user-uploaded two-raven artwork, tintable via CSS mask
// ===========================================================
function BrandLogo({ size = 36, color, title = "Muninn — DevOps Agent Platform" }: any) {
  // Source artwork aspect: 1151 × 1000. Inline SVG so it tints with currentColor.
  const h = Math.round(size * (1000 / 1151));
  return (
    <svg
      role="img"
      aria-label={title}
      width={size}
      height={h}
      viewBox={BRAND_LOGO_VIEWBOX || "0 0 1151 1000"}
      fill={color || "currentColor"}
      fillRule="evenodd"
      style={{display:"inline-block", flexShrink:0}}
    >
      <title>{title}</title>
      <path d={BRAND_LOGO_PATH || ""}/>
    </svg>
  );
}

// ---------- CostMeter / IterMeter ----------
function Meter({ label, current, cap, format = (v) => v, tone, unit }: any) {
  const pct = Math.min(100, Math.round((current / cap) * 100));
  const t = tone || (pct > 90 ? "is-danger" : pct > 70 ? "is-warn" : "");
  return (
    <div className={`hm-meter ${t}`}>
      <div className="row">
        <span className="lbl">{label}</span>
        <span className="val">{format(current)}{unit ? <span style={{color:"var(--on-surface-muted)"}}>{unit}</span> : null} <span style={{color:"var(--on-surface-muted)"}}>/ {format(cap)}{unit || ""}</span></span>
      </div>
      <div className="bar"><span style={{width: `${pct}%`}}></span></div>
    </div>
  );
}

// ---------- JsonViewer (mini, syntax-highlighted) ----------
// HTML 엔티티 이스케이프 — dangerouslySetInnerHTML 주입 전 값에 든 &, <, > 를 무력화한다.
// (JSON 구조 문자인 따옴표/콜론/숫자는 건드리지 않아 아래 하이라이트 정규식이 그대로 동작한다.)
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function highlightJson(obj) {
  // obj 가 undefined 면 JSON.stringify 가 값 undefined 를 돌려줘 escapeHtml 이 throw 하므로 null 로 보정.
  const s = escapeHtml(JSON.stringify(obj ?? null, null, 2));
  return s
    .replace(/("[^"]+"):/g, '<span class="json-key">$1</span><span class="json-punct">:</span>')
    .replace(/: ("[^"]*")/g, ': <span class="json-str">$1</span>')
    .replace(/: (true|false|null)/g, ': <span class="json-bool">$1</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="json-num">$1</span>');
}
function JsonViewer({ data, collapsed = false }: any) {
  const [open, setOpen] = useS_HM(!collapsed);
  if (!open) {
    return (
      <div className="hm-tool-result-collapsed" onClick={() => setOpen(true)}>
        <Icon name="chevronRight" size={12}/>
        <span>결과 펼치기 · <span className="hm-mono" style={{color:"var(--on-surface-variant)"}}>{Object.keys(data || {}).length}개 키</span></span>
      </div>
    );
  }
  return (
    <div className="hm-tool-body" dangerouslySetInnerHTML={{__html: highlightJson(data)}}/>
  );
}

// ---------- StackedBars (run flow) ----------
function StackedBars({ buckets, w = 720, h = 120 }: any) {
  // buckets: [{succ, fail, await}]
  const padL = 8, padR = 8, padT = 8, padB = 18;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const max = Math.max(...buckets.map(b => (b.succ + b.fail + b.await))) || 1;
  const bw = (cw / buckets.length) * 0.78;
  const gap = (cw / buckets.length) * 0.22;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
      <line x1={padL} x2={w - padR} y1={padT + ch} y2={padT + ch} stroke="var(--border-subtle)"/>
      {buckets.map((b, i) => {
        const total = b.succ + b.fail + b.await;
        const x = padL + i * (cw / buckets.length) + gap / 2;
        const totalH = (total / max) * ch;
        let y = padT + ch;
        const segs = [
          {v: b.succ, c: "var(--positive-50)"},
          {v: b.fail, c: "var(--error-50)"},
          {v: b.await, c: "var(--warning-50)"},
        ];
        return (
          <g key={i}>
            {segs.map((s, si) => {
              const sh = (s.v / max) * ch;
              y -= sh;
              return <rect key={si} x={x} y={y} width={bw} height={Math.max(sh - 0.5, 0)} fill={s.c} rx={si === segs.length - 1 ? 1 : 0}/>;
            })}
          </g>
        );
      })}
      {/* x-labels every 6 */}
      {buckets.map((b, i) => i % 6 === 0 && (
        <text key={i} x={padL + i * (cw / buckets.length) + bw/2} y={h - 5} fontSize="9" fill="var(--on-surface-muted)" textAnchor="middle" fontFamily="var(--font-mono)">{b.label}</text>
      ))}
    </svg>
  );
}

// ---------- Health dots row ----------
function HealthDots({ services }: any) {
  return (
    <span className="seg">
      {services.map((s) => (
        <span key={s.name} className="tooltip-wrap hm-health-item">
          <StatusDot status={s.status}/>
          <span className={`hm-health-label${s.status === "healthy" ? "" : " is-down"}`}>{s.name}</span>
        </span>
      ))}
    </span>
  );
}

// ---------- Page header ----------
function HmPageHead({ rune, title, sub, children }: any) {
  return (
    <div className="hm-page-head">
      <div className="lead">
        {rune && <RuneGlyph name={rune}/>}
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ---------- KPI card (ops style) ----------
function HmKpi({ label, value, unit, delta, dir, hint, accent, link }: any) {
  const Wrap = link ? "a" : "div";
  const linkProps = link ? { href: "#", onClick: (e) => { e.preventDefault(); link(); }, style: { cursor: "pointer", textDecoration: "none" } } : {};
  return (
    <Wrap className={`hm-kpi ${accent ? `is-${accent}` : ""}`} {...linkProps}>
      <div className="label">
        {label}
        {accent === "amber" && <span style={{color:"var(--huginn-500)"}}><Icon name="alert" size={12}/></span>}
      </div>
      <div className="value">
        {value}
        {unit && <span className="u">{unit}</span>}
      </div>
      {delta != null && (
        <div className={`delta ${dir === "up" ? "up" : "down"}`}>
          <Icon name={dir === "up" ? "arrowUp" : "arrowDown"} size={10}/>
          {Math.abs(delta)}{typeof delta === "number" && delta % 1 !== 0 ? "pp" : "%"}
          <span className="vs">vs yesterday</span>
        </div>
      )}
      {hint && <div className="hint">{hint}</div>}
    </Wrap>
  );
}

// ---------- Card shell ----------
function HmCard({ title, meta, children, action, flush }: any) {
  return (
    <div className="hm-card">
      {(title || meta || action) && (
        <div className="hm-card-head">
          <div>
            {title && <div className="title">{title}</div>}
          </div>
          <div className="flex items-center gap-2">
            {meta && <span className="meta">{meta}</span>}
            {action}
          </div>
        </div>
      )}
      <div className={`hm-card-body ${flush ? "flush" : ""}`}>{children}</div>
    </div>
  );
}

export { fmtMoney, fmtTokens, fmtDuration, fmtTimeAgo, fmtClock,
  StatusDot, StatusLabel, runStatusLabel, RUN_STATUS_LABEL,
  PHASE_TO_STATUS, PHASE_LABEL, appInitials, escapeHtml,
  RuneGlyph, RavenMark, HuginnLogo, MuninnLogo, BrandLogo,
  Meter, JsonViewer, StackedBars, HealthDots,
  HmPageHead, HmKpi, HmCard, highlightJson,
};
