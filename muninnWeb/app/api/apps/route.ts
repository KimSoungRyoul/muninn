import { NextRequest } from "next/server";
import { ok, created } from "@/lib/api";
import { APPS } from "@/lib/data";

export async function GET(req: NextRequest) {
  const workspace = req.nextUrl.searchParams.get("workspace");
  const list = workspace ? APPS.filter((a) => a.workspaceId === workspace) : APPS;
  return ok(list);
}

export async function POST(req: NextRequest) {
  const form: any = await req.json();
  return created({
    ...form,
    id: "app_new",
    phase: "Ready",
    webhookUrl: "https://muninn-api.platform.local/hooks/" + (form.name ?? "app"),
  });
}
