import { NextRequest } from "next/server";
import { ok, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { APPS } from "@/lib/data";

export async function GET(req: NextRequest) {
  const workspace = req.nextUrl.searchParams.get("workspace");
  const list = workspace ? APPS.filter((a) => a.workspaceId === workspace) : APPS;
  return ok(list);
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
