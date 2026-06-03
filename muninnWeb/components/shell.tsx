"use client";
import React from "react";
// Huginn & Muninn — Shell (Header + Sidebar + StatusBar + WorkspaceSwitcher)

import { Icon } from "@/components/icons";
import { Avatar, IconButton } from "@/components/ui";
import { BrandLogo, StatusDot, HealthDots } from "@/components/common";
import { HM_DATA } from "@/lib/data";

const { useState: useS_HMS, useEffect: useE_HMS, useRef: useR_HMS } = React;

function WorkspaceSwitcher({ workspaceId, onSwitch, onManage }: any) {
  const D = HM_DATA;
  const [open, setOpen] = useS_HMS(false);
  const ref = useR_HMS<any>(null);
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

function HmSidebar({ section, onNav, workspaceId, onSwitchWorkspace, onManageWorkspaces }: any) {
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
        <div className="wm" style={{display:"flex", gap:0, flexDirection:"column", alignItems:"flex-start", lineHeight:1.05}}>
          <span style={{fontWeight:800, fontSize:15, letterSpacing:"-0.018em", color:"var(--on-surface)"}}>Huginn Agent</span>
          <small style={{fontSize:11, color:"var(--on-surface-muted)", fontWeight:500, marginTop:2}}>DevOps Agent</small>
        </div>
      </div>
      <WorkspaceSwitcher workspaceId={workspaceId} onSwitch={onSwitchWorkspace} onManage={onManageWorkspaces}/>
      <nav className="sidebar-nav">
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            {g.title && <div className="nav-section">{g.title}{g.admin && <span style={{marginLeft:8,color:"var(--primary-40)",fontSize:10,fontWeight:600,background:"var(--primary-95)",padding:"1px 7px",borderRadius:"9999px",letterSpacing:0,textTransform:"none"}}>admin</span>}</div>}
            {g.items.map((it: any) => (
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

function HmHeader({ onCommand, onNotif, pendingApprovals = 3, todayCost = 4.12 }: any) {
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

function HmStatusBar({ wsConnected = true, queueDepth = 0 }: any) {
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

export { HmSidebar, HmHeader, HmStatusBar, WorkspaceSwitcher };
