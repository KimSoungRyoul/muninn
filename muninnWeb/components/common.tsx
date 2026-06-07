"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { Sparkline, IconButton } from "@/components/ui";
import { BRAND_LOGO_PATH, BRAND_LOGO_VIEWBOX } from "@/components/logo-data";
// Huginn & Muninn — custom components and shared utils

const { useState: useS_HM, useEffect: useE_HM, useRef: useR_HM, useMemo: useM_HM } = React;

// ---------- Formatters ----------
const fmtMoney = (n) => `$${n.toFixed(2)}`;
const fmtMoneyK = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
const fmtTokens = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : `${n}`;
const fmtDuration = (s) => {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2,"0")}m ${String(sec).padStart(2,"0")}s`;
};
const fmtTimeAgo = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
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
//   Heavier raven character:
//     · long massive beak with hook
//     · jagged throat hackle
//     · wedge tail
//     · solid silhouette, one color
//   Huginn (right-facing) + spark above   ·  Muninn (left-facing) + dashed orbit

// ===========================================================
//  Raven Logos — Huginn (사고) & Muninn (기억)
// ===========================================================
//  Stocky perched raven inspired by classic corvid heraldry:
//    · large rounded body, back arched up over shoulder
//    · smaller head atop, heavy hooked beak forward
//    · tail wedge extending back/down past body
//    · jagged throat hackle, two thin legs on ground mound
//    · color: --on-surface (near-black, theme-aware)
//    · differentiator: spark above head (Huginn) or dashed orbit (Muninn)

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

// Lockup — pair facing inward
function RavenLockup({ size = 64, withWordmark = true }: any) {
  const ravenSize = size * 0.78;
  return (
    <div style={{display:"inline-flex", alignItems:"center", gap: size * 0.14}}>
      <MuninnLogo size={ravenSize} withGlow={false}/>
      {withWordmark && (
        <span style={{
          fontFamily:"var(--font-sans)",
          fontWeight: 800,
          fontSize: size * 0.4,
          color: "var(--on-surface)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}>
          &amp;
        </span>
      )}
      <HuginnLogo size={ravenSize} withGlow={false}/>
    </div>
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

// ---------- Sparkline (improved) ----------
function HmSpark({ data, w = 80, h = 22, color = "var(--huginn-500)", fill = true }: any) {
  return <Sparkline data={data} w={w} h={h} color={color} fill={fill}/>;
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
      {services.map((s, i) => (
        <span key={s.name} className="tooltip-wrap" style={{display:"inline-flex",alignItems:"center",gap:4}}>
          <StatusDot status={s.status}/>
          <span style={{fontSize:10, color: s.status === "healthy" ? "var(--on-surface-variant)" : "var(--error-55)"}}>{s.name}</span>
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

// ---------- Announcement banner ----------
function HmAnnounce({ tone = "info", icon, title, desc, actionLabel, onAction, onDismiss }: any) {
  const [open, setOpen] = useS_HM(true);
  if (!open) return null;
  const defaultIcon = tone === "warning" ? "alert" : tone === "success" ? "checkCircle" : "sparkle";
  return (
    <div className={`hm-announce tone-${tone}`} role="status">
      <span className="ico"><Icon name={icon || defaultIcon} size={16}/></span>
      <div className="body">
        {title && <div className="title">{title}</div>}
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div className="actions">
        {actionLabel && <a href="#" onClick={e => { e.preventDefault(); onAction?.(); }}>{actionLabel}</a>}
        <IconButton icon="close" size="sm" onClick={() => { setOpen(false); onDismiss?.(); }}/>
      </div>
    </div>
  );
}

export { fmtMoney, fmtMoneyK, fmtTokens, fmtDuration, fmtTimeAgo, fmtClock,
  StatusDot, StatusLabel, RuneGlyph, RavenMark, HuginnLogo, MuninnLogo, RavenLockup, BrandLogo,
  Meter, JsonViewer, HmSpark, StackedBars, HealthDots,
  HmPageHead, HmKpi, HmCard, highlightJson, HmAnnounce,
};
