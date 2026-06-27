"use client";

import React from "react";
import { Icon } from "@/components/icons";

// ⌘K 명령 팔레트 — 기존엔 topbar 검색이 클릭해도 아무 동작 없는 죽은 어포던스였다.
// 백엔드 검색 없이 클라이언트 사이드 페이지 빠른 이동만 제공한다(키보드 ↑/↓/Enter/Esc).
// app-shell 에서 열릴 때만 조건부로 마운트한다 → 매번 깨끗한 초기 상태(effect 내 setState 회피).
//
// 접근성: combobox 패턴 — 포커스는 input 에 유지하고 ↑/↓ 로 aria-activedescendant 를 옮긴다.
// 옵션 버튼은 tabIndex=-1 로 Tab 순환에서 빼고, Tab 은 dialog 안에 가둔다(포커스 트랩).

const DESTS = [
  { label: "Dashboard", sub: "운영 현황", icon: "dashboard", path: "/" },
  { label: "Incidents", sub: "장애 · 대처", icon: "alert", path: "/incidents" },
  { label: "Applications", sub: "관리 대상 앱", icon: "layers", path: "/apps" },
  { label: "새 Application 등록", sub: "앱 추가", icon: "plus", path: "/apps/new" },
  { label: "Platform tools", sub: "설정 · 도구", icon: "settings", path: "/settings/platform-tools" },
  { label: "Memories", sub: "Muninn 기억", icon: "database", path: "/settings/memories" },
];

export function CommandPalette({ onClose, onNavigate }: any) {
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const items = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? DESTS.filter((d) => `${d.label} ${d.sub}`.toLowerCase().includes(s)) : DESTS;
  }, [q]);

  // 마운트 시 입력에 포커스(순수 DOM 부수효과 — setState 없음).
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const go = (d: any) => {
    onNavigate(d.path);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation(); // 모바일 드로어의 document-level ESC 와 동시 닫힘 방지
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[active]) go(items[active]);
    } else if (e.key === "Tab") {
      // 단일 입력 팔레트 — 포커스를 dialog(입력) 안에 가둔다.
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  const activeId = items[active] ? `hm-cmdk-opt-${active}` : undefined;

  return (
    <div className="hm-cmdk-backdrop" onClick={onClose}>
      <div
        className="hm-cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트 — 페이지 이동"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="hm-cmdk-input">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            placeholder="페이지 이동… (apps, incidents, memories)"
            aria-label="명령 검색"
            role="combobox"
            aria-expanded="true"
            aria-controls="hm-cmdk-list"
            aria-activedescendant={activeId}
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </div>
        <div className="hm-cmdk-list" id="hm-cmdk-list" role="listbox" aria-label="이동 가능한 페이지">
          {items.length === 0 && <div className="hm-cmdk-empty">결과 없음</div>}
          {items.map((d, i) => (
            <button
              key={d.path}
              id={`hm-cmdk-opt-${i}`}
              type="button"
              tabIndex={-1}
              role="option"
              aria-selected={i === active}
              className={`hm-cmdk-item ${i === active ? "is-active" : ""}`}
              onMouseMove={() => setActive(i)}
              onClick={() => go(d)}
            >
              <span className="hm-cmdk-ico"><Icon name={d.icon} size={16} /></span>
              <span className="hm-cmdk-meta">
                <span className="hm-cmdk-label">{d.label}</span>
                <span className="hm-cmdk-sub">{d.sub}</span>
              </span>
              <span className="hm-cmdk-go">↵</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
