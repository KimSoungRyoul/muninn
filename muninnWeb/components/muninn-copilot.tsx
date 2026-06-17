"use client";

// Muninn 콘솔 코파일럿 — CopilotKit v2 사이드바 + readable context + frontend tools.
//
// 데이터/상태를 만지는 도구(recall·위임·조회·승인·기억화)는 전부 **server tool**(defineTool,
// lib/copilot-tools.ts, app/api/copilotkit/route.ts)로 옮겼다 — 실 K8s CR·postgres 를 다룬다.
// 여기 남는 frontend tool 은 **브라우저에서만 가능한 네비게이션**뿐이다(useFrontendTool).
//
// 최신 문서:
//   provider/sidebar : https://docs.copilotkit.ai/built-in-agent/quickstart
//   frontend tools   : https://docs.copilotkit.ai/built-in-agent/frontend-tools
//   readable context : https://docs.copilotkit.ai/built-in-agent/agent-app-context

import {
  CopilotSidebar,
  useAgentContext,
  useConfigureSuggestions,
  useFrontendTool,
  useHumanInTheLoop,
} from "@copilotkit/react-core/v2";
import { z } from "zod";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { navPath, appPath, sectionFromPath } from "@/lib/nav";
import { useMuninnToolRenderers, DelegationApprovalCard } from "@/components/copilot-tool-cards";

const json = (v: unknown) => JSON.stringify(v, null, 0);

// id 또는 name 으로 앱을 찾는다(네비게이션 보조용). mock 직접 참조 대신 /api/apps 로 조회.
async function resolveApp(key: string): Promise<{ id: string; name: string } | undefined> {
  const k = key.trim().toLowerCase();
  try {
    const apps: any[] = await fetch("/api/apps", { cache: "no-store" }).then((r) => (r.ok ? r.json() : []));
    return apps.find((a) => String(a.id).toLowerCase() === k || String(a.name).toLowerCase() === k);
  } catch {
    return undefined;
  }
}

export function MuninnCopilot() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { workspaceId, workspace, workspaces, setWorkspaceId } = useWorkspace();

  // 현재 화면 맥락(네비게이션) — 식별자 참조/동적 추천에 쓴다. 실 데이터는 server tool 로 조회한다.
  const section = sectionFromPath(pathname);
  const seg = pathname.split("/").filter(Boolean);
  const currentRunId = seg[0] === "runs" && seg[1] ? decodeURIComponent(seg[1]) : null;
  const currentAppId = seg[0] === "apps" && seg[1] ? decodeURIComponent(seg[1]) : null;

  // ---- 생성형 UI : server tool 결과를 채팅에서 카드/표로 렌더(raw JSON blob 정돈) ----
  useMuninnToolRenderers();

  // ---- readable context : 코파일럿에게 현재 화면 맥락만 가볍게 노출 ----
  // (실제 앱/실행/메모리 데이터는 server tool 로 조회한다 — ambient mock 으로 경쟁시키지 않음.)
  useAgentContext({
    description: "현재 선택된 워크스페이스(네비게이션·필터 맥락)",
    value: { id: workspace.id, name: workspace.name, role: workspace.role, desc: workspace.desc },
  });
  // 사용자가 지금 보고 있는 화면(식별자 참조용) — "이 run/앱" 같은 지시어를 해석할 근거.
  // 식별자+섹션만 노출하고 run phase 등 상태는 server tool(get_run_status)에 위임한다.
  useAgentContext({
    description: "사용자가 현재 보고 있는 콘솔 화면(네비게이션 맥락). '이 run/이 앱' 같은 지시어는 여기 식별자로 해석",
    value: { section, path: pathname, currentAppId, currentRunId },
  });

  // ---- 추천 질문 pill (빈 대화 상태) — 현재 화면 맥락에 맞춰 동적 구성 ----
  const suggestions = currentRunId
    ? [
        { title: "이 run 요약", message: `run ${currentRunId} 의 현재 상태(phase·step·cost·승인)와 다음 조치를 요약해줘` },
        { title: "승인 대기 처리", message: `run ${currentRunId} 가 승인 대기면 사유와 처리 방법을 알려줘` },
        { title: "근거 기억", message: `run ${currentRunId} 과 관련된 과거 기억을 회상해줘` },
      ]
    : currentAppId
    ? [
        { title: "이 앱 현황", message: `${currentAppId} 의 진행 중 장애와 최근 실행을 보여줘` },
        { title: "최근 알림", message: `${currentAppId} 에 최근 들어온 알림(이벤트) 이력을 보여줘` },
        { title: "앱 기억", message: `${currentAppId} 에 쌓인 기억을 목록으로 보여줘` },
      ]
    : section === "incidents"
    ? [
        { title: "진행 중 장애", message: "어떤 App 에 장애가 발생했고 대처(run)가 진행 중인지 표로 보여줘" },
        { title: "승인 대기 run", message: "승인 대기(AwaitingApproval) 중인 run 을 보여주고 처리 방법을 알려줘" },
        { title: "대화형 위임", message: "ai-router-svc 장애는 외부 API timeout 일 수 있어. 확인하고 맞으면 fallback 로직 PR 을 만들어 검토받도록 위임해줘" },
      ]
    : section === "memories"
    ? [
        { title: "최근 기억", message: "최근 저장된 기억을 목록으로 보여줘" },
        { title: "메모리 회상", message: "ai-router-svc 의 외부 timeout 관련 과거 사건을 메모리에서 회상해줘" },
      ]
    : [
        { title: "진행 중 장애", message: "어떤 App 에 장애가 발생했고 대처(run)가 진행 중인지 표로 보여줘" },
        { title: "메모리 회상", message: "ai-router-svc 의 외부 timeout 관련 과거 사건을 메모리에서 회상해줘" },
        { title: "대화형 위임", message: "ai-router-svc 장애는 외부 API timeout 일 수 있어. 확인하고 맞으면 fallback 로직 PR 을 만들어 검토받도록 위임해줘" },
        { title: "승인 대기 run", message: "승인 대기(AwaitingApproval) 중인 run 을 보여주고 처리 방법을 알려줘" },
      ];
  useConfigureSuggestions(
    { available: "before-first-message", suggestions },
    [section, currentAppId, currentRunId],
  );

  // ---- 네비게이션 도구(브라우저 전용) ----
  useFrontendTool({
    name: "open_app",
    description: "앱 상세 페이지로 이동한다. app 은 id 또는 name.",
    parameters: z.object({ app: z.string(), tab: z.string().optional().describe("탭(예: agent, runs)") }),
    handler: async ({ app, tab }) => {
      const a = await resolveApp(app);
      if (!a) return json({ error: "not_found", app });
      router.push(appPath(a.id, tab));
      return json({ navigated: appPath(a.id, tab) });
    },
  });

  useFrontendTool({
    name: "open_run",
    description: "실행(HuginnRun) 상세 페이지로 이동한다.",
    parameters: z.object({ runId: z.string() }),
    handler: async ({ runId }) => {
      const path = `/runs/${encodeURIComponent(runId)}`;
      router.push(path);
      return json({ navigated: path });
    },
  });

  useFrontendTool({
    name: "open_incident",
    description:
      "사건(HuginnIssue) 상세 페이지로 이동한다. 위임(delegate_incident)이 반환한 issueName 으로 " +
      "그 사건의 메타·대처(run) 진행을 추적할 때 사용. issueName 은 issue-... 형식.",
    parameters: z.object({ issueName: z.string() }),
    handler: async ({ issueName }) => {
      const path = `/incidents/${encodeURIComponent(issueName)}`;
      router.push(path);
      return json({ navigated: path });
    },
  });

  useFrontendTool({
    name: "go_to",
    description: "콘솔 주요 섹션으로 이동한다. incidents=장애↔대처 보드.",
    parameters: z.object({ section: z.enum(["dashboard", "incidents", "apps", "memories", "platform-tools"]) }),
    handler: async ({ section }) => {
      const path = navPath(section);
      router.push(path);
      return json({ navigated: path });
    },
  });

  // ---- 위임 승인 게이트(HITL) — 위임 직전 사람의 버튼 승인을 받는다 ----
  useHumanInTheLoop({
    name: "request_delegation_approval",
    description:
      "위임(delegate_incident, 불가역)을 실행하기 **직전에** 호출해 사람의 명시적 승인을 버튼으로 받는다. " +
      "반환 approved=true 면 delegate_incident 를 confirmed=true 로 호출하고, false 면 위임을 중단하라. " +
      "recall 로 회상한 근거 기억 id 를 recalledMemoryIds 로 동봉하면 승인 화면에 함께 표시된다.",
    parameters: z.object({
      app: z.string().describe("위임 대상 앱(HuginnAgent name)"),
      goal: z.string().describe("위임 목표(불변 컨텍스트)"),
      severity: z.enum(["info", "warning", "error", "critical"]).optional(),
      recalledMemoryIds: z.array(z.string()).optional().describe("위임 근거로 회상한 메모리 id 들"),
    }),
    render: DelegationApprovalCard,
  });

  useFrontendTool({
    name: "switch_workspace",
    description: "워크스페이스를 전환한다. workspace 는 id, slug 또는 name.",
    parameters: z.object({ workspace: z.string() }),
    handler: async ({ workspace: key }) => {
      const k = key.trim().toLowerCase();
      const ws = workspaces.find((w) => w.id.toLowerCase() === k || w.slug.toLowerCase() === k || w.name.toLowerCase() === k);
      if (!ws) return json({ error: "not_found", workspace: key, available: workspaces.map((w) => ({ id: w.id, name: w.name })) });
      setWorkspaceId(ws.id);
      router.push("/");
      return json({ switched: { id: ws.id, name: ws.name } });
    },
  });

  return (
    <CopilotSidebar
      width={420}
      labels={{
        modalHeaderTitle: "Muninn Assistant",
        // 짧은 환영문 — 긴 문장은 heading 으로 렌더돼 넘침. 사용 예시는 추천 pill 로 안내.
        welcomeMessageText: "안녕하세요 👋 무엇을 도와드릴까요?",
        chatInputPlaceholder: "장애 조회·위임을 Muninn 에게 말해보세요…",
      }}
    />
  );
}
