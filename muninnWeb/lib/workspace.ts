// 멀티테넌시(CONTRACT §2) — 요청 컨텍스트에서 workspace(=K8s 네임스페이스)를 결정한다.
//
// 우선순위: 헤더 `x-muninn-workspace` > 명시 값(query ?workspace= / body.workspace) > env MUNINN_WORKSPACE > 'default'.
// 메모리 recall/store/list 가 이 값으로 테넌트 격리한다(교차 테넌트 메모리 누수/포이즌 방지).

import type { NextRequest } from "next/server";
import { resolveWorkspace } from "./db";

const HEADER = "x-muninn-workspace";

/** 요청에서 workspace 결정. explicit 은 query/body 등에서 온 명시 값(헤더 다음 우선순위). */
export function workspaceFromRequest(req: NextRequest, explicit?: string | null): string {
  const fromHeader = req.headers.get(HEADER)?.trim();
  // resolveWorkspace 가 빈 값일 때 env/'default' 로 폴백한다.
  return resolveWorkspace(fromHeader || explicit || undefined);
}
