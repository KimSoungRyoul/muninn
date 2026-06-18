"use client";
import React from "react";
import { Icon } from "@/components/icons";

// Reusable UI primitives. Globals via window.

// ---------- Buttons ----------
function Button({ variant = "primary", size, leftIcon, rightIcon, children, ...rest }: any) {
  const cls = ["btn", `btn-${variant}`, size && `btn-${size}`].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {leftIcon && <Icon name={leftIcon} size={size === "sm" ? 14 : 16} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}
function IconButton({ icon, size = "md", tooltip, "aria-label": ariaLabel, ...rest }: any) {
  const sz = size === "sm" ? 16 : size === "lg" ? 20 : 18;
  // 아이콘 전용 버튼은 접근 가능한 이름이 필요하다 — aria-label 우선, 없으면 tooltip 으로 보강.
  const btn = (
    <button className={`btn btn-icon ${size !== "md" ? `btn-${size}` : ""}`} aria-label={ariaLabel ?? tooltip} {...rest}>
      <Icon name={icon} size={sz} />
    </button>
  );
  if (!tooltip) return btn;
  return <span className="tooltip-wrap">{btn}<span className="tooltip">{tooltip}</span></span>;
}

// ---------- Inputs ----------
function TextInput({ label, hint, error, leftIcon, id, ...rest }: any) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  const helpId = (hint || error) ? `${fieldId}-help` : undefined;
  const field = (
    <input
      id={fieldId}
      className={`input ${error ? "is-error" : ""}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={helpId}
      {...rest}
    />
  );
  const inp = leftIcon ? (
    <span className="input-with-icon"><Icon name={leftIcon} size={16} />{field}</span>
  ) : field;
  return (
    <div className="input-group">
      {label && <label className="label" htmlFor={fieldId}>{label}</label>}
      {inp}
      {(hint || error) && <span id={helpId} className={`helper ${error ? "is-error" : ""}`}>{error || hint}</span>}
    </div>
  );
}
function Textarea({ label, hint, id, ...rest }: any) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  const helpId = hint ? `${fieldId}-help` : undefined;
  return (
    <div className="input-group">
      {label && <label className="label" htmlFor={fieldId}>{label}</label>}
      <textarea id={fieldId} className="textarea" aria-describedby={helpId} {...rest} />
      {hint && <span id={helpId} className="helper">{hint}</span>}
    </div>
  );
}
function Select({ label, hint, options, id, ...rest }: any) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  const helpId = hint ? `${fieldId}-help` : undefined;
  return (
    <div className="input-group">
      {label && <label className="label" htmlFor={fieldId}>{label}</label>}
      <select id={fieldId} className="select" aria-describedby={helpId} {...rest}>
        {options.map(o => typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span id={helpId} className="helper">{hint}</span>}
    </div>
  );
}

// ---------- Toggle ----------
function Toggle({ checked, onChange, ...rest }: any) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange?.(e.target.checked)} {...rest} />
      <span className="slider"></span>
    </label>
  );
}

// ---------- Badge / Chip ----------
function Badge({ tone = "default", dot, children }: any) {
  return <span className={`badge badge-${tone} ${dot ? "badge-dot" : ""}`}>{children}</span>;
}
function Chip({ active, onClick, children, leftIcon }: any) {
  return (
    <button className={`chip ${active ? "is-active" : ""}`} onClick={onClick}>
      {leftIcon && <Icon name={leftIcon} size={14} />}
      {children}
    </button>
  );
}

// ---------- Avatar ----------
function Avatar({ name, size = "md", src, color }: any) {
  const initials = name ? name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase() : "?";
  const cls = `avatar ${size !== "md" ? `avatar-${size}` : ""}`;
  if (src) return <span className={cls}><img src={src} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={name || ""} /></span>;
  return <span className={cls} style={color ? {background: color, color: "#fff"} : null}>{initials}</span>;
}

// ---------- Tabs ----------
function Tabs({ tabs, value, onChange, pill = false }: any) {
  return (
    <div className={pill ? "tabs-pill" : "tabs"}>
      {tabs.map(t => (
        <button key={t.value} className={`tab ${value === t.value ? "is-active" : ""}`} onClick={() => onChange?.(t.value)}>
          {t.label}
          {t.count != null && <span style={{marginLeft:6,fontSize:11,opacity:0.7}}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Progress ----------
function Progress({ value }: any) {
  return <div className="progress"><div className="progress-bar" style={{width: `${Math.min(100, Math.max(0, value))}%`}}></div></div>;
}

// ---------- Empty ----------
function Empty({ icon = "folder", title, sub, action }: any) {
  return (
    <div className="empty">
      <span className="ico"><Icon name={icon} size={24} /></span>
      <div className="ttl">{title}</div>
      {sub && <div className="sub">{sub}</div>}
      {action && <div style={{marginTop:8}}>{action}</div>}
    </div>
  );
}

// ---------- Sparkline ----------
function Sparkline({ data, color = "var(--primary-50)", w = 96, h = 28, fill = true }: any) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / range) * (h - 4) - 2]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const fillD = fill ? `${d} L${w},${h} L0,${h} Z` : null;
  const id = "sg-" + Math.random().toString(36).slice(2, 8);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <>
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient></defs>
        <path d={fillD} fill={`url(#${id})`} />
      </>}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export {
  Button, IconButton, TextInput, Textarea, Select,
  Toggle,
  Badge, Chip,
  Avatar,
  Tabs,
  Progress, Empty,
  Sparkline,
};
