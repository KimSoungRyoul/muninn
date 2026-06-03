// Huginn & Muninn — top-level shell with internal routing

const { useState: useS_HMA, useEffect: useE_HMA } = React;

function HmBreadcrumb({ route, onNav, onOpenApp, workspaceId }) {
  const D = window.HM_DATA;
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

window.HmApp = HmApp;

