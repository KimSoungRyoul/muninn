---
name: copilotkit
description: >-
  muninnWeb(Next.js 콘솔)에 내장된 CopilotKit 코파일럿을 다룰 때 사용. CopilotKit
  설치·업그레이드, 런타임 라우트(/api/copilotkit), frontend tools(useFrontendTool),
  readable context(useAgentContext), 사이드바, 그리고 Claude Code OAuth 토큰으로
  Anthropic 을 호출하는 통합을 추가/수정/디버깅할 때. CopilotKit, copilot, 코파일럿,
  AG-UI, BuiltInAgent, useFrontendTool, CopilotSidebar 등이 언급되면 트리거.
  CopilotKit 은 빠르게 바뀌므로 **항상 docs.copilotkit.ai 의 라이브 문서를 먼저 읽고**
  코드를 작성한다.
---

# CopilotKit (muninnWeb 콘솔 코파일럿)

muninnWeb 콘솔에는 CopilotKit **v2** 기반 코파일럿이 내장돼 있다. 운영자가 자연어로
실행/이벤트/메모리/대시보드를 조회하고, 승인 대기 처리·페이지 이동을 수행한다.

> ⚠️ **CopilotKit 은 API/패키지 구조가 자주 바뀐다.** 아래 "현재 구현"은 스냅샷일 뿐이다.
> 코드를 쓰거나 고치기 전에 **반드시 해당 docs.copilotkit.ai 페이지를 WebFetch 로 최신 확인**하라.
> 버전 불일치(특히 `ai`/`@ai-sdk/anthropic` 와 `@copilotkit/runtime` 간)는 빌드/런타임을 깬다.

## 0) 항상 먼저 — 라이브 문서 읽기 (WebFetch)

작업 주제별 canonical 링크. 작업 시작 시 관련 페이지를 fetch 해 최신 시그니처를 확인하라.

| 주제 | URL |
|------|-----|
| 시작/개요 | https://docs.copilotkit.ai/ |
| Quickstart(셀프호스트) | https://docs.copilotkit.ai/quickstart?copilot-hosting=self-hosted |
| 런타임(백엔드) | https://docs.copilotkit.ai/backend/copilot-runtime |
| BuiltInAgent quickstart | https://docs.copilotkit.ai/built-in-agent/quickstart |
| 모델 선택(provider 문자열) | https://docs.copilotkit.ai/built-in-agent/model-selection |
| 고급 설정(providerOptions) | https://docs.copilotkit.ai/built-in-agent/advanced-configuration |
| **Custom/Factory agent**(자체 LLM·AI SDK) | https://docs.copilotkit.ai/built-in-agent/custom-agent |
| Use any model router | https://docs.copilotkit.ai/backend/custom-agent |
| Frontend tools(useFrontendTool) | https://docs.copilotkit.ai/built-in-agent/frontend-tools |
| Server tools(defineTool) | https://docs.copilotkit.ai/built-in-agent/server-tools |
| Readable context(useAgentContext) | https://docs.copilotkit.ai/built-in-agent/agent-app-context |
| `<CopilotKit>` provider 레퍼런스 | https://docs.copilotkit.ai/reference/components/CopilotKit |
| MCP 연동 | https://docs.copilotkit.ai/agentic-protocols/mcp |

문서가 답을 주지 않으면 설치된 타입 정의를 직접 본다:
`muninnWeb/node_modules/@copilotkit/{runtime,react-core}/dist/v2/**/*.d.mts`,
`@copilotkit/core/dist/index.d.cts`(FrontendTool 등), `@ag-ui/core`(RunAgentInput/Context).

## 1) 현재 구현 (스냅샷 — 라이브 문서로 검증할 것)

CopilotKit **v2** (`@copilotkit/{react-core,runtime}` 의 `./v2` 서브패스). 설치 버전 기준선:
`@copilotkit/react-core|runtime|react-ui@^1.59.5`, `ai@^6`, `@ai-sdk/anthropic@^3`, `zod@^3.25`.

**클라이언트 (`react-core/v2`)**
- provider: `<CopilotKit runtimeUrl="/api/copilotkit">` + `import "@copilotkit/react-core/v2/styles.css"`
- UI: `<CopilotSidebar labels={{ modalHeaderTitle, welcomeMessageText, chatInputPlaceholder }} />`
- frontend tool: `useFrontendTool({ name, description, parameters: z.object(...), handler })`
  (zod 3.25 는 Standard Schema V1 호환 → `parameters` 에 그대로 사용)
- readable context: `useAgentContext({ description, value })` (value 는 JsonSerializable)

**런타임 (`runtime` + `runtime/v2`)**
- `new CopilotRuntime({ agents: { default: agent } })`
- `copilotRuntimeNextJSAppRouterEndpoint({ runtime, endpoint: "/api/copilotkit" })` → `{ handleRequest }`
- agent 는 **classic BuiltInAgent** 에 `model: LanguageModel 인스턴스` 주입:
  `new BuiltInAgent({ model: anthropicProvider("..."), prompt, maxSteps })`.
  classic 모드는 frontend tools·context·프롬프트·멀티스텝을 **자동 처리**한다(factory 모드 불필요).

**muninn 파일**
- `muninnWeb/lib/copilot-anthropic.ts` — OAuth-aware Anthropic provider(아래 §2)
- `muninnWeb/lib/copilot-system.ts` — 코파일럿 system prompt
- `muninnWeb/app/api/copilotkit/route.ts` — 런타임 엔드포인트
- `muninnWeb/app/api/copilotkit/selftest/route.ts` — OAuth→Anthropic 진단 GET
- `muninnWeb/components/copilot-root.tsx` — `<CopilotKit>` client 래퍼
- `muninnWeb/components/muninn-copilot.tsx` — 사이드바 + context + 13개 frontend tools
- 배선: `app/layout.tsx`(provider) · `components/app-shell.tsx`(`<MuninnCopilot/>`)

## 2) muninn 핵심: Claude Code OAuth 토큰으로 Anthropic 호출

muninn 자격은 env(Secret)-only 이고 `CLAUDE_CODE_OAUTH_TOKEN`(구독 OAuth) 또는
`ANTHROPIC_API_KEY` 를 쓴다(루트 CLAUDE.md). OAuth 토큰은 **API 키가 아니다** —
`x-api-key` 로는 401. 대신:

- `Authorization: Bearer <oauth>` + `anthropic-beta: oauth-2025-04-20` 헤더로 인증한다(실측).
- Claude Code identity 프롬프트 스푸핑은 **불필요**하다(커스텀 system prompt 로 200 확인).

`@ai-sdk/anthropic` 는 기본 `x-api-key` 를 보내므로, `createAnthropic({ fetch })` 의 **custom fetch**
에서 `x-api-key` 제거 + `Authorization: Bearer` + oauth beta 헤더를 주입한다
(`lib/copilot-anthropic.ts` 참고). 그 provider 인스턴스를 classic BuiltInAgent 의 `model` 로 넘긴다.

**모델**: 구독 OAuth 는 모델별 rate limit 이 있어 Sonnet/Opus 는 다른 사용과 quota 를 공유하면
429(`rate_limit_error`, body 가 `"Error"`)가 잦다. 콘솔 어시스턴트 기본은
`claude-haiku-4-5-20251001`(빠르고 경합 적음). 필요 시 `COPILOT_MODEL` 로 override.

## 3) Next.js 14 통합 gotcha (해결됨 — 회귀 주의)

- **`export * in a client boundary`**: 서버 컴포넌트(layout)가 `react-core/v2`(use client + export *)
  를 직접 import 하면 Next 14 flight loader 가 거부. → `<CopilotKit>` 를 client 래퍼
  (`copilot-root.tsx`, `"use client"`)로 감싸 v2 모듈이 client→client 로만 도달하게 한다.
- **JsonSerializable 타입 에러**: `useAgentContext({ value })` 에 named interface(예: TopFailingApp)
  를 넣으면 index signature 불일치. → 익명 객체로 map 하거나 `as JsonSerializable` 캐스팅.
- **v2 사이드바 labels 키**: v1 의 `title`/`initial` 아님 → `modalHeaderTitle` / `welcomeMessageText`
  / `chatInputPlaceholder`(전체 키: `CopilotChatDefaultLabels`).
- **standalone 빌드**: `next.config.mjs` 에 `output: "standalone"`. `next start` 는 호환 안 됨 —
  `node .next/standalone/server.js` 로 실행하고 `.next/static` 을 옆에 복사(Dockerfile 이 처리).

## 4) 검증 (로컬 + kind)

```bash
# 타입체크 게이트 + 번들
cd muninnWeb && npm run build

# 로컬: standalone 서버로 OAuth→Anthropic 왕복 확인
CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_OAUTH_TOKEN node .next/standalone/server.js &  # PORT=3030
curl localhost:3030/api/copilotkit/selftest          # {"ok":true,"credential":"oauth",...}
curl localhost:3030/api/copilotkit -X POST -H 'content-type: application/json' \
  --data '{"method":"info"}'                          # agents.default 등록 확인
```

실제 런타임 채팅 호출(단일 라우트 AG-UI 엔벨로프):
```jsonc
POST /api/copilotkit
{ "method": "agent/run",
  "params": { "agentId": "default" },
  "body": { "threadId":"t","runId":"r","state":{},
            "messages":[{"id":"m1","role":"user","content":"..."}],
            "tools":[], "context":[], "forwardedProps":{} } }
// → text/event-stream: RUN_STARTED → TEXT_MESSAGE_* / TOOL_CALL_* → RUN_FINISHED
```

kind E2E 는 `muninnWeb/examples/kind-web.yaml` 헤더의 절차 참고(Podman, Secret 런타임 생성).

## 5) 규칙

- 회사 식별정보 금지 — 예시는 `acme` 등 중립 placeholder(루트 CLAUDE.md).
- 자격(토큰/키)은 이미지·매니페스트·mock 데이터에 **절대 커밋하지 않는다**. Secret 으로만.
- muninnWeb 는 프로토타입(클라이언트 mock, `lib/data` 의 HM_DATA). 코파일럿 도구도 클라이언트 측.
