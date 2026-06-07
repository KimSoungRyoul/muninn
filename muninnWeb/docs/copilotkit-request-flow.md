# CopilotKit → Claude 요청/응답 경로

muninnWeb 콘솔의 코파일럿(Muninn Copilot)에 프롬프트를 입력했을 때, 요청이 어떤 경로로
Claude(Anthropic API)까지 가고 응답이 돌아오는지 설명한다. **muninn 에 실제 구현·검증된
경로** 기준이다.

## 전체 경로 — 한눈에

```
   당신                                                          Claude
    │                                                              ▲
    │ "승인 대기 run 보여줘"                                       │ HTTPS
    ▼                                                              │
┌────────────┐   ①POST    ┌──────────────┐  ②streamText  ┌─────────────┐
│  BROWSER   │  /api/      │  NEXT.js 서버 │  +oauthFetch  │  ANTHROPIC  │
│ CopilotKit │ ─copilotkit→│  CopilotRuntime│ ───────────→ │  /v1/messages│
│  사이드바  │   (SSE)     │  +BuiltInAgent │              │ haiku-4-5   │
│            │ ←───────────│  +AI SDK       │ ←─────────── │             │
└────────────┘  ③SSE 이벤트└──────────────┘  스트림 응답   └─────────────┘
```

## 단계별 상세

```
┌─────────────────────────────────────────────────────────────────────┐
│ ① BROWSER (localhost:3030, <CopilotSidebar>)                         │
│    프롬프트 + 같이 동봉되는 것:                                       │
│      • useAgentContext(...) → 현재 워크스페이스/앱/런/대시보드 상태   │
│      • useFrontendTool(...) → 도구 "정의"만 (list_runs, approve_run…) │
└───────────────┬─────────────────────────────────────────────────────┘
                │  POST /api/copilotkit   (Accept: text/event-stream)
                │  {
                │    method: "agent/run",
                │    params: { agentId: "default" },
                │    body:  RunAgentInput { messages, tools, context, threadId }
                │  }
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ② NEXT.js 서버 라우트  app/api/copilotkit/route.ts  (Node 런타임)    │
│    copilotRuntimeNextJSAppRouterEndpoint                              │
│      → CopilotRuntime → BuiltInAgent(classic)                         │
│          · system prompt + context + tools 를 합쳐 프롬프트 빌드      │
│          · Vercel AI SDK  streamText({ model: anthropic("haiku-4-5")})│
│                                                                       │
│    @ai-sdk/anthropic provider → "oauthFetch" 가 헤더를 교체:          │
│          ✗ x-api-key                         (제거)                   │
│          ✓ Authorization: Bearer $CLAUDE_CODE_OAUTH_TOKEN             │
│          ✓ anthropic-beta: oauth-2025-04-20                          │
└───────────────┬─────────────────────────────────────────────────────┘
                │  HTTPS POST https://api.anthropic.com/v1/messages
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ③ ANTHROPIC API — Claude(claude-haiku-4-5)                           │
│    스트리밍 응답: 텍스트 + (필요 시) tool_use(list_runs status=awaiting)│
└───────────────┬─────────────────────────────────────────────────────┘
                │  스트림 ← AI SDK ← BuiltInAgent → "AG-UI 이벤트"로 변환
                ▼  text/event-stream (SSE) 로 브라우저에 push
        RUN_STARTED → TEXT_MESSAGE_* → TOOL_CALL_START/ARGS/END → RUN_FINISHED
                │
                │  ④ tool_use 가 오면 → 도구는 "브라우저에서" 실행
                ▼
        useFrontendTool("list_runs") 핸들러 (클라이언트에서 실행)
          └─ HM_DATA(lib/data) 조회 → 결과 문자열 반환
                │
                │  ⑤ 결과를 messages 에 덧붙여 ①~③ 다시 1바퀴
                ▼
        Claude 가 도구 결과를 받아 최종 답변(한국어 표) 생성 → SSE 로 렌더
```

## 꼭 기억할 2가지

```
  (1) 도구 실행은 "브라우저"에서          (2) OAuth 토큰은 서버 밖으로 안 나감
  ───────────────────────────           ─────────────────────────────────
  서버는 Claude의 "list_runs 부르고       브라우저 → /api/copilotkit 만 호출.
  싶다"(tool_use)만 받아 브라우저로        Bearer 토큰 주입은 ②의 서버측
  넘기고, 실제 데이터 조회(HM_DATA)는      oauthFetch 안에서만 발생.
  클라이언트 핸들러가 함.                  → 토큰이 클라이언트로 전달되지 않음.
  그래서 한 번 더 왕복(①~③)이 생김.
```

## 각 단계 ↔ 소스 파일 매핑

| 단계 | 무엇 | 파일 |
|------|------|------|
| ① 사이드바 + context + 도구 정의 | `<CopilotSidebar>`, `useAgentContext`, `useFrontendTool` | `components/muninn-copilot.tsx` |
| ① provider | `<CopilotKit runtimeUrl=...>` | `components/copilot-root.tsx` |
| ② 런타임 엔드포인트 | `CopilotRuntime` + `BuiltInAgent(classic)` + `streamText` | `app/api/copilotkit/route.ts` |
| ② OAuth 주입 | `createAnthropic({ fetch: oauthFetch })` | `lib/copilot-anthropic.ts` |
| ② system prompt | 코파일럿 기본 지침 | `lib/copilot-system.ts` |
| (진단) | OAuth→Anthropic 왕복 점검 GET | `app/api/copilotkit/selftest/route.ts` |

## 단일 라우트 프로토콜 (테스트용)

`/api/copilotkit` 는 v2 단일 라우트 엔벨로프를 받는다. 메서드: `agent/run`, `agent/connect`,
`agent/stop`, `info`, `transcribe`.

```bash
# 런타임/에이전트 등록 확인
curl -X POST http://localhost:3030/api/copilotkit \
  -H 'content-type: application/json' --data '{"method":"info"}'

# 실제 채팅 1회 (SSE 응답)
curl -N -X POST http://localhost:3030/api/copilotkit \
  -H 'content-type: application/json' -H 'accept: text/event-stream' \
  --data '{
    "method":"agent/run",
    "params":{"agentId":"default"},
    "body":{"threadId":"t","runId":"r","state":{},
      "messages":[{"id":"m1","role":"user","content":"안녕"}],
      "tools":[],"context":[],"forwardedProps":{}}
  }'
# → RUN_STARTED → TEXT_MESSAGE_* → (TOOL_CALL_*) → RUN_FINISHED
```

## 모델 / 자격

- 기본 모델: `claude-haiku-4-5-20251001` (구독 OAuth 의 모델별 rate limit 경합이 적음).
  `COPILOT_MODEL` 환경변수로 override.
- 자격은 env(Secret)-only: `CLAUDE_CODE_OAUTH_TOKEN`(우선) 또는 `ANTHROPIC_API_KEY`.
  OAuth 토큰은 `x-api-key` 가 아니라 `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`
  로 인증한다(실측 확인).

> 더 자세한 통합/최신 문서 가이드는 프로젝트 스킬 `.claude/skills/copilotkit/SKILL.md` 참고.
