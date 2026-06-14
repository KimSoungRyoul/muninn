// GET /api/apps — Application(HuginnAgent) 목록. dual-mode(설계 §2 "Migration in progress"):
//   k8sEnabled() → HuginnAgent CR 목록(listApplications)을 콘솔 Application 형태로 매핑(source:"k8s").
//   미연결(로컬 dev) → mock(APPS) 폴백, source:"mock" 표식.
// POST — HuginnAgent 생성(콘솔→API). 실제 CR 생성은 후속(별도 이슈) — 현재는 mock 응답.

import { NextRequest } from "next/server";
import { ok, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { APPS } from "@/lib/data";
import { k8sEnabled } from "@/lib/k8s";
import { listApplications } from "@/lib/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const workspace = req.nextUrl.searchParams.get("workspace");

  if (k8sEnabled()) {
    try {
      const apps = await listApplications();
      // K8s 에는 workspace 개념이 없으므로 요청 workspace 로 귀속시켜 콘솔 필터에 항상 노출한다(프로토타입).
      // 24h 집계/비용 필드는 추후 metaDB 집계로 대체 — 현재는 0/null 로 채운다.
      const list = apps.map((a) => ({
        id: a.id,
        workspaceId: workspace ?? "ws_ai",
        name: a.name,
        kind: a.kind,
        output: a.output,
        repo: a.repo,
        runs24h: 0,
        failed24h: 0,
        lastRun: null,
        cost7d: 0,
        source: "k8s" as const,
      }));
      return ok(list);
    } catch (e) {
      console.warn("[muninn] /api/apps: k8s 조회 실패 — mock fallback", e);
    }
  }

  const list = workspace ? APPS.filter((a) => a.workspaceId === workspace) : APPS;
  return ok(list.map((a) => ({ ...a, source: "mock" as const })));
}

export async function POST(req: NextRequest) {
  // HuginnAgent 생성(상태변경) — 콘솔+머신 둘 다 허용(CONTRACT §C2).
  const denied = await requireAuth(req);
  if (denied) return denied;
  const form: any = await req.json();
  return created({
    ...form,
    id: "app_new",
    phase: "Ready",
    webhookUrl: "https://muninn-api.platform.local/hooks/" + (form.name ?? "app"),
  });
}
