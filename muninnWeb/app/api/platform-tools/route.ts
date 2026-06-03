import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { PLATFORM_TOOLS } from "@/lib/platform-tools";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category"); // deployment | observability | registry
  const list = category
    ? PLATFORM_TOOLS.filter((t) => t.category === category)
    : PLATFORM_TOOLS;
  return ok(list);
}
