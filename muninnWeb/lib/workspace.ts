// 멀티테넌시(CONTRACT §2/§C3) — 요청 컨텍스트에서 workspace(=K8s 네임스페이스)를 결정한다.
//
// **헤더 신뢰 경계(§C3)**: 클라이언트가 보낸 x-muninn-workspace(또는 query/body)는 **인증된
// 요청에서만 신뢰**한다. 인증 = Bearer(OIDC JWT 또는 정적 토큰) 검증 통과. 미인증 콘솔(same-origin
// sec-fetch-site 우회)이나 dev 모드(인증 비활성)에서는 클라이언트 헤더를 무시하고 서버가 결정한
// 기본 workspace(env MUNINN_WORKSPACE / 'default')를 쓴다 — 임의 헤더로 다른 테넌트 메모리를
// 읽거나 오염시키는 교차테넌트 접근을 막는다.
//
// 신뢰 시 우선순위: 헤더 x-muninn-workspace > 명시 값(query ?workspace= / body.workspace) > env > 'default'.

import { AsyncLocalStorage } from "node:async_hooks";
import type { NextRequest } from "next/server";
import { resolveWorkspace, defaultWorkspace } from "./db";
import { requireAuth } from "./auth";

const HEADER = "x-muninn-workspace";

// 코파일럿 server tool(defineTool)의 execute 는 요청 컨텍스트(헤더)를 인자로 받지 못하므로,
// /api/copilotkit 런타임이 요청별 workspace 를 이 ALS 에 담아 실행한다. recall/store 도구가
// getCopilotWorkspace() 로 읽어 db 계층에 넘긴다 → 코파일럿 경로에도 멀티테넌시 격리가 적용된다(§C3/§4).
const _copilotWs = new AsyncLocalStorage<string>();

/** 요청별 workspace 를 ALS 에 담아 fn 을 실행한다(코파일럿 런타임 진입점에서 래핑). */
export function runWithCopilotWorkspace<T>(workspace: string, fn: () => T): T {
  return _copilotWs.run(workspace, fn);
}

/** 현재 코파일럿 요청 컨텍스트의 workspace(없으면 서버 기본값). server tool 의 recall/store 가 사용. */
export function getCopilotWorkspace(): string {
  return _copilotWs.getStore() ?? defaultWorkspace();
}

// 위임(불가역) 앞단 인증 게이트(§C2)용 — 요청이 인증을 통과했는지(콘솔 same-origin 포함)를 ALS 에 담아
// server tool(delegate_incident)이 authEnabled() && !authed 시 거부하게 한다. 조회/read 도구는 막지 않는다.
const _copilotAuthed = new AsyncLocalStorage<boolean>();

/** 요청별 인증 통과 여부를 ALS 에 담아 fn 을 실행한다(코파일럿 런타임 진입점에서 래핑). */
export function runWithCopilotAuth<T>(authed: boolean, fn: () => T): T {
  return _copilotAuthed.run(authed, fn);
}

/**
 * 현재 코파일럿 요청이 인증을 통과했는지. **fail-closed**: ALS 미설정(래퍼 밖 호출)이면 false 를 반환해
 * 인증 환경에서 위임이 우회로 열리지 않게 한다. dev(인증 비활성)에서는 호출부 delegate_incident 가
 * `authEnabled() && !getCopilotAuthed()` 로 게이트하므로 authEnabled()=false 가 흡수 → 기존 동작 불변.
 */
export function getCopilotAuthed(): boolean {
  return _copilotAuthed.getStore() ?? false;
}

/**
 * 인증된(토큰/OIDC) 요청에서만 클라이언트 workspace 헤더/값을 신뢰해 workspace 를 결정한다.
 * 미인증(콘솔 sec-fetch-site)·dev 모드에서는 서버 기본 workspace(env/'default')만 쓴다(§C3).
 *
 * requireAuth 를 토큰 전용(allowConsole=false)으로 호출해 "Bearer 검증 통과" 여부만 판정한다.
 *   - null  → 인증 통과(또는 dev 모드). dev 모드는 토큰 자체가 없으니 헤더를 신뢰해도 격리가 무의미
 *             (단일 테넌트). 인증 환경에서만 헤더가 교차테넌트 키가 되므로, 토큰 검증 통과 시에만 신뢰.
 *   - !null → 미인증(콘솔/외부) → 클라이언트 값 무시, 서버 기본값.
 */
export async function workspaceFromRequest(req: NextRequest, explicit?: string | null): Promise<string> {
  const denied = await requireAuth(req, { allowConsole: false });
  if (denied) {
    // 미인증(콘솔 우회/외부) — 클라이언트 헤더/값을 신뢰하지 않고 서버 기본 workspace 사용.
    return defaultWorkspace();
  }
  // 인증 통과(토큰/OIDC) 또는 dev 모드(인증 비활성) — 클라이언트가 명시한 workspace 신뢰.
  const fromHeader = req.headers.get(HEADER)?.trim();
  return resolveWorkspace(fromHeader || explicit || undefined);
}
