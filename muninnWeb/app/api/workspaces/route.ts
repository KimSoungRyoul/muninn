import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { WORKSPACES } from "@/lib/data";

export async function GET(req: NextRequest) {
  return ok(WORKSPACES);
}
