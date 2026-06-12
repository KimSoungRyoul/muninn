import { NextRequest } from "next/server";
import { ok, notFound, badRequest } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { APPS, EVENTS, RECENT_RUNS } from "@/lib/data";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const app: any = APPS.find((a) => a.id === id);
  if (!app) return notFound("application not found");
  return ok({
    ...app,
    eventCount: EVENTS.filter((e) => e.appId === id).length,
    runs: RECENT_RUNS.filter((r) => r.app === app.name),
  });
}

// HuginnAgent 설정(에이전트 런타임 + 자격) 수정.
// 데모 mock: 비영속. 시크릿 '값'은 절대 저장/응답하지 않고, 등록/해제 키만 반영한다(§6.2).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  // HuginnAgent 설정 수정(상태변경) — 콘솔+머신 둘 다 허용(CONTRACT §C2).
  const denied = await requireAuth(req);
  if (denied) return denied;
  const params = await props.params;
  const { id } = params;
  const app: any = APPS.find((a) => a.id === id);
  if (!app) return notFound("application not found");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const agent = body?.agent;
  if (agent !== undefined) {
    if (typeof agent !== "object" || agent === null) return badRequest("agent must be an object");
    if (agent.image !== undefined && (typeof agent.image !== "string" || agent.image.trim() === "")) {
      return badRequest("agent.image must be a non-empty string");
    }
  }

  // credentials: [{ key, action: "set" | "clear" }] — 값(value)은 받더라도 저장/응답하지 않는다.
  const rawCreds = Array.isArray(body?.credentials) ? body.credentials : [];
  const credentialsUpdated = rawCreds
    .filter((c: any) => c && typeof c.key === "string" && (c.action === "set" || c.action === "clear"))
    .map((c: any) => ({ key: c.key, action: c.action }));

  return ok({
    id,
    agent: agent ?? undefined,
    credentialsUpdated,
    note: "mock: 비영속 — 시크릿 값은 저장하지 않으며 K8s Secret(agent-secrets)으로만 보관됩니다.",
  });
}
