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
  if (src) return <span className={cls}><img className="avatar-img" src={src} alt={name || ""} /></span>;
  return <span className={cls} style={color ? {background: color, color: "#fff"} : null}>{initials}</span>;
}

// ---------- Tabs ----------
function Tabs({ tabs, value, onChange, pill = false }: any) {
  return (
    <div className={pill ? "tabs-pill" : "tabs"}>
      {tabs.map(t => (
        <button key={t.value} className={`tab ${value === t.value ? "is-active" : ""}`} onClick={() => onChange?.(t.value)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Empty ----------
function Empty({ icon = "folder", title, sub, action }: any) {
  return (
    <div className="empty">
      <span className="ico"><Icon name={icon} size={24} /></span>
      <div className="ttl">{title}</div>
      {sub && <div className="sub">{sub}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

// ---------- Skeleton ----------
// 데이터 fetch 중 빈 화면/0 깜빡임 대신 표시하는 shimmer 플레이스홀더.
// .skeleton 은 테마 토큰 기반이라 라이트/다크 모두 자동 대응(app/styles.css).
function Skeleton({ w = "100%", h = 14, r = 6, style }: any) {
  return <span className="skeleton" style={{ display: "block", width: w, height: h, borderRadius: r, ...style }} aria-hidden />;
}

// hm-table 본문용 스켈레톤 행들 — cols 만큼 셀, rows 만큼 행.
function SkeletonRows({ rows = 5, cols = 4 }: any) {
  return (
    <tbody aria-hidden>
      {Array.from({ length: rows }, (_, ri) => (
        <tr key={ri}>
          {Array.from({ length: cols }, (_, ci) => (
            <td key={ci}><Skeleton w={ci === 1 ? "70%" : ci === 0 ? "60%" : "45%"} h={14} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export {
  Button, IconButton, TextInput, Textarea, Select,
  Toggle,
  Badge, Chip,
  Avatar,
  Tabs,
  Empty,
  Skeleton, SkeletonRows,
};
