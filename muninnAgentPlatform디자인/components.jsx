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

Object.assign(window, {
  Button, IconButton, TextInput, Textarea, Select,
  Toggle, Checkbox, Radio,
  Badge, Chip, Tag,
  Avatar, AvatarStack,
  Tabs, Modal, Dropdown, MenuItem,
  Pagination, Breadcrumb, Progress, Toast, Empty, Skeleton,
  Sparkline, Calendar,
});
