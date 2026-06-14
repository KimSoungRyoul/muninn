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
} from "@copilotkit/react-core/v2";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { navPath, appPath } from "@/lib/nav";

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
  const { workspaceId, workspace, workspaces, setWorkspaceId } = useWorkspace();

  // ---- readable context : 코파일럿에게 현재 화면 맥락만 가볍게 노출 ----
  // (실제 앱/실행/메모리 데이터는 server tool 로 조회한다 — ambient mock 으로 경쟁시키지 않음.)
  useAgentContext({
    description: "현재 선택된 워크스페이스(네비게이션·필터 맥락)",
    value: { id: workspace.id, name: workspace.name, role: workspace.role, desc: workspace.desc },
  });

  // ---- 추천 질문 pill (빈 대화 상태) — /goal 오케스트레이션 흐름 안내 ----
  useConfigureSuggestions({
    available: "before-first-message",
    suggestions: [
      { title: "진행 중 장애", message: "어떤 App 에 장애가 발생했고 대처(run)가 진행 중인지 표로 보여줘" },
      { title: "메모리 회상", message: "ai-router-svc 의 외부 timeout 관련 과거 사건을 메모리에서 회상해줘" },
      { title: "대화형 위임", message: "ai-router-svc 장애는 외부 API timeout 일 수 있어. 확인하고 맞으면 fallback 로직 PR 을 만들어 검토받도록 위임해줘" },
      { title: "승인 대기 run", message: "승인 대기(AwaitingApproval) 중인 run 을 보여주고 처리 방법을 알려줘" },
    ],
  });

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
    name: "go_to",
    description: "콘솔 주요 섹션으로 이동한다. incidents=장애↔대처 보드.",
    parameters: z.object({ section: z.enum(["dashboard", "incidents", "apps", "memories", "platform-tools"]) }),
    handler: async ({ section }) => {
      const path = navPath(section);
      router.push(path);
      return json({ navigated: path });
    },
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
