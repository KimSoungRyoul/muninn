"use client";
import React from "react";

/* ===== icons.jsx ===== */
// Icon library — Material Symbols Rounded style, 2dp stroke, currentColor
// Usage: <Icon name="home" size={20} />

const ICON_PATHS = {
  home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  menu: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  chevronRight: <polyline points="9 18 15 12 9 6"/>,
  chevronLeft: <polyline points="15 18 9 12 15 6"/>,
  chevronDown: <polyline points="6 9 12 15 18 9"/>,
  chevronUp: <polyline points="18 15 12 9 6 15"/>,
  chevronsUpDown: <><polyline points="7 15 12 20 17 15"/><polyline points="7 9 12 4 17 9"/></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  check: <polyline points="20 6 9 17 4 12"/>,
  more: <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
  moreV: <><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></>,
  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
  mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  alert: <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
  info: <><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  checkCircle: <><path d="M21 11.08V12a9 9 0 1 1-5.34-8.23"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  xCircle: <><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
  arrowUp: <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
  arrowDown: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
  trendUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  trendDown: <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>,
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></>,
  pie: <><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>,
  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>,
  package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  globe: <><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/></>,
  star: <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/>,
  heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  paperclip: <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
  sparkle: <path d="M12 2 L13.5 9 L20.5 10.5 L13.5 12 L12 19 L10.5 12 L3.5 10.5 L10.5 9 Z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
  fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  uploadCloud: <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/></>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
  command: <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>,
  helpCircle: <><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  logOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/></>,
  creditCard: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
  shoppingCart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
  hash: <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
  code: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  gitBranch: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
};

function Icon({ name, size = 20, fill = false, style = {}, className = "" }) {
  const path = ICON_PATHS[name];
  if (!path) return <span style={{width: size, height: size, display: "inline-block", ...style}} />;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{flexShrink: 0, ...style}}
      className={className}
    >
      {path}
    </svg>
  );
}


/* ===== components.jsx ===== */
// Reusable UI primitives. Globals via window.

const { useState, useEffect, useRef, useCallback } = React;

// ---------- Buttons ----------
function Button({ variant = "primary", size, leftIcon, rightIcon, children, ...rest }) {
  const cls = ["btn", `btn-${variant}`, size && `btn-${size}`].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {leftIcon && <Icon name={leftIcon} size={size === "sm" ? 14 : 16} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}
function IconButton({ icon, size = "md", tooltip, ...rest }) {
  const sz = size === "sm" ? 16 : size === "lg" ? 20 : 18;
  const btn = (
    <button className={`btn btn-icon ${size !== "md" ? `btn-${size}` : ""}`} {...rest}>
      <Icon name={icon} size={sz} />
    </button>
  );
  if (!tooltip) return btn;
  return <span className="tooltip-wrap">{btn}<span className="tooltip">{tooltip}</span></span>;
}

// ---------- Inputs ----------
function TextInput({ label, hint, error, leftIcon, ...rest }) {
  const inp = leftIcon ? (
    <span className="input-with-icon"><Icon name={leftIcon} size={16} /><input className={`input ${error ? "is-error" : ""}`} {...rest} /></span>
  ) : (
    <input className={`input ${error ? "is-error" : ""}`} {...rest} />
  );
  return (
    <div className="input-group">
      {label && <label className="label">{label}</label>}
      {inp}
      {(hint || error) && <span className={`helper ${error ? "is-error" : ""}`}>{error || hint}</span>}
    </div>
  );
}
function Textarea({ label, hint, ...rest }) {
  return (
    <div className="input-group">
      {label && <label className="label">{label}</label>}
      <textarea className="textarea" {...rest} />
      {hint && <span className="helper">{hint}</span>}
    </div>
  );
}
function Select({ label, hint, options, ...rest }) {
  return (
    <div className="input-group">
      {label && <label className="label">{label}</label>}
      <select className="select" {...rest}>
        {options.map(o => typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span className="helper">{hint}</span>}
    </div>
  );
}

// ---------- Toggle / Checkbox / Radio ----------
function Toggle({ checked, onChange, ...rest }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange?.(e.target.checked)} {...rest} />
      <span className="slider"></span>
    </label>
  );
}
function Checkbox({ checked, onChange, label, ...rest }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={e => onChange?.(e.target.checked)} {...rest} />
      <span className="box"></span>
      {label && <span>{label}</span>}
    </label>
  );
}
function Radio({ checked, onChange, name, value, label }) {
  return (
    <label className="radio">
      <input type="radio" checked={checked} onChange={() => onChange?.(value)} name={name} value={value} />
      <span className="box"></span>
      {label && <span>{label}</span>}
    </label>
  );
}

// ---------- Badge / Tag / Chip ----------
function Badge({ tone = "default", dot, children }) {
  return <span className={`badge badge-${tone} ${dot ? "badge-dot" : ""}`}>{children}</span>;
}
function Chip({ active, onClick, children, leftIcon }) {
  return (
    <button className={`chip ${active ? "is-active" : ""}`} onClick={onClick}>
      {leftIcon && <Icon name={leftIcon} size={14} />}
      {children}
    </button>
  );
}
function Tag({ children, removable, onRemove }) {
  return (
    <span className={`tag ${removable ? "tag-removable" : ""}`}>
      {children}
      {removable && <span className="x" onClick={onRemove}><Icon name="close" size={12} /></span>}
    </span>
  );
}

// ---------- Avatar ----------
function Avatar({ name, size = "md", src, color }) {
  const initials = name ? name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase() : "?";
  const cls = `avatar ${size !== "md" ? `avatar-${size}` : ""}`;
  if (src) return <span className={cls}><img src={src} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="" /></span>;
  return <span className={cls} style={color ? {background: color, color: "#fff"} : null}>{initials}</span>;
}
function AvatarStack({ users, max = 4 }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((u, i) => <Avatar key={i} name={u.name} size="sm" color={u.color} />)}
      {rest > 0 && <span className="avatar avatar-sm" style={{background:"var(--surface-container)",color:"var(--on-surface-variant)"}}>+{rest}</span>}
    </span>
  );
}

// ---------- Tabs ----------
function Tabs({ tabs, value, onChange, pill = false }) {
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

// ---------- Modal ----------
function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onEsc = e => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><div className="modal-title">{title}</div></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Dropdown ----------
function Dropdown({ trigger, children, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{position:"relative",display:"inline-block"}}>
      <span onClick={() => setOpen(o => !o)}>{trigger}</span>
      {open && (
        <div className="menu" style={{position:"absolute", [align]: 0, top: "calc(100% + 6px)"}} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
function MenuItem({ icon, danger, children, ...rest }) {
  return <div className={`menu-item ${danger ? "is-danger" : ""}`} {...rest}>
    {icon && <Icon name={icon} size={16} />}<span>{children}</span>
  </div>;
}

// ---------- Pagination ----------
function Pagination({ page, total, onChange }) {
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, total - 4));
  const end = Math.min(total, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="pagination">
      <button className="pg-btn" disabled={page === 1} onClick={() => onChange(page - 1)}><Icon name="chevronLeft" size={16}/></button>
      {start > 1 && <><button className="pg-btn" onClick={() => onChange(1)}>1</button><span className="pg-btn" style={{cursor:"default"}}>…</span></>}
      {pages.map(p => <button key={p} className={`pg-btn ${p === page ? "is-active" : ""}`} onClick={() => onChange(p)}>{p}</button>)}
      {end < total && <><span className="pg-btn" style={{cursor:"default"}}>…</span><button className="pg-btn" onClick={() => onChange(total)}>{total}</button></>}
      <button className="pg-btn" disabled={page === total} onClick={() => onChange(page + 1)}><Icon name="chevronRight" size={16}/></button>
    </div>
  );
}

// ---------- Breadcrumb ----------
function Breadcrumb({ items }) {
  return (
    <nav className="breadcrumb">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon name="chevronRight" size={12} className="sep" style={{color:"var(--neutral-78)"}} />}
          {i === items.length - 1 ? <span className="current">{it.label}</span> : <a href="#">{it.label}</a>}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ---------- Progress ----------
function Progress({ value }) {
  return <div className="progress"><div className="progress-bar" style={{width: `${Math.min(100, Math.max(0, value))}%`}}></div></div>;
}

// ---------- Toast ----------
function Toast({ tone = "default", title, desc }) {
  const ico = tone === "success" ? "checkCircle" : tone === "error" ? "xCircle" : tone === "warning" ? "alert" : "info";
  const color = tone === "success" ? "var(--positive-55)" : tone === "error" ? "var(--error-55)" : tone === "warning" ? "var(--warning-55)" : "var(--primary-65)";
  return (
    <div className="toast">
      <Icon name={ico} size={18} className="icon" style={{color}} />
      <div className="body">
        <div className="title">{title}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
    </div>
  );
}

// ---------- Empty ----------
function Empty({ icon = "folder", title, sub, action }) {
  return (
    <div className="empty">
      <span className="ico"><Icon name={icon} size={24} /></span>
      <div className="ttl">{title}</div>
      {sub && <div className="sub">{sub}</div>}
      {action && <div style={{marginTop:8}}>{action}</div>}
    </div>
  );
}

// ---------- Skeleton ----------
function Skeleton({ w = "100%", h = 12, r = 4, style = {} }) {
  return <div className="skeleton" style={{width: w, height: h, borderRadius: r, ...style}} />;
}

// ---------- Sparkline ----------
function Sparkline({ data, color = "var(--primary-50)", w = 96, h = 28, fill = true }) {
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

// ---------- Calendar ----------
function Calendar({ value, onChange }) {
  const [view, setView] = useState(() => value || new Date(2026, 3, 1));
  const sel = value;
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const monthName = view.toLocaleString("en-US", {month: "long", year: "numeric"});
  const cells = [];
  for (let i = startDay - 1; i >= 0; i--) cells.push({d: prevDays - i, other: true});
  for (let d = 1; d <= days; d++) cells.push({d, other: false});
  while (cells.length < 42) cells.push({d: cells.length - days - startDay + 1, other: true, after: true});
  const today = new Date();
  const isSame = (a, b) => a && b && a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return (
    <div className="cal">
      <div className="cal-head">
        <IconButton icon="chevronLeft" size="sm" onClick={() => setView(new Date(y, m - 1, 1))} />
        <span className="mo">{monthName}</span>
        <IconButton icon="chevronRight" size="sm" onClick={() => setView(new Date(y, m + 1, 1))} />
      </div>
      <div className="cal-grid">
        {["S","M","T","W","T","F","S"].map((d, i) => <span key={i} className="dn">{d}</span>)}
        {cells.map((c, i) => {
          const realDate = c.other ? null : new Date(y, m, c.d);
          const isToday = realDate && isSame(realDate, today);
          const isSel = realDate && isSame(realDate, sel);
          return (
            <button key={i} className={`cal-cell ${c.other ? "is-other" : ""} ${isToday ? "is-today" : ""} ${isSel ? "is-selected" : ""}`} onClick={() => realDate && onChange?.(realDate)}>
              {c.d}
            </button>
          );
        })}
      </div>
    </div>
  );
}



/* ===== charts.jsx ===== */
// Lightweight SVG charts: Line, Bar, Donut, Heatmap

const NAV_COLOR = "var(--primary-50)";

function LineChart({ series, w = 720, h = 240, labels, yTicks = 4 }) {
  const padL = 36, padB = 28, padT = 12, padR = 12;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const all = series.flatMap(s => s.data);
  const max = Math.max(...all);
  const niceMax = Math.ceil(max / 100) * 100 || 10;
  const min = 0;
  const xs = (i, n) => padL + (i / (n - 1)) * cw;
  const ys = v => padT + ch - ((v - min) / (niceMax - min)) * ch;
  const colors = ["var(--primary-50)", "var(--whalegreen-50)", "var(--bookmark-50)"];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
      {/* y grid */}
      {Array.from({length: yTicks + 1}).map((_, i) => {
        const v = (niceMax / yTicks) * (yTicks - i);
        const y = padT + (ch / yTicks) * i;
        return (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray={i === yTicks ? "" : "3 3"}/>
            <text x={padL - 6} y={y + 3} fontSize="10" fill="var(--on-surface-muted)" textAnchor="end" fontFamily="var(--font-mono)">{Math.round(v).toLocaleString()}</text>
          </g>
        );
      })}
      {/* x labels */}
      {labels && labels.map((l, i) => (
        <text key={i} x={xs(i, labels.length)} y={h - 8} fontSize="10" fill="var(--on-surface-muted)" textAnchor="middle">{l}</text>
      ))}
      {/* lines */}
      {series.map((s, si) => {
        const c = s.color || colors[si % colors.length];
        const id = "lc-" + si;
        const d = s.data.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i, s.data.length).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
        const fillD = `${d} L${xs(s.data.length - 1, s.data.length).toFixed(1)},${padT + ch} L${padL},${padT + ch} Z`;
        return (
          <g key={si}>
            <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={si === 0 ? "0.18" : "0.0"}/>
              <stop offset="100%" stopColor={c} stopOpacity="0"/>
            </linearGradient></defs>
            {si === 0 && <path d={fillD} fill={`url(#${id})`} />}
            <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            {s.data.map((v, i) => <circle key={i} cx={xs(i, s.data.length)} cy={ys(v)} r="2.5" fill="var(--surface)" stroke={c} strokeWidth="1.6"/>)}
          </g>
        );
      })}
    </svg>
  );
}

function BarChart({ data, labels, w = 720, h = 220, color = "var(--primary-50)" }) {
  const padL = 36, padB = 28, padT = 12, padR = 12;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const max = Math.max(...data);
  const niceMax = Math.ceil(max / 100) * 100 || 10;
  const bw = (cw / data.length) * 0.6;
  const gap = (cw / data.length) * 0.4;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
      {Array.from({length: 5}).map((_, i) => {
        const y = padT + (ch / 4) * i;
        const v = (niceMax / 4) * (4 - i);
        return (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--border-subtle)" strokeDasharray={i === 4 ? "" : "3 3"}/>
            <text x={padL - 6} y={y + 3} fontSize="10" fill="var(--on-surface-muted)" textAnchor="end" fontFamily="var(--font-mono)">{Math.round(v).toLocaleString()}</text>
          </g>
        );
      })}
      {data.map((v, i) => {
        const x = padL + i * (cw / data.length) + gap / 2;
        const bh = (v / niceMax) * ch;
        const y = padT + ch - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} fill={color} rx="4" />
            {labels && <text x={x + bw / 2} y={h - 8} fontSize="10" fill="var(--on-surface-muted)" textAnchor="middle">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ segments, size = 160, thickness = 22 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  let acc = 0;
  const arcs = segments.map((s, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    return <path key={i} d={`M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`} fill="none" stroke={s.color} strokeWidth={thickness} strokeLinecap="butt" />;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-container)" strokeWidth={thickness}/>
      {arcs}
    </svg>
  );
}

function Heatmap({ data, w, h }) {
  // data: 2D array of numbers
  const rows = data.length, cols = data[0].length;
  const cw = (w || 480) / cols;
  const rh = (h || 100) / rows;
  const max = Math.max(...data.flat());
  return (
    <svg width="100%" viewBox={`0 0 ${cols * cw} ${rows * rh}`} style={{display:"block"}}>
      {data.map((row, r) => row.map((v, c) => {
        const op = v / max;
        return <rect key={`${r}-${c}`} x={c * cw + 1} y={r * rh + 1} width={cw - 2} height={rh - 2} rx="2" fill="var(--primary-50)" fillOpacity={op * 0.85 + 0.05} />;
      }))}
    </svg>
  );
}



/* ===== hm-logo-data.jsx ===== */
// Auto-generated from assets/huginn-muninn.svg
// Path data for the two-raven brand logo (viewBox 0 0 1151 1000, evenodd fill).
const __BRAND_LOGO_PATH = "M52.5 0.0L80.6 -0.7L82.0 0.7L92.1 0.7L93.5 2.2L110.8 3.6L112.2 5.0L123.7 5.0L125.2 3.6L135.2 3.6L136.7 2.2L139.6 2.2L141.0 3.6L148.2 3.6L149.6 5.0L153.9 5.0L155.4 6.5L158.3 6.5L162.6 9.4L165.5 9.4L171.2 12.2L175.5 12.2L177.0 10.8L185.6 9.4L187.0 7.9L194.2 7.9L195.7 6.5L214.4 6.5L215.8 7.9L221.6 7.9L223.0 9.4L233.1 10.8L237.4 13.7L240.3 13.7L257.5 22.3L260.4 25.2L270.5 30.9L277.7 38.1L279.1 38.1L295.7 54.7L295.7 56.1L302.9 63.3L302.9 64.7L312.9 76.3L312.9 77.7L324.4 93.5L330.2 105.0L333.1 107.9L335.9 115.1L338.8 118.0L347.5 135.3L350.3 138.1L349.6 140.3L342.4 134.5L338.1 133.1L333.8 128.8L333.1 129.5L344.6 152.5L347.5 155.4L351.8 164.0L361.8 175.5L361.8 177.0L377.0 192.1L378.4 192.1L382.7 196.4L392.8 202.2L395.7 202.2L397.1 203.6L400.0 203.6L405.7 206.5L410.0 206.5L411.5 207.9L415.8 207.9L417.2 209.4L421.6 209.4L423.0 210.8L427.3 210.8L428.7 212.2L433.1 212.2L438.8 215.1L443.1 215.1L444.6 216.5L447.5 216.5L453.2 219.4L461.8 220.9L466.2 223.7L469.0 223.7L473.3 226.6L476.2 226.6L490.6 233.8L493.5 236.7L497.8 238.1L500.7 241.0L510.8 246.8L515.1 251.1L520.8 254.0L526.6 259.7L528.0 259.7L533.8 265.5L535.2 265.5L541.0 271.2L542.4 271.2L549.6 278.4L551.0 278.4L558.2 285.6L559.7 285.6L584.1 308.6L585.6 308.6L604.3 327.3L605.7 327.3L664.7 384.9L666.1 384.9L673.3 390.6L684.8 396.4L687.7 396.4L700.7 403.6L703.5 403.6L710.7 407.9L713.6 407.9L720.8 412.2L723.7 412.2L733.8 418.0L736.6 418.0L746.7 423.7L749.6 423.7L781.2 439.6L791.3 446.8L798.5 449.6L805.7 455.4L814.3 459.7L822.2 466.2L817.2 466.9L815.8 465.5L805.7 465.5L804.3 464.0L798.5 464.0L797.1 462.6L792.8 462.6L791.3 461.2L789.2 461.9L791.3 464.0L799.9 468.3L802.8 471.2L807.1 472.7L810.0 475.5L817.2 478.4L827.3 485.6L834.5 488.5L837.4 491.4L860.4 502.9L863.3 505.8L923.7 536.0L926.6 536.0L936.6 541.7L939.5 541.7L956.8 550.4L964.0 551.8L968.3 554.7L971.2 554.7L979.8 559.0L982.7 559.0L984.1 560.4L987.0 560.4L988.4 561.9L994.2 563.3L994.9 564.0L989.9 567.6L987.0 567.6L982.7 570.5L978.4 570.5L976.9 571.9L956.8 573.4L955.3 571.9L940.9 571.9L938.1 570.5L937.3 571.2L943.8 576.3L961.1 584.9L964.0 587.8L984.1 597.8L987.0 597.8L997.1 603.6L999.9 603.6L1007.1 607.9L1010.0 607.9L1014.3 610.8L1017.2 610.8L1028.7 616.5L1035.9 618.0L1040.2 620.9L1043.1 620.9L1044.5 622.3L1047.4 622.3L1048.8 623.7L1051.7 623.7L1053.2 625.2L1056.0 625.2L1057.5 626.6L1060.4 626.6L1061.8 628.1L1064.7 628.1L1070.4 630.9L1074.7 630.9L1080.5 633.8L1090.6 635.3L1092.7 637.4L1084.8 643.9L1076.2 648.2L1067.6 649.6L1066.1 651.1L1060.4 651.1L1058.9 652.5L1033.0 652.5L1031.6 651.1L1023.0 651.1L1021.5 649.6L1014.3 649.6L1012.9 648.2L1008.6 648.2L1007.1 646.8L1005.0 647.5L1007.1 649.6L1011.4 651.1L1014.3 654.0L1018.6 655.4L1021.5 658.3L1025.8 659.7L1028.7 662.6L1044.5 669.8L1047.4 672.7L1050.3 672.7L1053.2 675.5L1073.3 685.6L1076.2 685.6L1094.9 695.7L1097.8 695.7L1115.0 704.3L1117.9 704.3L1122.2 707.2L1125.1 707.2L1136.6 712.9L1148.1 715.8L1150.3 718.0L1139.5 727.3L1130.9 731.7L1126.5 731.7L1125.1 733.1L1120.8 733.1L1119.3 734.5L1090.6 734.5L1089.1 733.1L1081.9 733.1L1080.5 731.7L1074.7 731.7L1073.3 730.2L1063.2 728.8L1057.5 725.9L1053.2 725.9L1051.7 724.5L1048.8 724.5L1047.4 723.0L1044.5 723.0L1043.1 721.6L1031.6 718.7L1027.3 715.8L1024.4 715.8L1012.9 710.1L1010.0 710.1L989.9 700.0L987.0 700.0L979.8 695.7L976.9 695.7L958.2 685.6L955.3 685.6L939.5 677.0L936.6 677.0L917.9 666.9L915.0 666.9L913.6 665.5L911.4 666.2L926.6 678.4L928.0 678.4L930.9 681.3L932.3 681.3L935.2 684.2L936.6 684.2L939.5 687.1L940.9 687.1L943.8 689.9L945.3 689.9L948.1 692.8L958.2 698.6L962.5 702.9L966.8 704.3L974.0 710.1L978.4 711.5L981.2 714.4L985.5 715.8L988.4 718.7L992.7 720.1L1002.8 727.3L1012.9 731.7L1015.8 734.5L1038.8 746.0L1039.5 746.8L1037.3 748.9L1034.5 748.9L1028.7 751.8L1020.1 751.8L1018.6 753.2L992.7 753.2L991.3 751.8L982.7 751.8L981.2 750.4L976.9 750.4L975.5 748.9L964.0 747.5L962.5 746.0L959.6 746.0L958.2 744.6L955.3 744.6L953.9 743.2L951.0 743.2L949.6 741.7L938.1 738.8L930.9 734.5L928.0 734.5L917.9 728.8L915.0 728.8L883.4 712.9L880.5 710.1L857.5 698.6L854.6 695.7L834.5 685.6L831.6 682.7L811.5 672.7L808.6 669.8L788.4 659.7L785.6 659.7L781.2 656.8L777.6 657.6L797.1 674.1L798.5 674.1L802.8 678.4L804.3 678.4L810.0 684.2L811.5 684.2L815.8 688.5L817.2 688.5L844.5 710.1L846.0 710.1L854.6 717.3L860.4 720.1L870.4 728.8L876.2 731.7L880.5 736.0L886.3 738.8L896.3 747.5L902.1 750.4L906.4 754.7L907.9 754.7L912.2 759.0L922.2 764.7L926.6 769.1L936.6 774.8L940.9 779.1L946.7 782.0L961.1 793.5L962.5 793.5L965.4 796.4L966.8 796.4L969.7 799.3L971.2 799.3L1004.2 822.3L1008.6 823.7L1015.8 829.5L1020.1 830.9L1023.0 833.8L1027.3 835.3L1037.3 842.4L1047.4 846.8L1050.3 849.6L1071.9 859.7L1074.0 861.9L1069.0 865.5L1066.1 865.5L1064.7 866.9L1061.8 866.9L1056.0 869.8L1048.8 869.8L1047.4 871.2L1014.3 871.2L1012.9 869.8L1004.2 869.8L1002.8 868.3L997.1 868.3L995.6 866.9L985.5 865.5L984.1 864.0L981.2 864.0L979.8 862.6L968.3 859.7L964.0 856.8L961.1 856.8L953.9 852.5L951.0 852.5L922.2 838.1L919.4 835.3L912.2 832.4L897.8 822.3L893.5 820.9L890.6 818.0L889.1 818.0L886.3 815.1L876.2 809.4L871.9 805.0L866.1 802.2L857.5 795.0L855.3 795.7L888.4 834.5L883.4 835.3L882.0 833.8L877.6 833.8L876.2 832.4L864.7 829.5L860.4 826.6L857.5 826.6L837.4 816.5L834.5 813.7L823.0 807.9L820.1 805.0L818.6 805.0L815.8 802.2L805.7 796.4L801.4 792.1L795.6 789.2L791.3 784.9L789.9 784.9L785.6 780.6L784.1 780.6L778.4 774.8L776.9 774.8L771.2 769.1L769.7 769.1L753.9 754.7L752.5 754.7L728.0 731.7L727.3 733.8L735.9 749.6L735.9 752.5L741.7 762.6L743.1 769.8L746.0 774.1L746.0 778.4L748.9 784.2L748.9 789.9L746.7 790.6L729.4 782.0L726.6 779.1L725.1 779.1L722.3 776.3L712.2 770.5L707.9 766.2L706.4 766.2L702.1 761.9L700.7 761.9L696.4 757.6L694.9 757.6L689.2 751.8L687.7 751.8L669.0 734.5L667.6 734.5L651.8 718.7L650.3 718.7L591.3 661.2L589.9 661.2L578.4 651.1L576.9 651.1L569.7 645.3L565.4 643.9L564.7 644.6L567.6 647.5L567.6 648.9L577.7 660.4L580.5 666.2L584.9 670.5L584.9 671.9L590.6 679.1L592.0 683.5L594.9 686.3L599.2 695.0L599.2 697.8L600.7 699.3L600.0 700.0L592.8 700.0L591.3 698.6L584.9 699.3L587.7 702.2L596.4 719.4L597.8 728.1L599.2 729.5L599.2 733.8L598.5 734.5L597.1 733.1L594.2 733.1L592.8 731.7L592.0 732.4L592.0 743.9L590.6 745.3L590.6 749.6L583.4 762.6L578.4 767.6L575.5 766.2L564.7 777.0L564.7 778.4L557.5 785.6L557.5 787.1L551.8 792.8L551.8 794.2L547.4 798.6L544.6 804.3L540.3 808.6L540.3 810.1L528.7 825.9L525.9 833.1L520.1 840.3L518.7 844.6L515.8 847.5L508.6 861.9L507.2 871.9L508.6 873.4L508.6 876.3L512.2 879.9L518.0 882.7L533.8 882.7L535.2 881.3L548.2 881.3L559.7 887.1L564.7 892.1L569.0 900.7L569.0 905.0L570.5 906.5L570.5 913.7L569.0 915.1L567.6 922.3L565.4 924.5L564.0 924.5L563.3 919.4L560.4 913.7L555.4 908.6L552.5 907.2L548.2 907.2L546.7 905.8L541.0 907.2L535.2 911.5L532.3 911.5L530.9 912.9L518.0 914.4L516.5 912.9L509.3 912.9L507.9 911.5L505.0 911.5L496.4 907.2L493.5 904.3L490.6 904.3L489.2 902.9L476.2 902.9L454.6 912.9L448.9 912.9L447.5 914.4L433.1 915.8L420.1 923.0L401.4 943.2L400.0 943.2L392.8 948.9L384.1 953.2L377.0 954.7L375.5 956.1L369.8 956.1L368.3 957.6L359.7 957.6L349.6 964.7L348.2 964.7L337.4 977.0L333.1 985.6L333.1 988.5L331.6 989.9L331.6 998.6L329.5 999.3L323.0 989.9L323.0 987.1L321.6 985.6L321.6 979.9L320.1 978.4L321.6 962.6L324.4 958.3L325.9 952.5L333.8 941.7L335.2 941.7L339.5 937.4L345.3 934.5L348.2 934.5L349.6 933.1L355.4 931.7L362.6 924.5L364.0 924.5L371.2 917.3L373.4 916.5L335.2 915.8L326.6 920.1L323.7 923.0L322.3 923.0L312.9 932.4L311.5 936.7L308.6 939.6L308.6 942.4L305.7 948.2L305.7 956.8L303.6 957.6L298.5 949.6L298.5 946.8L295.7 941.0L295.7 923.7L297.1 922.3L298.5 913.7L305.7 900.7L316.5 891.4L322.3 888.5L325.2 888.5L326.6 887.1L346.7 887.1L361.1 879.9L374.1 879.9L375.5 881.3L379.8 881.3L385.6 884.2L402.8 884.2L404.3 882.7L412.9 882.7L414.4 881.3L418.7 881.3L420.1 879.9L424.4 879.9L428.7 877.0L431.6 877.0L447.5 868.3L450.3 868.3L456.1 865.5L460.4 865.5L464.7 861.2L474.8 855.4L479.8 850.4L479.8 848.9L488.5 837.4L489.9 833.1L498.5 821.6L500.0 817.3L505.7 810.1L507.2 805.8L510.0 802.9L512.9 795.7L515.8 792.8L518.7 785.6L525.9 775.5L533.1 761.2L515.8 746.8L515.8 745.3L505.7 735.3L505.7 733.8L496.4 723.0L492.1 724.5L487.7 728.8L486.3 728.8L482.0 733.1L480.5 733.1L474.8 738.8L467.6 738.8L460.4 746.0L459.0 746.0L438.1 766.9L438.1 768.3L422.3 785.6L422.3 787.1L412.2 801.4L412.2 807.2L418.7 813.7L424.4 815.1L425.9 816.5L437.4 816.5L438.8 818.0L443.1 818.0L448.9 820.9L452.5 824.5L452.5 825.9L455.4 828.8L456.8 837.4L458.2 838.8L458.2 841.7L456.8 843.2L456.8 848.9L453.2 854.0L449.6 844.6L441.7 839.6L431.6 838.1L430.2 839.6L421.6 841.0L420.1 842.4L412.9 842.4L411.5 841.0L405.7 841.0L404.3 839.6L401.4 839.6L391.3 833.8L377.0 833.8L356.8 845.3L348.2 846.8L346.7 848.2L342.4 848.2L341.0 849.6L335.2 849.6L330.9 852.5L328.0 852.5L319.4 856.8L315.1 861.2L313.6 861.2L310.1 864.7L310.1 866.2L299.3 877.0L287.8 882.7L283.4 882.7L279.8 886.3L278.4 890.6L265.4 903.6L262.6 909.4L262.6 912.2L259.7 918.0L259.0 933.1L249.6 923.7L249.6 922.3L246.7 919.4L246.7 916.5L243.9 910.8L243.9 893.5L245.3 892.1L245.3 889.2L249.6 880.6L257.5 872.7L269.0 866.9L278.4 856.1L278.4 854.7L284.2 847.5L283.4 846.8L280.6 845.3L274.8 845.3L273.4 846.8L270.5 846.8L261.9 851.1L259.0 854.0L250.3 858.3L246.0 858.3L244.6 859.7L240.3 859.7L238.8 858.3L231.6 858.3L225.9 862.6L224.4 862.6L218.0 869.1L215.1 874.8L215.1 877.7L213.7 879.1L213.7 887.8L211.5 888.5L207.9 883.5L205.0 877.7L205.0 873.4L203.6 871.9L203.6 859.0L205.0 857.6L205.0 853.2L209.3 844.6L217.3 836.7L218.7 836.7L224.4 832.4L227.3 832.4L228.8 830.9L234.5 830.9L241.7 820.9L243.1 820.9L248.9 815.1L254.7 812.2L259.0 812.2L260.4 810.8L276.2 810.8L277.7 812.2L312.2 812.2L313.6 810.8L322.3 810.8L323.7 809.4L332.4 807.9L348.2 799.3L352.5 799.3L353.9 797.8L365.4 797.8L375.5 789.2L377.0 789.2L405.0 761.2L405.0 759.7L432.3 730.9L432.3 729.5L438.1 723.7L438.1 722.3L428.0 703.6L428.0 700.7L423.7 693.5L423.7 690.6L420.8 686.3L420.8 683.5L418.0 679.1L418.0 676.3L413.6 669.1L413.6 666.2L410.8 660.4L407.2 656.8L405.7 659.7L395.7 652.5L394.2 652.5L382.7 642.4L381.3 642.4L361.1 622.3L360.4 625.9L364.7 633.1L364.7 636.0L369.0 641.7L370.5 646.0L376.2 653.2L375.5 654.0L366.9 649.6L358.2 642.4L352.5 639.6L338.1 626.6L336.7 626.6L312.2 602.2L311.5 605.8L312.9 607.2L312.9 611.5L314.4 612.9L314.4 617.3L315.8 618.7L315.1 620.9L261.1 566.9L261.1 565.5L252.5 556.8L252.5 555.4L239.6 541.0L239.6 539.6L236.7 536.7L233.8 530.9L229.5 526.6L229.5 525.2L226.6 522.3L223.0 515.8L222.3 519.4L223.7 520.9L223.7 523.7L226.6 529.5L226.6 532.4L225.2 532.4L225.2 530.9L220.8 526.6L220.8 525.2L216.5 520.9L216.5 519.4L207.9 507.9L206.5 503.6L203.6 500.7L192.1 477.7L192.1 474.8L189.2 470.5L187.8 463.3L184.9 459.0L184.9 454.7L183.4 453.2L182.0 444.6L179.1 438.8L177.7 427.3L176.2 425.9L176.2 421.6L174.8 420.1L174.8 414.4L174.1 413.7L171.9 415.8L171.9 420.1L170.5 421.6L170.5 425.9L169.1 427.3L169.1 433.1L168.3 433.8L166.2 431.7L161.9 423.0L161.9 420.1L159.0 415.8L159.0 411.5L157.5 410.1L157.5 405.8L156.1 404.3L156.1 397.1L154.7 395.7L154.7 339.6L156.1 338.1L153.2 338.1L146.0 352.5L144.6 361.2L142.4 363.3L141.7 359.7L140.3 358.3L140.3 352.5L138.8 351.1L138.8 341.0L137.4 339.6L137.4 315.1L138.8 313.7L138.8 300.7L140.3 299.3L140.3 295.0L139.6 294.2L131.6 302.2L131.6 303.6L125.9 310.8L123.7 315.8L121.6 312.2L121.6 305.0L120.1 303.6L120.1 297.8L121.6 296.4L121.6 287.8L123.0 286.3L123.0 282.0L127.3 273.4L127.3 270.5L131.6 263.3L131.6 260.4L136.0 253.2L136.0 250.4L138.8 246.0L138.8 243.2L141.7 237.4L141.7 231.7L143.2 230.2L143.2 227.3L142.4 226.6L130.9 236.7L130.2 236.0L130.2 233.1L131.6 231.7L131.6 228.8L134.5 223.0L134.5 218.7L136.0 217.3L136.0 211.5L137.4 210.1L137.4 202.9L138.8 201.4L138.8 189.9L137.4 188.5L137.4 184.2L133.8 176.3L133.1 179.9L131.6 181.3L131.6 185.6L130.9 186.3L128.8 184.2L127.3 179.9L124.5 177.0L121.6 171.2L121.6 168.3L118.7 164.0L118.7 161.2L115.8 155.4L114.4 141.0L112.9 139.6L112.9 109.4L110.8 108.6L106.5 112.9L104.3 112.2L104.3 107.9L102.9 106.5L102.9 89.2L87.8 74.1L86.3 74.1L79.1 66.9L77.7 66.9L73.4 62.6L71.9 62.6L67.6 58.3L66.2 58.3L59.0 52.5L23.0 33.8L15.8 33.8L14.4 35.3L5.8 36.7L1.4 39.6L-0.7 38.8L5.0 27.3L17.3 13.7L18.7 13.7L25.9 7.9L34.5 3.6L43.2 2.2L44.6 0.7L52.5 0.0ZM216.5 34.5L217.3 33.8L218.7 35.3L224.4 36.7L229.5 43.2L229.5 50.4L228.0 53.2L221.6 58.3L212.9 58.3L210.1 56.8L205.0 50.4L205.0 43.2L206.5 40.3L210.1 36.7L216.5 34.5ZM498.5 51.8L499.2 51.1L500.7 52.5L518.0 52.5L519.4 54.0L525.1 54.0L526.6 55.4L541.0 55.4L542.4 54.0L549.6 54.0L551.0 55.4L559.7 56.8L564.0 59.7L572.6 59.7L578.4 56.8L595.6 56.8L597.1 58.3L602.8 58.3L604.3 59.7L612.9 61.2L617.2 64.0L620.1 64.0L628.7 68.3L631.6 71.2L635.9 72.7L640.2 77.0L641.7 77.0L647.4 82.7L648.9 82.7L665.4 100.7L665.4 102.2L674.1 113.7L685.6 136.7L685.6 139.6L687.0 141.0L686.3 144.6L680.5 141.7L677.7 138.8L676.9 141.0L688.4 161.2L688.4 164.0L694.2 174.1L695.6 181.3L702.8 195.7L710.7 203.6L712.2 203.6L728.0 216.5L733.8 219.4L739.5 225.2L741.0 225.2L746.7 230.9L748.1 230.9L755.3 238.1L756.8 238.1L792.0 273.4L792.0 274.8L805.0 287.8L805.0 289.2L813.6 297.8L813.6 299.3L820.8 306.5L820.8 307.9L834.5 321.6L838.8 323.0L846.0 328.8L850.3 330.2L853.2 333.1L857.5 334.5L869.0 343.2L877.6 347.5L887.7 356.1L893.5 359.0L906.4 370.5L907.9 370.5L922.2 384.9L923.7 384.9L925.8 387.1L925.8 388.5L933.0 395.7L932.3 396.4L923.7 395.0L922.2 393.5L917.9 393.5L912.2 390.6L910.0 391.4L912.2 393.5L913.6 393.5L923.7 402.2L925.1 402.2L945.3 416.5L949.6 418.0L952.5 420.9L956.8 422.3L966.8 429.5L1016.5 454.7L1008.6 459.7L1005.7 459.7L999.9 462.6L978.4 462.6L976.9 461.2L966.8 459.7L966.1 460.4L969.7 464.0L971.2 464.0L991.3 478.4L995.6 479.9L1005.7 487.1L1018.6 492.8L1021.5 495.7L1024.4 495.7L1043.1 505.8L1046.0 505.8L1053.2 510.1L1056.0 510.1L1060.4 512.9L1063.2 512.9L1067.6 515.8L1071.1 516.5L1066.1 521.6L1057.5 525.9L1046.0 527.3L1044.5 528.8L1030.1 528.8L1028.7 527.3L1021.5 527.3L1020.1 525.9L1014.3 525.9L1008.6 523.0L999.9 521.6L995.6 518.7L992.7 518.7L988.4 515.8L985.5 515.8L958.2 501.4L956.0 502.2L965.4 510.1L966.8 510.1L972.6 515.8L974.0 515.8L979.8 521.6L981.2 521.6L985.5 525.9L991.3 528.8L1012.9 546.0L1023.0 551.8L1027.3 556.1L1028.7 556.1L1031.6 559.0L1033.0 559.0L1035.9 561.9L1037.3 561.9L1040.2 564.7L1041.7 564.7L1044.5 567.6L1046.0 567.6L1048.8 570.5L1050.3 570.5L1053.2 573.4L1054.6 573.4L1078.3 589.9L1073.3 593.5L1070.4 593.5L1064.7 596.4L1056.0 596.4L1054.6 597.8L1040.2 597.8L1038.8 596.4L1030.1 596.4L1028.7 595.0L1017.2 593.5L1015.8 592.1L1004.2 589.2L999.9 586.3L997.1 586.3L985.5 580.6L979.1 575.5L982.7 574.8L984.1 573.4L987.0 573.4L995.6 569.1L998.5 566.2L999.9 566.2L1003.5 562.6L1002.8 561.9L985.5 557.6L981.2 554.7L969.7 551.8L965.4 548.9L962.5 548.9L958.2 546.0L955.3 546.0L951.0 543.2L948.1 543.2L940.9 538.8L938.1 538.8L848.9 494.2L846.0 491.4L841.7 489.9L838.8 487.1L831.6 484.2L828.7 481.3L824.4 479.9L821.5 477.0L812.9 472.7L812.9 471.2L824.4 469.8L825.8 468.3L829.4 467.6L825.8 464.0L824.4 464.0L804.3 449.6L789.9 442.4L787.0 439.6L779.8 436.7L776.9 433.8L765.4 429.5L762.5 426.6L759.7 426.6L741.0 416.5L738.1 416.5L728.0 410.8L725.1 410.8L717.9 406.5L715.1 406.5L705.0 400.7L702.1 400.7L694.9 396.4L692.0 396.4L674.8 387.8L663.3 377.7L661.8 377.7L591.3 305.8L589.9 305.8L568.3 284.2L566.9 284.2L553.9 271.2L552.5 271.2L550.3 269.1L550.3 264.7L548.9 263.3L548.9 243.2L548.2 242.4L544.6 246.0L541.7 253.2L540.3 253.2L538.8 250.4L538.8 231.7L540.3 230.2L541.7 221.6L544.6 217.3L544.6 212.9L546.0 211.5L543.8 210.8L541.0 212.2L533.8 219.4L533.1 214.4L534.5 212.9L535.9 204.3L537.4 202.9L537.4 200.0L540.3 194.2L540.3 189.9L541.7 188.5L541.7 172.7L541.0 171.9L538.8 174.1L538.8 175.5L536.7 176.3L530.2 164.0L528.7 155.4L527.3 154.0L527.3 148.2L525.9 146.8L525.9 126.6L520.1 126.6L520.1 112.2L510.8 102.9L509.3 102.9L497.8 92.8L489.2 88.5L486.3 85.6L473.3 79.9L470.5 77.0L461.8 77.0L460.4 78.4L456.1 78.4L454.6 79.9L452.5 79.1L456.8 73.4L456.8 71.9L469.0 59.7L480.5 54.0L484.9 54.0L486.3 52.5L498.5 51.8ZM594.9 76.3L600.0 75.5L602.8 77.0L606.4 82.0L606.4 87.8L601.4 92.8L594.2 92.8L591.3 91.4L589.2 87.8L589.2 80.6L592.8 77.0L594.9 76.3ZM908.6 664.7L911.4 664.7L908.6 664.7Z";
const __BRAND_LOGO_VIEWBOX = "0 0 1151 1000";

/* ===== hm-data.jsx ===== */
// Huginn & Muninn — sample data (deterministic for the demo)

const HM_NOW = new Date("2026-05-21T14:33:40+09:00");
const isoMinus = (m) => new Date(HM_NOW.getTime() - m * 60_000).toISOString();

const HM_APPS = [
  { id: "app_01", workspaceId: "ws_ai",      name: "ai-router-svc",  kind: "triton",  output: "pull_request", repo: "acme/ai-router-svc",  runs24h: 23, failed24h: 18, lastRun: isoMinus(1),  cost7d: 12.40 },
  { id: "app_02", workspaceId: "ws_payment", name: "payment-worker", kind: "fastapi", output: "pull_request", repo: "acme/payment-worker", runs24h: 15, failed24h:  9, lastRun: isoMinus(15), cost7d:  8.20 },
  { id: "app_03", workspaceId: "ws_ai",      name: "search-indexer", kind: "fastapi", output: "issue",        repo: "acme/search-indexer", runs24h: 11, failed24h:  4, lastRun: isoMinus(89), cost7d:  4.10 },
  { id: "app_04", workspaceId: "ws_data",    name: "data-etl",       kind: "airflow", output: "issue",        repo: "acme/data-etl",       runs24h:  3, failed24h:  0, lastRun: isoMinus(220),cost7d:  1.20 },
  { id: "app_05", workspaceId: "ws_data",    name: "legacy-batch",   kind: "other",   output: "pull_request", repo: "acme/legacy-batch",   runs24h:  0, failed24h:  0, lastRun: null,         cost7d:  0.00 },
];

const HM_WORKSPACES = [
  { id: "ws_ai",      name: "AI Platform",      slug: "ai-platform",      desc: "추론·검색 서비스",       color: "#10B981", appCount: 2, role: "owner" },
  { id: "ws_payment", name: "Payments",         slug: "payments",         desc: "결제 워커",              color: "#FF8A00", appCount: 1, role: "member" },
  { id: "ws_data",    name: "Data Platform",    slug: "data-platform",    desc: "ETL · 배치",             color: "#7E58FA", appCount: 2, role: "member" },
];

// 24h of 5-min buckets — 288 buckets, but we'll show 48 (every 30 min)
const HM_FLOW = Array.from({length: 48}).map((_, i) => {
  const h = Math.floor(i / 2);
  const peak = Math.exp(-Math.pow((i - 28) / 10, 2)) + Math.exp(-Math.pow((i - 14) / 8, 2)) * 0.6;
  const succ = Math.max(0, Math.round(peak * 14 + (i % 5)));
  const fail = i > 20 && i < 36 ? Math.round(peak * 5) : Math.max(0, (i % 9 === 0 ? 1 : 0));
  const await_ = i === 38 || i === 32 || i === 26 ? 1 : 0;
  return { label: `${String(h).padStart(2,"0")}`, succ, fail, await: await_ };
});

const HM_LIVE_RUNS = [
  { id: "run_82c0f1a", app: "ai-router-svc",  status: "running",  step: 4, max: 12, cost: 0.18, duration: 83, started: isoMinus(1.4),  output: null },
  { id: "run_61a45d8", app: "payment-worker", status: "awaiting", step: null, max: 12, cost: 1.04, duration: 1084, started: isoMinus(18), output: "PR awaiting approval" },
  { id: "run_4a8302b", app: "search-indexer", status: "running",  step: 2, max: 12, cost: 0.04, duration: 12, started: isoMinus(0.2),  output: null },
  { id: "run_3f819cd", app: "ai-router-svc",  status: "queued",   step: null, max: 12, cost: 0,    duration: 0, started: isoMinus(0.05),output: null },
];

const HM_RECENT_RUNS = [
  { id: "run_82c0f1a", app: "ai-router-svc",  status: "running",   step: 4, max: 12, cost: 0.18, duration: 83,    started: isoMinus(1),    output: null },
  { id: "run_61a45d8", app: "payment-worker", status: "awaiting",  step: null, max: 12, cost: 1.04, duration: 1084, started: isoMinus(18),   output: "PR awaiting" },
  { id: "run_8f2a1bc", app: "ai-router-svc",  status: "succeeded", step: 6, max: 12, cost: 0.12, duration: 131,   started: isoMinus(75),   output: "PR #842" },
  { id: "run_7d1e093", app: "ai-router-svc",  status: "succeeded", step: 5, max: 12, cost: 0.09, duration: 98,    started: isoMinus(135),  output: "PR #841" },
  { id: "run_5c809f1", app: "ai-router-svc",  status: "failed",    step: 3, max: 12, cost: 0.04, duration: 45,    started: isoMinus(149),  output: "GitHub 403" },
  { id: "run_4a72bd0", app: "data-etl",       status: "cancelled", step: 1, max: 12, cost: 0.02, duration: 20,    started: isoMinus(213),  output: "user cancel" },
  { id: "run_3e51c92", app: "search-indexer", status: "succeeded", step: 4, max: 12, cost: 0.07, duration: 110,   started: isoMinus(245),  output: "Issue #143" },
  { id: "run_29ab40e", app: "payment-worker", status: "succeeded", step: 5, max: 12, cost: 0.11, duration: 122,   started: isoMinus(360),  output: "PR #221" },
  { id: "run_182bcd1", app: "search-indexer", status: "succeeded", step: 3, max: 12, cost: 0.05, duration: 88,    started: isoMinus(412),  output: "Issue #142" },
  { id: "run_07a3b22", app: "ai-router-svc",  status: "failed",    step: 8, max: 12, cost: 0.31, duration: 220,   started: isoMinus(480),  output: "guardrail block" },
  { id: "run_82bef02", app: "ai-router-svc",  status: "succeeded", step: 5, max: 12, cost: 0.09, duration: 92,    started: isoMinus(8),    output: "PR #843" },
  { id: "run_82a5d31", app: "ai-router-svc",  status: "succeeded", step: 4, max: 12, cost: 0.07, duration: 78,    started: isoMinus(28),   output: "PR #844" },
  { id: "run_5c70a82", app: "ai-router-svc",  status: "succeeded", step: 5, max: 12, cost: 0.08, duration: 85,    started: isoMinus(158),  output: "Issue #145" },
];

const HM_EVENTS = [
  // ai-router-svc — 1 event, multiple runs (retries)
  { id: "e_3f8a91", appId: "app_01", app: "ai-router-svc",  time: isoMinus(1.5),  source: "grafana",  severity: "critical", fingerprint: "PodCrashLooping", title: "Pod restarting · payload > 4MB OOM", dedup: 17,
    runIds: ["run_82c0f1a", "run_82bef02", "run_82a5d31"] },
  { id: "e_3a712f", appId: "app_02", app: "payment-worker", time: isoMinus(18),   source: "airflow",  severity: "error",    fingerprint: "billing/load_to_dw", title: "DAG task failed: load_to_dw", dedup: 0,
    runIds: ["run_61a45d8"] },
  { id: "e_2bd102", appId: "app_03", app: "search-indexer", time: isoMinus(75),   source: "manual",   severity: "info",     fingerprint: "manual:reindex", title: "Manual reindex requested", dedup: 0,
    runIds: ["run_3e51c92"] },
  { id: "e_1c0498", appId: "app_01", app: "ai-router-svc",  time: isoMinus(149),  source: "grafana",  severity: "error",    fingerprint: "HighErrorRate",   title: "5xx burst on /v1/embed", dedup: 2,
    runIds: ["run_5c809f1", "run_5c70a82"] },
  { id: "e_0a52cd", appId: "app_04", app: "data-etl",       time: isoMinus(220),  source: "airflow",  severity: "warning",  fingerprint: "data/sync",       title: "ETL DAG ran longer than SLA", dedup: 0,
    runIds: ["run_4a72bd0"] },
  { id: "e_09c821", appId: "app_01", app: "ai-router-svc",  time: isoMinus(480),  source: "argocd",   severity: "error",    fingerprint: "Degraded",        title: "ArgoCD sync degraded", dedup: 0,
    runIds: ["run_07a3b22"] },
];

// Flagship run — full transcript
const HM_RUN_DETAIL = {
  id: "run_82c0f1a",
  app: "ai-router-svc",
  appKind: "Triton Inference Server",
  event: { id: "e_3f8a91", source: "grafana", summary: "PodCrashLooping (ai-router pod restarting)" },
  status: "running",
  started: isoMinus(1.4),
  step: 4,
  maxStep: 12,
  cost: 0.18,
  maxCost: 2.0,
  tokens: 47120,
  maxTokens: 100000,
  recalledMemories: [
    { id: "m1", fact: "Triton OOM — /v1/embed payload 가 4MB 를 넘으면 memory limit 1Gi 로 부족. 4Gi 로 상향 필요.", score: 0.91 },
    { id: "m2", fact: "ai-router 는 warm-up 비용이 크므로 HPA min replicas 는 최소 2 이상으로 유지해야 함.", score: 0.84 },
    { id: "m3", fact: "ai-platform namespace 에서는 Loki label 중 `app` 이 canonical service selector. `service_name` 은 Saga 에만 존재.", score: 0.78 },
  ],
  toolsUsed: [
    { ns: "muninn", count: 1 },
    { ns: "loki",   count: 1 },
    { ns: "tempo",  count: 1 },
    { ns: "github", count: 2 },
  ],
  steps: [
    {
      ix: 1, kind: "tool", finishedAt: isoMinus(1.3),
      tool: { ns: "muninn", fn: "recall", status: "ok",
        args: { query: "ai-router-svc pod crash OOM", k: 5 },
        result: { items: 3, top_score: 0.91 } },
    },
    {
      ix: 2, kind: "tool", finishedAt: isoMinus(1.2),
      tool: { ns: "loki", fn: "query_range", status: "ok",
        args: { logql: '{app="ai-router-svc"} |~ "OOM|killed"', range: "1h" },
        result: { lines: 1204, top_hit: "Memory cgroup out of memory: Killed process 1 (tritonserver)" } },
    },
    {
      ix: 3, kind: "tool", finishedAt: isoMinus(1.1),
      tool: { ns: "tempo", fn: "search_traces", status: "ok",
        args: { service: "ai-router-svc", duration_gte_ms: 10000 },
        result: { traces: 4, slowest_ms: 12340, span_count: 187 } },
    },
    {
      ix: 4, kind: "thought", active: true,
      text: "Loki 로그에서 pod 이 `/v1/embed` 요청 처리 직후 9초 만에 OOMKilled 되는 패턴을 발견했다. 페이로드 크기가 4MB 를 넘는 케이스에서만 발생하며, 현재 memory limit 은 1Gi — Triton 의 모델 working set 보다 훨씬 작다. `deployment.yaml` 의 resource manifest 와 HPA 설정을 확인할 차례.",
      tokens_in: 12420, tokens_out: 184,
    },
    {
      ix: 5, kind: "tool-pending",
      tool: { ns: "github", fn: "read_file",
        args: { path: "deploy/triton/deployment.yaml", ref: "main" } },
    },
  ],
};

const HM_DATA = {
  NOW: HM_NOW, APPS: HM_APPS, WORKSPACES: HM_WORKSPACES, FLOW: HM_FLOW,
  LIVE_RUNS: HM_LIVE_RUNS, RECENT_RUNS: HM_RECENT_RUNS, EVENTS: HM_EVENTS,
  RUN_DETAIL: HM_RUN_DETAIL,
  MEMORIES: [
    // Global — applies across apps (curated by admin)
    { id: "mem_g01", scope: "global", appId: null,    appName: null,            fact: "K8s OOMKilled 이벤트는 cgroup memory limit 보다 working set 이 큰 경우 발생. 첫 reproduction 은 `kubectl top pod` + `kubectl describe pod` 로 확인할 것.", run: null,       when: "2026-04-01", tags: ["k8s","oom","general"],     score: 0.93, curated: true },
    { id: "mem_g02", scope: "global", appId: null,    appName: null,            fact: "Loki LogQL 에서 한국어 로그 검색 시 `|~ \"(?i)에러\"` 로 case-insensitive 매칭이 안 되는 경우, `|~ \"에러|ERROR\"` 처럼 다중 패턴으로 우회한다.", run: null,       when: "2026-03-20", tags: ["loki","logql","ko"],       score: 0.81, curated: true },
    { id: "mem_g03", scope: "global", appId: null,    appName: null,            fact: "ArgoCD sync 가 `Healthy/Synced` 인데 pod 가 구버전인 경우, `imagePullPolicy: Always` 가 아니거나 image SHA digest pinning 미사용을 의심.", run: null,       when: "2026-03-10", tags: ["argocd","general","image"], score: 0.88, curated: true },

    // ai-router-svc
    { id: "mem_01",  scope: "app",    appId: "app_01", appName: "ai-router-svc", fact: "Triton inference server 가 /v1/embed payload 4MB 초과 시 memory limit 1Gi 로 OOMKilled. Working set 은 약 3.2Gi.",                                                                          run: "run_7d1", when: "2026-04-15", tags: ["triton","oom","memory"], score: 0.91 },
    { id: "mem_02",  scope: "app",    appId: "app_01", appName: "ai-router-svc", fact: "ai-router 는 cold start 가 약 12 초 소요되므로 HPA min replicas 는 반드시 2 이상으로 운영.",                                                                                         run: "run_4a8", when: "2026-04-12", tags: ["hpa","warmup"],          score: 0.84 },
    { id: "mem_03",  scope: "app",    appId: "app_01", appName: "ai-router-svc", fact: "ai-platform namespace 에서는 Loki label 중 `app` 이 canonical service selector. `service_name` 은 Saga 에만 존재.",                                                                    run: "run_4a8", when: "2026-04-10", tags: ["loki","label"],          score: 0.72 },

    // payment-worker
    { id: "mem_11",  scope: "app",    appId: "app_02", appName: "payment-worker",fact: "billing/load_to_dw DAG 의 task timeout 은 30분 — 그 이상은 upstream snowflake query 가 시간 초과한 케이스. retry 보다 query 분할이 필요.",                                              run: "run_61a", when: "2026-04-30", tags: ["airflow","timeout"],     score: 0.87 },

    // search-indexer
    { id: "mem_21",  scope: "app",    appId: "app_03", appName: "search-indexer",fact: "image SHA 변경 후에도 ArgoCD 가 'Healthy/Synced' 로 보이지만 pod 는 이전 digest 그대로 돌아가는 케이스. ImagePullPolicy 와 configMap 기반 build 를 점검할 것.",                                       run: "run_4a8", when: "2026-04-22", tags: ["argocd","image-pull"],   score: 0.79 },

    // data-etl
    { id: "mem_31",  scope: "app",    appId: "app_04", appName: "data-etl",      fact: "Airflow on_failure_callback HTTP 502 폭주는 보통 배포 후 load_balancer 5분 cooldown 때문에 발생.",                                                                            run: "run_2bc", when: "2026-03-28", tags: ["airflow","callback"],    score: 0.68 },
  ],
};

/* ===== hm-components.jsx ===== */
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
function StatusDot({ status }) {
  return <span className={`status-dot is-${status}`} aria-label={status}></span>;
}
function StatusLabel({ status, children }) {
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
function RuneGlyph({ name }) {
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

function RavenSilhouette({ color, withGround = true }) {
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

function HuginnLogo({ size = 64, color, withGlow = true, withGround = true }) {
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

function MuninnLogo({ size = 64, color, withGlow = true, withGround = true }) {
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
function RavenLockup({ size = 64, withWordmark = true }) {
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
function RavenMark({ which = "huginn", size = 16, color }) {
  const Comp = which === "muninn" ? MuninnLogo : HuginnLogo;
  return <Comp size={size} color={color} withGlow={size >= 32}/>;
}

// ===========================================================
//  BrandLogo — user-uploaded two-raven artwork, tintable via CSS mask
// ===========================================================
function BrandLogo({ size = 36, color, title = "Huginn & Muninn" }) {
  // Source artwork aspect: 1151 × 1000. Inline SVG so it tints with currentColor.
  const h = Math.round(size * (1000 / 1151));
  return (
    <svg
      role="img"
      aria-label={title}
      width={size}
      height={h}
      viewBox={__BRAND_LOGO_VIEWBOX || "0 0 1151 1000"}
      fill={color || "currentColor"}
      fillRule="evenodd"
      style={{display:"inline-block", flexShrink:0}}
    >
      <title>{title}</title>
      <path d={__BRAND_LOGO_PATH || ""}/>
    </svg>
  );
}



// ---------- CostMeter / IterMeter ----------
function Meter({ label, current, cap, format = (v) => v, tone, unit }) {
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
function highlightJson(obj) {
  const s = JSON.stringify(obj, null, 2);
  return s
    .replace(/("[^"]+"):/g, '<span class="json-key">$1</span><span class="json-punct">:</span>')
    .replace(/: ("[^"]*")/g, ': <span class="json-str">$1</span>')
    .replace(/: (true|false|null)/g, ': <span class="json-bool">$1</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="json-num">$1</span>');
}
function JsonViewer({ data, collapsed = false }) {
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
function HmSpark({ data, w = 80, h = 22, color = "var(--huginn-500)", fill = true }) {
  return <Sparkline data={data} w={w} h={h} color={color} fill={fill}/>;
}

// ---------- StackedBars (run flow) ----------
function StackedBars({ buckets, w = 720, h = 120 }) {
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
function HealthDots({ services }) {
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
function HmPageHead({ rune, title, sub, children }) {
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
function HmKpi({ label, value, unit, delta, dir, hint, accent, link }) {
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
function HmCard({ title, meta, children, action, flush }) {
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
function HmAnnounce({ tone = "info", icon, title, desc, actionLabel, onAction, onDismiss }) {
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



/* ===== hm-markdown.jsx ===== */
// ===================================================================
// Lightweight Markdown renderer + editor modal for Huginn document
// surfaces (SOUL.md, Memory facts, etc.).
// Supported syntax: # ## ### / **bold** / *italic* / `code` / ```fence```
// / - bullet / 1. ordered / > blockquote / [text](url) / --- hr / paragraphs.
// ===================================================================

const { useState: useS_MD, useEffect: useE_MD, useRef: useR_MD } = React;

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdToHtml(src) {
  if (!src) return "";
  // 1) Pull fenced code blocks out first so inline rules don't mangle them.
  const fences = [];
  let s = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    fences.push({ lang, code });
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });
  s = escapeHtml(s);

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Horizontal rule
  s = s.replace(/^---+$/gm, '<hr class="md-hr"/>');

  // Blockquote (consecutive `> ` lines collapse)
  s = s.replace(/(?:^&gt; .*(?:\n|$))+/gm, m => {
    const inner = m.trim().split("\n").map(l => l.replace(/^&gt; ?/, "")).join("<br/>");
    return `<blockquote class="md-bq">${inner}</blockquote>\n`;
  });

  // Bullet lists
  s = s.replace(/(?:^- .*(?:\n|$))+/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^- /, "")}</li>`).join("");
    return `<ul class="md-ul">${items}</ul>\n`;
  });
  // Ordered lists
  s = s.replace(/(?:^\d+\. .*(?:\n|$))+/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`).join("");
    return `<ol class="md-ol">${items}</ol>\n`;
  });

  // Inline: links, bold, italic, code
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-a" href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');

  // Paragraphs
  s = s.split(/\n{2,}/).map(block => {
    const t = block.trim();
    if (!t) return "";
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(t)) return t;
    if (/^\u0000FENCE\d+\u0000$/.test(t)) return t;
    return `<p class="md-p">${t.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");

  // Reinsert code fences with escaped content
  s = s.replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => {
    const { lang, code } = fences[+i];
    const langClass = lang ? ` data-lang="${lang}"` : "";
    return `<pre class="md-pre"${langClass}><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`;
  });

  return s;
}

function MarkdownView({ src, className }) {
  return (
    <div
      className={`md-body${className ? " " + className : ""}`}
      dangerouslySetInnerHTML={{ __html: mdToHtml(src || "") }}
    />
  );
}

// ============== Editor modal ==============
function MarkdownEditor({ open, title = "문서 편집", filename, value = "", onSave, onClose, hint }) {
  const [draft, setDraft] = useS_MD(value);
  const [mode, setMode] = useS_MD("split"); // edit | split | preview
  const taRef = useR_MD(null);

  useE_MD(() => {
    if (open) {
      setDraft(value);
      // Focus the textarea after mount
      setTimeout(() => taRef.current && taRef.current.focus(), 30);
    }
  }, [open, value]);

  useE_MD(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSave?.(draft);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, draft, onSave, onClose]);

  if (!open) return null;

  const lineCount = (draft.match(/\n/g) || []).length + 1;
  const charCount = draft.length;

  return (
    <div className="md-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="md-modal" onClick={(e) => e.stopPropagation()}>
        <header className="md-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span className="md-modal-icon"><Icon name="edit" size={15}/></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <strong className="md-modal-title">{title}</strong>
              {filename && <span className="md-modal-filename">{filename}</span>}
            </div>
            <span className="md-modal-badge">Markdown</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="md-mode-tabs" role="tablist" aria-label="View mode">
              <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>편집</button>
              <button className={mode === "split" ? "on" : ""} onClick={() => setMode("split")}>분할</button>
              <button className={mode === "preview" ? "on" : ""} onClick={() => setMode("preview")}>미리보기</button>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>취소</Button>
            <Button size="sm" variant="primary" leftIcon="check" onClick={() => { onSave?.(draft); }}>저장</Button>
          </div>
        </header>

        <div className={`md-modal-body md-mode-${mode}`}>
          {(mode === "edit" || mode === "split") && (
            <div className="md-edit-pane">
              <textarea
                ref={taRef}
                className="md-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck="false"
                placeholder="# 제목&#10;&#10;마크다운으로 작성하세요…"
              />
            </div>
          )}
          {(mode === "preview" || mode === "split") && (
            <div className="md-preview-pane">
              <MarkdownView src={draft}/>
              {!draft.trim() && (
                <div className="md-empty">미리보기가 여기에 표시됩니다</div>
              )}
            </div>
          )}
        </div>

        <footer className="md-modal-foot">
          <span className="md-hint">
            {hint || (<>
              <kbd>**굵게**</kbd>
              <kbd>*기울임*</kbd>
              <kbd>`코드`</kbd>
              <kbd># 제목</kbd>
              <kbd>- 목록</kbd>
              <kbd>&gt; 인용</kbd>
            </>)}
          </span>
          <span className="md-counts">
            {lineCount}줄 · {charCount.toLocaleString()}자 · <kbd className="md-kbd-key">⌘</kbd><kbd className="md-kbd-key">↵</kbd> 저장
          </span>
        </footer>
      </div>
    </div>
  );
}



/* ===== hm-shell.jsx ===== */
// Huginn & Muninn — Shell (Header + Sidebar + StatusBar + WorkspaceSwitcher)

const { useState: useS_HMS, useEffect: useE_HMS, useRef: useR_HMS } = React;

function WorkspaceSwitcher({ workspaceId, onSwitch, onManage }) {
  const D = HM_DATA;
  const [open, setOpen] = useS_HMS(false);
  const ref = useR_HMS();
  const ws = D.WORKSPACES.find(w => w.id === workspaceId) || D.WORKSPACES[0];

  useE_HMS(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="hm-ws">
      <button className="hm-ws-trigger" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="hm-ws-badge" style={{background: ws.color}}>{ws.name[0]}</span>
        <span className="hm-ws-meta">
          <span className="hm-ws-name">{ws.name}</span>
          <span className="hm-ws-sub">{ws.appCount}개 Application · {ws.role}</span>
        </span>
        <Icon name="chevronsUpDown" size={14} style={{color:"var(--on-surface-muted)", marginLeft:"auto"}}/>
      </button>

      {open && (
        <div className="hm-ws-menu">
          <div className="hm-ws-menu-label">전환할 Workspace</div>
          {D.WORKSPACES.map(w => (
            <button key={w.id} className={`hm-ws-item ${w.id === workspaceId ? "is-current" : ""}`}
                    onClick={() => { onSwitch(w.id); setOpen(false); }}>
              <span className="hm-ws-badge" style={{background: w.color}}>{w.name[0]}</span>
              <span style={{display:"flex", flexDirection:"column", flex:1, minWidth:0, gap:1}}>
                <span style={{fontWeight:600, fontSize:13, color:"var(--on-surface)"}}>{w.name}</span>
                <span style={{fontSize:11.5, color:"var(--on-surface-muted)"}}>{w.appCount}개 Application · {w.desc}</span>
              </span>
              {w.id === workspaceId && <Icon name="check" size={14} style={{color:"var(--primary-50)"}}/>}
            </button>
          ))}
          <div className="hm-ws-menu-divider"></div>
          <button className="hm-ws-item" onClick={() => { onManage?.(); setOpen(false); }}>
            <span className="hm-ws-badge" style={{background:"var(--surface-container-high)", color:"var(--on-surface-variant)"}}>
              <Icon name="settings" size={13}/>
            </span>
            <span style={{flex:1, fontSize:13, color:"var(--on-surface-variant)", fontWeight:500}}>Workspace 관리</span>
          </button>
          <button className="hm-ws-item" onClick={() => setOpen(false)}>
            <span className="hm-ws-badge" style={{background:"var(--surface-container-high)", color:"var(--on-surface-variant)"}}>
              <Icon name="plus" size={13}/>
            </span>
            <span style={{flex:1, fontSize:13, color:"var(--on-surface-variant)", fontWeight:500}}>새 Workspace 만들기</span>
          </button>
        </div>
      )}
    </div>
  );
}

function HmSidebar({ section, onNav, workspaceId, onSwitchWorkspace, onManageWorkspaces }) {
  const groups = [
    { items: [
      { id: "dashboard",    label: "Dashboard",    icon: "dashboard" },
      { id: "apps",         label: "Applications", icon: "layers" },
    ]},
    { title: "Settings", admin: true, items: [
      { id: "platform-tools", label: "Platform tools", icon: "settings" },
      { id: "memories",       label: "Memories",       icon: "database" },
    ]},
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="mark" style={{background:"transparent", border:"0", padding:0, width:40, height:36, display:"inline-flex", alignItems:"center", justifyContent:"center", color:"var(--on-surface)"}}>
          <BrandLogo size={40}/>
        </span>
        <div className="wm" style={{display:"flex", alignItems:"center", gap:0, flexDirection:"column", alignItems:"flex-start", lineHeight:1.05}}>
          <span style={{fontWeight:800, fontSize:15, letterSpacing:"-0.018em", color:"var(--on-surface)"}}>Huginn Agent</span>
          <small style={{fontSize:11, color:"var(--on-surface-muted)", fontWeight:500, marginTop:2}}>DevOps Agent</small>
        </div>
      </div>
      <WorkspaceSwitcher workspaceId={workspaceId} onSwitch={onSwitchWorkspace} onManage={onManageWorkspaces}/>
      <nav className="sidebar-nav">
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            {g.title && <div className="nav-section">{g.title}{g.admin && <span style={{marginLeft:8,color:"var(--primary-40)",fontSize:10,fontWeight:600,background:"var(--primary-95)",padding:"1px 7px",borderRadius:"9999px",letterSpacing:0,textTransform:"none"}}>admin</span>}</div>}
            {g.items.map(it => (
              <a key={it.id} href="#" className={`nav-item ${section === it.id ? "is-active" : ""}`}
                 onClick={e => { e.preventDefault(); onNav(it.id); }}>
                <Icon name={it.icon} size={16}/>
                <span className="lbl">{it.label}</span>
                {it.badge && <span className={`count ${it.badgeWarn ? "is-warn" : ""}`}>{it.badge}</span>}
              </a>
            ))}
          </React.Fragment>
        ))}
      </nav>
      <div className="sidebar-foot">
        <Avatar name="alice" size="sm" color="var(--muninn-700)"/>
        <div className="who-meta">
          <div className="nm">alice</div>
          <div className="em">platform-sre</div>
        </div>
        <IconButton icon="moreV" size="sm"/>
      </div>
    </aside>
  );
}

function HmHeader({ onCommand, onNotif, pendingApprovals = 3, todayCost = 4.12 }) {
  return (
    <header className="topbar">
      <div className="topbar-search">
        <Icon name="search" size={15}/>
        <input placeholder="검색하거나 명령 실행 (apps, events, runs, memories...)" onClick={onCommand} readOnly/>
        <kbd>⌘K</kbd>
      </div>
      <span style={{flex:1}}></span>
      <span className="cost-pill">
        <span className="lbl">오늘 비용</span>
        <span className="val">${todayCost.toFixed(2)}</span>
      </span>
      <button className="btn btn-icon" style={{position:"relative"}} onClick={onNotif} aria-label={`${pendingApprovals} pending approvals`}>
        <Icon name="bell" size={18}/>
        {pendingApprovals > 0 && (
          <span style={{position:"absolute",top:4,right:5,minWidth:16,height:16,padding:"0 4px",borderRadius:8,background:"var(--warning-50)",color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-sans)"}}>
            {pendingApprovals}
          </span>
        )}
      </button>
      <span className="topbar-divider"></span>
      <Avatar name="alice" size="sm" color="var(--muninn-700)"/>
    </header>
  );
}

function HmStatusBar({ wsConnected = true, queueDepth = 0 }) {
  const services = [
    { name: "gateway",  status: "healthy" },
    { name: "huginn",   status: "healthy" },
    { name: "muninn",   status: "healthy" },
    { name: "postgres", status: "healthy" },
    { name: "redis",    status: "healthy" },
  ];
  return (
    <div className="statusbar">
      <span className="seg">
        <StatusDot status={wsConnected ? "succeeded" : "failed"}/>
        <span>{wsConnected ? "connected" : "disconnected"}</span>
      </span>
      <span className="seg">queue <b>{queueDepth}</b></span>
      <HealthDots services={services}/>
      <span style={{flex:1}}></span>
      <span className="seg">v0.1.0</span>
      <a className="seg" href="#">↗ docs</a>
    </div>
  );
}



/* ===== hm-dashboard.jsx ===== */
// Huginn & Muninn — Dashboard page

function HmDashboard({ onNav, onOpenRun, onOpenApp, workspaceId }) {
  const D = HM_DATA;
  const ws = D.WORKSPACES.find(w => w.id === workspaceId) || D.WORKSPACES[0];
  const wsApps = D.APPS.filter(a => a.workspaceId === workspaceId);
  const wsAppNames = new Set(wsApps.map(a => a.name));
  const liveRuns = D.LIVE_RUNS.filter(r => wsAppNames.has(r.app));

  const wsRuns24h = wsApps.reduce((s, a) => s + a.runs24h, 0);
  const wsFailed24h = wsApps.reduce((s, a) => s + a.failed24h, 0);
  const successRate = wsRuns24h > 0 ? ((wsRuns24h - wsFailed24h) / wsRuns24h * 100).toFixed(1) : "0";

  const kpis = [
    { label: "24시간 실행",        value: `${wsRuns24h}`,         delta: 12,   dir: "up",   hint: "어제 대비 +12" },
    { label: "성공률",             value: successRate,    unit: "%",   delta: 2.1,  dir: "up",   hint: "+2.1pp" },
    { label: "평균 비용/실행",     value: "$0.072",               delta: 13,   dir: "down", hint: "-$0.011" },
    { label: "승인 대기",           value: liveRuns.filter(r => r.status === "awaiting").length.toString(),                                accent: "amber", hint: "가장 오래된 건 18분 전", link: () => onOpenRun("run_61a45d8") },
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


/* ===== hm-runs.jsx ===== */
// Huginn & Muninn — Run detail (★ flagship) + Runs list

const { useState: useS_RD, useEffect: useE_RD, useMemo: useM_RD } = React;

function HmRunsList({ onOpenRun }) {
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
function HmRunDetail({ runId, onBack, awaitingMode }) {
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
            <span style={{fontFamily:"var(--font-sans)", fontSize:26, fontWeight:800, color:"var(--on-surface)", letterSpacing:"-0.02em"}}>{fmtDuration((Date.now() - new Date(R.started).getTime()) / 1000)}</span>
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

function StepCard({ step: s, arrived }) {
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

function ApprovalPanel({ runId }) {
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

// Patch JsonViewer's highlightJson with diff markup support (just for hm-diff content)

/* ===== hm-pages.jsx ===== */
// Huginn & Muninn — Apps list, App detail (with Events→Runs), Platform Tools, Memories, Settings

const { useState: useS_HP } = React;

// ===================================================================
// /apps — list
// ===================================================================
function HmAppsList({ onOpenApp, onNewApp, workspaceId }) {
  const D = HM_DATA;
  const ws = D.WORKSPACES.find(w => w.id === workspaceId) || D.WORKSPACES[0];
  const apps = D.APPS.filter(a => a.workspaceId === workspaceId);
  return (
    <>
      <HmPageHead title="Applications" sub={`${ws.name} 워크스페이스 · 등록된 ${apps.length}개 · 1개 DAG = 1개 Application`}>
        <Button size="sm" variant="ghost" leftIcon="search">필터</Button>
        <Button size="sm" variant="primary" leftIcon="plus" onClick={onNewApp}>새 Application 등록</Button>
      </HmPageHead>

      <HmCard flush>
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
          <tbody>
            {apps.length === 0 && (
              <tr><td colSpan={7}><Empty icon="layers" title="이 Workspace 에 등록된 Application 이 없어요" sub="첫 Application 을 등록해보세요." action={<Button variant="primary" leftIcon="plus" onClick={onNewApp}>Application 등록</Button>}/></td></tr>
            )}
            {apps.map(a => (
              <tr key={a.id} onClick={() => onOpenApp(a.id)}>
                <td>
                  <div style={{display:"flex", alignItems:"center", gap:10}}>
                    <span style={{width:30,height:30,borderRadius:8,background:"var(--primary-95)",color:"var(--primary-40)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,letterSpacing:"-0.02em"}}>
                      {a.name.split("-").map(s => s[0]).slice(0,2).join("").toUpperCase()}
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
                    {a.output === "pull_request" ? "Pull Request" : "Issue"}
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
        </table>
      </HmCard>
    </>
  );
}

// ===================================================================
// /apps/[id] — detail (Overview / Events / Bindings)
// ===================================================================
function HmAppDetail({ appId, onBack, onOpenRun, initialTab }) {
  const D = HM_DATA;
  const a = D.APPS.find(x => x.id === appId) || D.APPS[0];
  const [tab, setTab] = useS_HP(initialTab || "overview");
  const appEvents = D.EVENTS.filter(e => e.appId === a.id);
  const appRuns = D.RECENT_RUNS.filter(r => r.app === a.name);

  return (
    <>
      <div style={{display:"flex", alignItems:"flex-start", gap:14, marginBottom:18}}>
        <button className="btn btn-icon btn-sm" onClick={onBack}><Icon name="chevronLeft" size={16}/></button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", alignItems:"center", gap:12}}>
            <span style={{width:36,height:36,borderRadius:10,background:"var(--primary-95)",color:"var(--primary-40)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,letterSpacing:"-0.02em"}}>
              {a.name.split("-").map(s => s[0]).slice(0,2).join("").toUpperCase()}
            </span>
            <h1 style={{margin:0, fontFamily:"var(--font-sans)", fontSize:24, fontWeight:800, letterSpacing:"-0.025em"}}>{a.name}</h1>
            <Badge tone="default">{a.kind}</Badge>
          </div>
          <div style={{fontSize:13, color:"var(--on-surface-muted)", marginTop:6, fontFamily:"var(--font-sans)"}}>
            결과 형식: <b style={{color:"var(--on-surface)", fontWeight:600}}>{a.output === "pull_request" ? "Pull Request" : "Issue"}</b> · <a href="#" style={{color:"var(--primary-40)", textDecoration:"none", fontWeight:500}}>{a.repo} ↗</a>
          </div>
        </div>
        <div style={{display:"flex", gap:6}}>
          <Button size="sm" variant="ghost" leftIcon="edit">편집</Button>
          <Button size="sm" variant="ghost">비활성</Button>
          <Button size="sm" variant="ghost" leftIcon="trash" style={{color:"var(--error-50)"}}>삭제</Button>
        </div>
      </div>

      <div style={{marginBottom:18}}>
        <Tabs value={tab} onChange={setTab} tabs={[
          {label:"개요", value:"overview"},
          {label:"Events", value:"events", count: appEvents.length},
          {label:"Memories", value:"memories", count: HM_DATA.MEMORIES.filter(m => m.appId === a.id).length},
          {label:"Platform tools", value:"bindings"},
          {label:"Webhooks", value:"webhooks"},
          {label:"Secrets",  value:"secrets"},
        ]}/>
      </div>

      {tab === "overview" && <OverviewTab a={a} appEvents={appEvents} appRuns={appRuns} onOpenRun={onOpenRun} setTab={setTab}/>}
      {tab === "events"   && <EventsTab a={a} events={appEvents} onOpenRun={onOpenRun}/>}
      {tab === "memories" && <AppMemoriesTab app={a}/>}
      {tab === "bindings" && <BindingsTab app={a}/>}
      {(tab === "webhooks" || tab === "secrets") && (
        <HmCard><div style={{padding:"40px 24px"}}><Empty icon="layers" title={`${tab} 탭`} sub="이 데모에서는 Overview / Events / Memories / Bindings 동작을 보여줍니다." /></div></HmCard>
      )}
    </>
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
    "2. Loki/Saga 에서 해당 namespace 로그 수집",
    "3. VictoriaMetrics 에서 CPU/Memory/QPS 패턴 도출",
    "4. 가설 검증 후 PR/Issue 초안 작성",
    "",
    "> 승인이 필요한 액션은 반드시 `awaiting_approval` 로 멈춤 상태로 널긴다.",
  ].join("\n");
}

function OverviewTab({ a, appEvents, appRuns, onOpenRun, setTab }) {
  const [soul, setSoul] = useS_HP(() => defaultSoulMd(a));
  const [editing, setEditing] = useS_HP(false);
  return (
    <>
      <div className="hm-kpi-grid">
        <HmKpi label="24시간 Events" value={`${appEvents.length}`} hint="webhook 수신"/>
        <HmKpi label="7일 실행"      value={`${a.runs24h * 7}`} delta={4} dir="up"/>
        <HmKpi label="성공률"        value="85.7" unit="%" delta={2.1} dir="up"/>
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
      </HmCard>
    </>
  );
}

// ===================================================================
// Events tab — events with nested runs (1:N)
// ===================================================================
function EventsTab({ a, events, onOpenRun }) {
  const [expanded, setExpanded] = useS_HP(new Set([events[0]?.id]));
  const D = HM_DATA;
  const allRuns = D.RECENT_RUNS;

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
        <div>
          {events.map(e => {
            const isOpen = expanded.has(e.id);
            const runs = e.runIds.map(rid => allRuns.find(r => r.id === rid)).filter(Boolean);
            return (
              <div key={e.id} style={{borderBottom:"1px solid var(--border-subtle)"}}>
                {/* Event row */}
                <div style={{display:"grid", gridTemplateColumns:"36px 130px 1fr 110px 110px 24px", gap:12, alignItems:"center", padding:"16px 20px", cursor:"pointer", background: isOpen ? "var(--surface-container-low)" : "transparent"}}
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
                        <div key={r.id} style={{display:"grid", gridTemplateColumns:"20px 140px 100px 100px 100px 1fr 20px", gap:12, alignItems:"center", padding:"10px 12px", background:"var(--surface)", border:"1px solid var(--border-subtle)", borderRadius:8, cursor:"pointer"}}
                             onClick={(ev) => { ev.stopPropagation(); onOpenRun(r.id); }}>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--on-surface-muted)", fontWeight:600}}>#{i + 1}</span>
                          <StatusLabel status={r.status === "awaiting" ? "awaiting" : r.status}>{r.status === "running" ? "실행 중" : r.status === "awaiting" ? "승인 대기" : r.status === "succeeded" ? "성공" : r.status === "failed" ? "실패" : r.status === "cancelled" ? "취소" : r.status}</StatusLabel>
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

function BindingsTab({ app: a }) {
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
          { gly: "fileText", name: "Saga", inst: "saga-aiplatform ↗", kv: [["default query", `app_name:${a.name} AND level:ERROR`]], isDefault: false },
          { gly: "activity", name: "Tempo", inst: "prod-tempo ↗", kv: [["default service", a.name]], isDefault: true },
          { gly: "activity", name: "VictoriaMetrics", inst: "prod-vm ↗", kv: [["default filter", `{kubernetes_app="${a.name}"}`]], isDefault: true },
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
function AppMemoriesTab({ app: a }) {
  const D = HM_DATA;
  const [q, setQ] = useS_HP("");
  const [includeGlobal, setIncludeGlobal] = useS_HP(true);

  const appMems = D.MEMORIES.filter(m => m.appId === a.id);
  const globalMems = D.MEMORIES.filter(m => m.scope === "global");
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

function MemoryCard({ m, scope, onEdit, onDelete, admin }) {
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
  const D = HM_DATA;
  const [scopeFilter, setScopeFilter] = useS_HP("all");
  const [appFilter, setAppFilter] = useS_HP("all");
  const [q, setQ] = useS_HP("");
  const [method, setMethod] = useS_HP("hybrid");

  let list = D.MEMORIES;
  if (scopeFilter === "global") list = list.filter(m => m.scope === "global");
  if (scopeFilter === "app")    list = list.filter(m => m.scope === "app");
  if (appFilter !== "all")      list = list.filter(m => m.appId === appFilter);
  if (q) list = list.filter(m => m.fact.toLowerCase().includes(q.toLowerCase()) || m.tags.some(t => t.includes(q.toLowerCase())));

  // group by app for app-scoped
  const globalList = list.filter(m => m.scope === "global");
  const appBucket = {};
  list.filter(m => m.scope === "app").forEach(m => {
    if (!appBucket[m.appId]) appBucket[m.appId] = { name: m.appName, items: [] };
    appBucket[m.appId].items.push(m);
  });

  return (
    <>
      <HmPageHead title="Memories" sub="Muninn — 과거 사건에서 distill 된 recall 단편. admin 이 직접 등록·수정할 수 있어요.">
        <Button size="sm" variant="primary" leftIcon="plus">Memory 추가</Button>
      </HmPageHead>

      {/* Stats strip */}
      <div className="hm-kpi-grid" style={{gridTemplateColumns:"repeat(4, 1fr)"}}>
        <HmKpi label="전체 Memories"       value={`${D.MEMORIES.length}`}/>
        <HmKpi label="Global"        value={`${D.MEMORIES.filter(m => m.scope === "global").length}`} hint="모든 Application 공유"/>
        <HmKpi label="App 전용"      value={`${D.MEMORIES.filter(m => m.scope === "app").length}`}/>
        <HmKpi label="Curated"       value={`${D.MEMORIES.filter(m => m.curated).length}`} hint="admin 직접 등록"/>
      </div>

      {/* Search + filter */}
      <HmCard>
        <div style={{display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap"}}>
          <div style={{flex:"1 1 280px"}}>
            <label style={{display:"block", marginBottom:6, fontSize:12, color:"var(--on-surface-muted)", fontWeight:600}}>검색</label>
            <div className="input-with-icon">
              <Icon name="search" size={15}/>
              <input className="input" placeholder="Memory 본문 또는 태그로 검색..." value={q} onChange={e => setQ(e.target.value)} style={{fontSize:14, height:40}}/>
            </div>
          </div>
          <div>
            <label style={{display:"block", marginBottom:6, fontSize:12, color:"var(--on-surface-muted)", fontWeight:600}}>Method</label>
            <Tabs pill value={method} onChange={setMethod} tabs={[
              {label:"hybrid", value:"hybrid"},
              {label:"bm25",   value:"bm25"},
              {label:"vector", value:"vector"},
            ]}/>
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
              ...D.APPS.map(a => ({ value: a.id, label: a.name })),
            ]}/>
          </div>
        </div>
      </HmCard>

      <div style={{height:18}}/>

      {/* Global section */}
      {(scopeFilter !== "app" && globalList.length > 0) && (
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
      {scopeFilter !== "global" && Object.entries(appBucket).map(([appId, bucket]) => (
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

      {list.length === 0 && (
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
function ToolSection({ name, kind, desc, count, brandColor, brandMark, children, onRegister }) {
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
function ToolSubTabs({ tabs, value, onChange }) {
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

function ToolCategoryHeader({ name, desc, tools }) {
  return (
    <header className="hm-subcat-head">
      <div className="hm-subcat-text">
        <h2 className="hm-subcat-name">{name}</h2>
        {desc && <p className="hm-subcat-desc">{desc}</p>}
      </div>
      {tools && <span className="hm-subcat-tools">{tools}</span>}
    </header>
  );
}
// Back-compat alias (no longer used directly but kept for safety)
const ObsCategory = ToolCategoryHeader;
const ToolCategory = ToolCategoryHeader;

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
    { id: "metrics",   label: "Metrics",   tools: "VictoriaMetrics",  count: 2 },
    { id: "logging",   label: "Logging",   tools: "Loki · Saga",      count: 3 },
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
          name="VictoriaMetrics"
          kind="time-series"
          desc="Prometheus 호환 시계열 DB. 고압축·장기 보관이 강점으로, infra/app 메트릭을 쿼리합니다."
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
              { k: "vmselect", name: "prod-vm",         e: "vm-select.observability:8481", st: "healthy", used: 9 },
              { k: "vminsert", name: "prod-vm-ingest",  e: "vm-insert.observability:8480", st: "healthy", used: 9 },
            ]}
          />
        </ToolSection>
      )}

      {sub === "logging" && (<>
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

        <ToolSection
          name="Saga"
          kind="log-platform"
          desc="사내 통합 로그 플랫폼. ai-platform 등 일부 namespace 에서 Saga 라벨로만 접근 가능한 케이스 분석에 사용."
          count={1}
          brandColor="#10B981"
          brandMark={<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="4" y="6" width="16" height="3" rx="1"/><rect x="4" y="11" width="11" height="3" rx="1"/><rect x="4" y="16" width="8" height="3" rx="1"/></svg>}
        >
          <PlatformTable cols={obsCols}
            rows={[
              { name: "saga-aiplatform", e: "ws=ai-platform/prod-svc", st: "healthy", used: 7 },
            ]}
          />
        </ToolSection>
      </>)}

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

function PlatformTable({ rows, cols }) {
  return (
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
  );
}




/* ===== hm-new-app.jsx ===== */
// Huginn & Muninn — New Application registration page
// Single-page form with sectioned cards + live preview sidebar.

const { useState: useS_NA } = React;

function HmNewApp({ workspaceId, onCancel, onCreated }) {
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
      grafana: true, victoriametrics: false,
      loki: true, saga: false,
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

  const errors = {};
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
                       value={`https://huginn.platform.local/hooks/${form.name || "<name>"}`}
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

function FormSection({ step, title, sub, children }) {
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

function NaField({ label, required, hint, error, children }) {
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

function KindCards({ value, onChange }) {
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

function OutputCards({ value, onChange }) {
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
      id:"issue",
      name:"Issue",
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

function PlatformToolsPicker({ bindings, setBinding, kind }) {
  const deploymentTools = [
    { id:"argocd",  name:"ArgoCD",  desc:"GitOps 기반 K8s 배포",  brand:"#EF7B4D", autoFor:["fastapi","triton","other"] },
    { id:"airflow", name:"Airflow", desc:"DAG 오케스트레이션",      brand:"#017CEE", autoFor:["airflow"] },
  ];
  const obsTools = [
    { id:"grafana",         name:"Grafana",         desc:"메트릭 · 로그 · 트레이스 통합 대시보드", brand:"#F46800" },
    { id:"victoriametrics", name:"VictoriaMetrics", desc:"시계열 메트릭",                          brand:"#E74C3C" },
    { id:"loki",            name:"Loki",            desc:"LogQL 기반 로그 검색",                    brand:"#4D9BB8" },
    { id:"saga",            name:"Saga",            desc:"사내 통합 로그 플랫폼",                 brand:"#10B981" },
    { id:"tempo",           name:"Tempo",           desc:"분산 트레이싱",                          brand:"#A88AED" },
    { id:"pyroscope",       name:"Pyroscope",       desc:"CPU · memory 프로파일링",                 brand:"#E8772E" },
  ];
  const registryTools = [
    { id:"harbor", name:"Harbor", desc:"컨테이너 이미지 레지스트리", brand:"#60B932" },
  ];

  const Group = ({ title, tools }) => (
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

function SeverityRow({ value, onChange }) {
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

function NewAppPreview({ form, ws, canSubmit, errors }) {
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
            {form.output === "pull_request" ? "Pull Request" : "Issue"}
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



/* ===== hm-app.jsx ===== */
// Huginn & Muninn — top-level shell with internal routing

const { useState: useS_HMA, useEffect: useE_HMA } = React;

function HmBreadcrumb({ route, onNav, onOpenApp, workspaceId }) {
  const D = HM_DATA;
  const ws = D.WORKSPACES.find(w => w.id === workspaceId);
  const wsCrumb = ws ? { label: ws.name, badgeColor: ws.color } : null;
  const crumbs = [];

  if (route.name === "dashboard") {
    return null;
  }

  if (route.name === "apps") {
    crumbs.push({ label: "Applications", current: true });
  }

  if (route.name === "app-detail") {
    const a = D.APPS.find(x => x.id === route.params.id);
    crumbs.push({ label: "Applications", onClick: () => onNav("apps") });
    crumbs.push({ label: a?.name || route.params.id, current: true });
  }

  if (route.name === "app-new") {
    crumbs.push({ label: "Applications", onClick: () => onNav("apps") });
    crumbs.push({ label: "새 Application 등록", current: true });
  }

  if (route.name === "run-detail") {
    const runId = route.params.id;
    const ev = D.EVENTS.find(e => e.runIds?.includes(runId));
    const a = ev ? D.APPS.find(x => x.id === ev.appId) : null;
    crumbs.push({ label: "Applications", onClick: () => onNav("apps") });
    if (a) {
      crumbs.push({ label: a.name, onClick: () => onOpenApp(a.id) });
      if (ev) crumbs.push({ label: "Events", onClick: () => onOpenApp(a.id, "events") });
      if (ev) crumbs.push({ label: ev.title, onClick: () => onOpenApp(a.id, "events") });
    }
    crumbs.push({ label: `Run ${runId.slice(0, 12)}…`, current: true, mono: true });
  }

  if (route.name === "platform-tools") {
    crumbs.push({ label: "Settings" });
    crumbs.push({ label: "플랫폼 도구", current: true });
  }
  if (route.name === "memories") {
    crumbs.push({ label: "Settings" });
    crumbs.push({ label: "Memories", current: true });
  }

  if (crumbs.length === 0) return null;

  return (
    <nav className="hm-breadcrumb" aria-label="Breadcrumb">
      {wsCrumb && (
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:16, height:16, borderRadius:4, background: wsCrumb.badgeColor, color:"#fff", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700}}>{wsCrumb.label[0]}</span>
          <span className="crumb" style={{color:"var(--on-surface-variant)"}}>{wsCrumb.label}</span>
        </span>
      )}
      {wsCrumb && <Icon name="chevronRight" size={12} style={{color:"var(--on-surface-disabled)"}}/>}
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon name="chevronRight" size={12} style={{color:"var(--on-surface-disabled)"}}/>}
          {c.current ? (
            <span className={`crumb current ${c.mono ? "mono" : ""}`}>{c.label}</span>
          ) : (
            <a href="#" className={`crumb ${c.mono ? "mono" : ""}`} onClick={e => { e.preventDefault(); c.onClick?.(); }}>{c.label}</a>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function HmApp() {
  const [route, setRoute] = useS_HMA({ name: "dashboard", params: {} });
  const [awaitingMode, setAwaitingMode] = useS_HMA(false);
  const [workspaceId, setWorkspaceId] = useS_HMA("ws_ai");

  // Sidebar nav handler
  const onNav = (name) => {
    const map = {
      "dashboard":       { name: "dashboard" },
      "apps":            { name: "apps" },
      "platform-tools":  { name: "platform-tools" },
      "memories":        { name: "memories" },
    };
    const r = map[name] || { name: "dashboard" };
    setRoute({ name: r.name, params: {} });
  };

  const onSwitchWorkspace = (wsId) => {
    setWorkspaceId(wsId);
    // Always reset to dashboard on workspace switch to avoid stale app/run refs
    setRoute({ name: "dashboard", params: {} });
  };

  const onOpenRun = (id) => setRoute({ name: "run-detail", params: { id } });
  const onOpenApp = (id, initialTab) => setRoute({ name: "app-detail", params: { id, initialTab } });

  // What section is active in the sidebar?
  const activeSection = (() => {
    if (route.name === "run-detail") return "apps";
    if (route.name === "app-detail") return "apps";
    if (route.name === "app-new") return "apps";
    if (route.name === "platform-tools") return "platform-tools";
    if (route.name === "memories") return "memories";
    return route.name;
  })();

  return (
    <>
      <HmSidebar section={activeSection} onNav={onNav}
                 workspaceId={workspaceId} onSwitchWorkspace={onSwitchWorkspace}/>
      <HmHeader onNotif={() => { setAwaitingMode(true); setRoute({ name: "run-detail", params: { id: "run_61a45d8" } }); }}/>
      <main className="main">
        <HmBreadcrumb route={route} onNav={onNav} onOpenApp={onOpenApp} workspaceId={workspaceId}/>
        {route.name === "dashboard" && (
          <HmAnnounce
            tone="info"
            icon="sparkle"
            title="Memory recall v2 베타가 켜져 있습니다"
            desc="hybrid (BM25 + vector) 방식으로 Muninn 이 과거 사건을 더 정확하게 회상합니다. 문제가 보이면 Settings → Memories 에서 끌 수 있어요."
            actionLabel="릴리즈 노트 ↗"
          />
        )}
        {route.name === "dashboard"      && <HmDashboard onNav={onNav} onOpenRun={onOpenRun} onOpenApp={onOpenApp} workspaceId={workspaceId}/>}
        {route.name === "apps"           && <HmAppsList onOpenApp={onOpenApp} onNewApp={() => setRoute({ name: "app-new", params: {} })} workspaceId={workspaceId}/>}
        {route.name === "app-new"        && <HmNewApp workspaceId={workspaceId} onCancel={() => setRoute({ name: "apps", params: {} })} onCreated={() => setRoute({ name: "apps", params: {} })}/>}
        {route.name === "app-detail"     && <HmAppDetail appId={route.params.id} initialTab={route.params.initialTab} onBack={() => setRoute({ name: "apps", params: {} })} onOpenRun={onOpenRun}/>}
        {route.name === "run-detail"     && <HmRunDetail runId={route.params.id} awaitingMode={awaitingMode || route.params.id === "run_61a45d8"} onBack={() => { setAwaitingMode(false); setRoute({ name: "apps", params: {} }); }}/>}
        {route.name === "platform-tools" && <HmPlatformTools workspaceId={workspaceId}/>}
        {route.name === "memories"       && <HmMemories workspaceId={workspaceId}/>}
      </main>
      <HmStatusBar wsConnected={true} queueDepth={0}/>
    </>
  );
}



/* ===== app shell (검토용 SSR 빌드: tweaks 패널 제외) ===== */
function App() {
  return (
    <div className="app" data-density="comfortable" data-sidebar="expanded" data-app="hm" data-theme="light">
      <HmApp />
    </div>
  );
}

export default App;
