"use client";

// Muninn 코파일럿 — server tool 결과를 채팅에서 카드/표로 렌더(생성형 UI, P0 갭).
//
// 기본 동작: CopilotKit 은 tool 결과를 raw JSON blob 으로 노출한다 → 운영 콘솔의 스캔성을
// 가장 크게 깎는다. 여기서 useRenderTool(@copilotkit/react-core/v2)로 주요 server tool 에
// 표시 전용 렌더러를 붙이고, catch-all("*")로 나머지 tool 의 JSON blob 을 정돈한다.
//
// 계약(확인): RenderToolProps 의 status 는 "inProgress"|"executing"|"complete". result 는
// **complete 일 때만 string(JSON 직렬화)** — in-progress/executing 은 undefined. 따라서
// 렌더러는 complete 에서만 JSON.parse 한다. 데이터/상태 변경은 server tool 이 하고 여기선
// **표시만** 한다(읽기 전용·자격 비노출·승인/거절 액션 없음 — open_run 안내 버튼만).
//
// 최신 문서: https://docs.copilotkit.ai/ (v2 generative UI / tool rendering)

import React from "react";
import { useRouter } from "next/navigation";
import { useRenderTool, useDefaultRenderTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { StatusLabel, fmtMoney, fmtTimeAgo } from "@/components/common";

// useRenderTool 의 name-scoped 오버로드는 parameters 스키마를 요구한다. 우리는 props.result
// 만 렌더하므로 args 는 느슨하게(검증 throw 없이) 받는다.
const ARGS = z.object({});

// complete 결과(string) 안전 파싱. tool 은 객체를 반환하나 CopilotKit 이 문자열로 직렬화한다.
function parse(result: unknown): any {
  if (result == null) return null;
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return { _raw: result };
  }
}

const RUN_LABEL: Record<string, string> = {
  queued: "대기", running: "실행 중", awaiting: "승인 대기",
  succeeded: "성공", failed: "실패", cancelled: "취소",
};

// ---- 공용 프리미티브(인라인 스타일 + 테마 var fallback — 사이드바에서도 안전하게 렌더) ----
const frameStyle: React.CSSProperties = {
  border: "1px solid var(--outline-variant, rgba(127,127,127,.28))",
  borderRadius: 10,
  background: "var(--surface-container, rgba(127,127,127,.06))",
  padding: "10px 12px",
  margin: "6px 0",
  fontSize: 13,
  lineHeight: 1.5,
};
const headStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  fontSize: 11, fontWeight: 600, letterSpacing: ".02em",
  color: "var(--on-surface-variant, #888)", textTransform: "uppercase", marginBottom: 6,
};
const cellStyle: React.CSSProperties = { padding: "3px 8px 3px 0", verticalAlign: "top" };
const mono: React.CSSProperties = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 12 };

function Frame({ icon, title, children }: any) {
  return (
    <div style={frameStyle}>
      <div style={headStyle}>
        <span aria-hidden>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

// 진행 중 칩(name-scoped/catch-all 공용).
function Progress({ label }: any) {
  return (
    <div style={{ ...frameStyle, opacity: 0.75, display: "flex", alignItems: "center", gap: 8 }}>
      <span className="status-dot is-running" aria-hidden />
      <span style={{ fontSize: 12, color: "var(--on-surface-variant, #888)" }}>{label} 실행 중…</span>
    </div>
  );
}

// {error, note} (db-disabled/k8s-disabled/bad_input/not_found) 안내.
function Notice({ data }: any) {
  const map: Record<string, string> = {
    "db-disabled": "메모리(postgres) 미설정",
    "k8s-disabled": "클러스터 미연결(로컬 dev)",
    bad_input: "입력 누락",
    not_found: "대상 없음",
  };
  return (
    <div style={{ ...frameStyle, borderStyle: "dashed" }}>
      <div style={{ fontSize: 12, color: "var(--on-surface-variant, #888)" }}>
        ⚠ {map[data.error] ?? data.error}
        {data.note ? <> — {data.note}</> : null}
      </div>
    </div>
  );
}

function isErr(d: any) {
  return d && typeof d === "object" && typeof d.error === "string";
}

// ---- get_run_status → 실행 상태 카드 ----
function RunCard({ vm, router }: any) {
  if (!vm || isErr(vm)) return <Notice data={vm ?? { error: "not_found" }} />;
  return (
    <Frame icon="ᚺ" title="HuginnRun 상태">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={mono}>{vm.id}</span>
        <StatusLabel status={vm.status}>{RUN_LABEL[vm.status] ?? vm.phase}</StatusLabel>
        {vm.source === "mock" ? <span style={{ fontSize: 10, opacity: 0.6 }}>(mock)</span> : null}
      </div>
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={cellStyle}>앱</td><td style={cellStyle}>{vm.app}</td></tr>
          <tr><td style={cellStyle}>단계</td><td style={cellStyle}>{vm.step ?? "—"}{vm.max ? ` / ${vm.max}` : ""}</td></tr>
          <tr><td style={cellStyle}>비용</td><td style={cellStyle}>{fmtMoney(vm.cost ?? 0)}</td></tr>
          {vm.approval ? (
            <tr>
              <td style={cellStyle}>승인</td>
              <td style={cellStyle}>
                {vm.approval}
                {vm.approvalReason ? ` · ${vm.approvalReason}` : ""}
                {vm.approvalDecidedBy ? ` (${vm.approvalDecidedBy})` : ""}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {vm.status === "awaiting" ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--on-surface-variant, #888)" }}>
          승인 대기 — 승인/거절은 콘솔에서 직접 결정합니다.
          <button type="button" onClick={() => router.push(`/runs/${encodeURIComponent(vm.id)}`)} style={btnStyle}>
            콘솔에서 열기 →
          </button>
        </div>
      ) : null}
    </Frame>
  );
}

const btnStyle: React.CSSProperties = {
  marginLeft: 8, padding: "2px 8px", fontSize: 11, borderRadius: 6, cursor: "pointer",
  border: "1px solid var(--outline-variant, rgba(127,127,127,.4))",
  background: "transparent", color: "inherit",
};
const primaryBtnStyle: React.CSSProperties = {
  padding: "5px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", fontWeight: 600,
  border: "1px solid var(--primary-40, #b3261e)",
  background: "var(--primary-40, #b3261e)", color: "var(--on-primary, #fff)",
};
const ghostBtnStyle: React.CSSProperties = {
  padding: "5px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
  border: "1px solid var(--outline-variant, rgba(127,127,127,.4))",
  background: "transparent", color: "inherit",
};

// ---- useHumanInTheLoop: 위임(불가역) 실행 전 채팅 내 승인 버튼 게이트 ----
// 결정 주체를 LLM(텍스트 동의 해석)에서 사람(명시적 버튼 클릭)으로 격상한다. respond() 의 반환값
// ({approved})이 tool 결과로 에이전트에 돌아가고, 에이전트는 approved=true 일 때만 delegate_incident
// (confirmed=true)로 진행한다. server 측 confirmed 코드 게이트는 이중 방어선으로 유지된다.
export function DelegationApprovalCard({ status, args, respond }: any) {
  const a = args ?? {};
  if (status === "complete") {
    return (
      <Frame icon="✓" title="위임 승인 처리됨">
        <div style={{ fontSize: 12, color: "var(--on-surface-variant, #888)" }}>{a.app ?? ""} 위임 결정이 전달되었습니다.</div>
      </Frame>
    );
  }
  const ready = status === "executing" && typeof respond === "function";
  return (
    <Frame icon="⚠" title="위임 승인 필요 (불가역)">
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={cellStyle}>앱</td><td style={cellStyle}>{a.app ?? "—"}</td></tr>
          <tr><td style={cellStyle}>목표</td><td style={cellStyle}>{a.goal ?? "—"}</td></tr>
          <tr><td style={cellStyle}>심각도</td><td style={cellStyle}>{a.severity ?? "warning"}</td></tr>
          {a.recalledMemoryIds?.length ? (
            <tr><td style={cellStyle}>근거 기억</td><td style={{ ...cellStyle, ...mono }}>{a.recalledMemoryIds.join(", ")}</td></tr>
          ) : null}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "var(--on-surface-variant, #888)", margin: "6px 0" }}>
        이 위임은 되돌릴 수 없습니다(HuginnIssue 생성 → 에이전트 실행). 진행하시겠습니까?
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={!ready} onClick={() => respond?.({ approved: true })} style={primaryBtnStyle}>위임 실행</button>
        <button type="button" disabled={!ready} onClick={() => respond?.({ approved: false })} style={ghostBtnStyle}>취소</button>
      </div>
    </Frame>
  );
}

// ---- query_incidents → 장애↔대처 표 ----
function IncidentsTable({ data, router }: any) {
  if (isErr(data)) return <Notice data={data} />;
  const items: any[] = data?.items ?? [];
  if (!items.length) return <Frame icon="ᛟ" title="장애 조회"><div style={{ opacity: 0.7 }}>진행 중 장애 없음</div></Frame>;
  return (
    <Frame icon="ᛟ" title={`장애 ${items.length}건`}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--on-surface-variant, #888)", fontSize: 11 }}>
            <th style={cellStyle}>앱</th><th style={cellStyle}>심각도</th><th style={cellStyle}>phase</th><th style={cellStyle}>대처</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.issue} style={{ borderTop: "1px solid var(--outline-variant, rgba(127,127,127,.18))" }}>
              <td style={cellStyle}>{it.app}</td>
              <td style={cellStyle}><StatusLabel status={it.severity}>{it.severity}</StatusLabel></td>
              <td style={cellStyle}>{it.phase}</td>
              <td style={cellStyle}>
                {(it.runs?.length ?? 0)}개
                {it.runs?.length ? (
                  <button type="button" onClick={() => router.push(`/runs/${encodeURIComponent(it.runs[0].id)}`)} style={btnStyle}>열기 →</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

// ---- recall_memory / list_memories → 메모리 리스트 ----
function MemoryList({ data, title }: any) {
  if (isErr(data)) return <Notice data={data} />;
  const items: any[] = data?.items ?? [];
  if (!items.length) return <Frame icon="ᛗ" title={title}><div style={{ opacity: 0.7 }}>해당하는 기억 없음</div></Frame>;
  return (
    <Frame icon="ᛗ" title={`${title} ${items.length}건`}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((m) => (
          <li key={m.id} style={{ borderTop: "1px solid var(--outline-variant, rgba(127,127,127,.18))", paddingTop: 6 }}>
            <div>{m.fact}</div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant, #888)", marginTop: 2 }}>
              {m.scope === "app" ? (m.appName ?? m.appId ?? "app") : "global"}
              {m.curated ? " · ★큐레이션" : ""}
              {Array.isArray(m.tags) && m.tags.length ? ` · ${m.tags.join(", ")}` : ""}
              {m.when ? ` · ${fmtTimeAgo(m.when)}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// ---- list_runs → 실행 표 ----
function RunsTable({ data, router }: any) {
  if (isErr(data)) return <Notice data={data} />;
  const items: any[] = data?.items ?? [];
  if (!items.length) return <Frame icon="ᚺ" title="실행 조회"><div style={{ opacity: 0.7 }}>해당하는 run 없음</div></Frame>;
  return (
    <Frame icon="ᚺ" title={`실행 ${items.length}건`}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--outline-variant, rgba(127,127,127,.18))" }}>
              <td style={{ ...cellStyle, ...mono }}>{r.id}</td>
              <td style={cellStyle}>{r.app}</td>
              <td style={cellStyle}><StatusLabel status={r.status}>{RUN_LABEL[r.status] ?? r.status}</StatusLabel></td>
              <td style={cellStyle}>
                <button type="button" onClick={() => router.push(`/runs/${encodeURIComponent(r.id)}`)} style={btnStyle}>열기 →</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

// ---- delegate_incident → 확인(needsConfirmation) / 결과 카드 ----
function DelegateCard({ data }: any) {
  if (isErr(data)) return <Notice data={data} />;
  if (data?.needsConfirmation) {
    const w = data.willCreate ?? {};
    return (
      <Frame icon="⚠" title="위임 확인 필요 (불가역)">
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={cellStyle}>앱</td><td style={cellStyle}>{w.app}</td></tr>
            <tr><td style={cellStyle}>목표</td><td style={cellStyle}>{w.goal}</td></tr>
            <tr><td style={cellStyle}>심각도</td><td style={cellStyle}>{w.severity ?? "warning"}</td></tr>
            {w.recalledMemoryIds?.length ? (
              <tr><td style={cellStyle}>근거 기억</td><td style={{ ...cellStyle, ...mono }}>{w.recalledMemoryIds.join(", ")}</td></tr>
            ) : null}
          </tbody>
        </table>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--on-surface-variant, #888)" }}>{data.note}</div>
      </Frame>
    );
  }
  if (data?.ok || data?.issueName) {
    return (
      <Frame icon="✓" title="위임 생성됨 (HuginnIssue)">
        <div style={mono}>{data.issueName}</div>
        {data.runName ? <div style={{ ...mono, marginTop: 2 }}>run: {data.runName}</div> : null}
      </Frame>
    );
  }
  return null;
}

const PHASE_TO_STATUS: Record<string, string> = {
  Pending: "queued", Queued: "queued", Running: "running", AwaitingApproval: "awaiting",
  Succeeded: "succeeded", Failed: "failed", Cancelled: "cancelled",
};

// ---- list_inbound_events → 인입 알림 표 ----
function EventsList({ data }: any) {
  if (isErr(data)) return <Notice data={data} />;
  const items: any[] = data?.items ?? [];
  if (!items.length) return <Frame icon="ᛟ" title="인입 알림"><div style={{ opacity: 0.7 }}>최근 알림 없음</div></Frame>;
  return (
    <Frame icon="ᛟ" title={`인입 알림 ${items.length}건`}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--on-surface-variant, #888)", fontSize: 11 }}>
            <th style={cellStyle}>소스</th><th style={cellStyle}>심각도</th><th style={cellStyle}>제목</th><th style={cellStyle}>처리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} style={{ borderTop: "1px solid var(--outline-variant, rgba(127,127,127,.18))" }}>
              <td style={cellStyle}>{e.source ?? "—"}</td>
              <td style={cellStyle}>{e.severity ? <StatusLabel status={e.severity}>{e.severity}</StatusLabel> : "—"}</td>
              <td style={cellStyle}>{e.title ?? "—"}</td>
              <td style={cellStyle}>{e.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

// ---- get_issue_runs → 사건(이슈) 메타 + 대처(run) 카드 ----
function IssueRunsCard({ data, router }: any) {
  if (isErr(data)) return <Notice data={data} />;
  if (!data?.issue) return <CatchAll name="get_issue_runs" data={data} />;
  const status = PHASE_TO_STATUS[data.phase] ?? "queued";
  return (
    <Frame icon="ᛟ" title="사건(HuginnIssue)">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={mono}>{data.issue}</span>
        {data.severity ? <StatusLabel status={data.severity}>{data.severity}</StatusLabel> : null}
        <StatusLabel status={status}>{data.phase}</StatusLabel>
      </div>
      {data.goal ? <div style={{ marginBottom: 4 }}>{data.goal}</div> : null}
      <div style={{ fontSize: 11, color: "var(--on-surface-variant, #888)", marginBottom: 6 }}>
        {data.app ? `앱 ${data.app}` : ""}
        {data.issuingUser ? ` · 개시자 ${data.issuingUser}` : ""}
        {data.dedup > 0 ? ` · dedup ${data.dedup}` : ""}
        {` · 대처 ${data.runs?.length ?? 0}건`}
        {data.outcome ? ` · 결과 ${data.outcome}` : ""}
      </div>
      {data.runs?.length ? (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {data.runs.map((r: any) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--outline-variant, rgba(127,127,127,.18))" }}>
                <td style={{ ...cellStyle, ...mono }}>{r.id}</td>
                <td style={cellStyle}><StatusLabel status={r.status}>{RUN_LABEL[r.status] ?? r.status}</StatusLabel></td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => router.push(`/runs/${encodeURIComponent(r.id)}`)} style={btnStyle}>열기 →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ opacity: 0.7, fontSize: 12 }}>대처(run) 생성 대기 중…</div>
      )}
      <div style={{ marginTop: 6 }}>
        <button type="button" onClick={() => router.push(`/incidents/${encodeURIComponent(data.issue)}`)} style={btnStyle}>
          사건 상세 열기 →
        </button>
      </div>
    </Frame>
  );
}

// ---- catch-all: 나머지 tool 의 raw JSON blob 정돈(표시 억제) ----
function CatchAll({ name, data }: any) {
  if (isErr(data)) return <Notice data={data} />;
  // count/summary/stored 등 자주 쓰는 키만 가볍게 요약하고, 본문 dump 는 하지 않는다.
  let hint = "";
  if (data && typeof data === "object") {
    if (typeof data.count === "number") hint = `${data.count}건`;
    else if (typeof data.summary === "string") hint = data.summary;
    else if (data.stored?.id) hint = `저장됨 (${data.stored.id})`;
    else if (Array.isArray(data.items)) hint = `${data.items.length}건`;
  }
  return (
    <div style={{ ...frameStyle, display: "flex", alignItems: "center", gap: 8, opacity: 0.9 }}>
      <span className="status-dot is-succeeded" aria-hidden />
      <span style={{ fontSize: 12 }}>
        <span style={{ color: "var(--on-surface-variant, #888)" }}>{name}</span>
        {hint ? <> · {hint}</> : <> 완료</>}
      </span>
    </div>
  );
}

/**
 * Muninn server tool 들에 표시 전용 렌더러를 등록한다. MuninnCopilot(= CopilotKit provider
 * 내부 client 컴포넌트)에서 호출한다. 고정 순서로 useRenderTool 을 호출(훅 규칙 준수).
 */
export function useMuninnToolRenderers() {
  const router = useRouter();

  useRenderTool({
    name: "get_run_status", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="실행 상태 조회" /> : <RunCard vm={parse(p.result)} router={router} />),
  });
  useRenderTool({
    name: "query_incidents", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="장애 조회" /> : <IncidentsTable data={parse(p.result)} router={router} />),
  });
  useRenderTool({
    name: "recall_memory", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="메모리 회상" /> : <MemoryList data={parse(p.result)} title="회상한 기억" />),
  });
  useRenderTool({
    name: "list_memories", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="메모리 목록" /> : <MemoryList data={parse(p.result)} title="기억" />),
  });
  useRenderTool({
    name: "list_runs", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="실행 조회" /> : <RunsTable data={parse(p.result)} router={router} />),
  });
  useRenderTool({
    name: "delegate_incident", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="위임" /> : <DelegateCard data={parse(p.result)} />),
  });
  useRenderTool({
    name: "get_issue_runs", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="사건 폴링" /> : <IssueRunsCard data={parse(p.result)} router={router} />),
  });
  useRenderTool({
    name: "list_inbound_events", parameters: ARGS,
    render: (p: any) => (p.status !== "complete" ? <Progress label="인입 알림 조회" /> : <EventsList data={parse(p.result)} />),
  });

  // catch-all: 위에서 처리하지 않은 tool(store_memory/summarize_incident/list_applications/
  // get_application/list_incidents_history 등)의 JSON blob 정돈. 라이브러리 권장 API(useDefaultRenderTool)로
  // 와일드카드 폴백을 등록한다(수기 useRenderTool({name:"*"}) 대신 — 정규 타이핑·내장 default 메커니즘).
  useDefaultRenderTool({
    render: (p) => (p.status !== "complete" ? <Progress label={p.name} /> : <CatchAll name={p.name} data={parse(p.result)} />),
  });
}
