# A2A 통합 (muninnWeb)

muninn 을 [A2A(Agent2Agent)](https://a2a-protocol.org) 프로토콜로 노출/소비하는 PoC.
설계 전문: [`docs/design/muninn-a2a-integration.md`](../../../docs/design/muninn-a2a-integration.md).

A2A 는 **에이전트↔에이전트** 프로토콜이다(MCP=에이전트↔도구, AG-UI=에이전트↔사용자). muninn 의
`코파일럿 → HuginnAgent` 위임이 이미 A2A 와 동형이라, 여기서는 그 이음매에 표준 봉투를 씌운다.
**CR(HuginnIssue/HuginnRun)이 진실의 원천이고 A2A 는 그 위의 facade** 다.

## 핵심 매핑

| A2A | muninn | 비고 |
|---|---|---|
| `contextId` | HuginnIssue | 작업 세션 |
| `task.id` | HuginnRun | 단일 attempt |
| `TaskState` | `RunPhase`(`task-mapper.ts`) | `input-required` ≡ `AwaitingApproval` |
| `artifacts[]` | `Run.status.output` | |

## 파일

| 파일 | 역할 |
|---|---|
| `types.ts` | A2A 최소 타입 + JSON-RPC 봉투 + 에러 코드(`RPC`) |
| `task-mapper.ts` | `phaseToA2AState` / `statusToA2AState` / `runVmToTask` / `runVmToStatusUpdate` (순수) |
| `card.ts` | `huginnAgentToAgentCard(cr, baseUrl)` (HuginnAgent → Agent Card) |
| `stream.ts` | SSE(`message/stream`·`tasks/resubscribe`) 폴링 브리지 |
| `client-tool.ts` | V1 — `send_task_to_a2a_agent` (코파일럿=A2A 클라이언트) |

라우트: `app/a2a/agents/route.ts`(레지스트리 GET), `app/a2a/agents/[app]/card/route.ts`(Agent Card GET),
`app/a2a/agents/[app]/route.ts`(JSON-RPC POST).

## 환경 변수 (fail-closed)

| 변수 | 기본 | 의미 |
|---|---|---|
| `MUNINN_A2A_ENABLED` | off | **서버 라우트 + 클라이언트 도구 활성화 게이트.** `=1` 이어야 `POST /a2a/agents/{app}` 와 `send_task_to_a2a_agent` 가 동작(미설정 시 비활성 — 무인증 위임 노출 방지). |
| `MUNINN_A2A_AUTH_DISABLED` | off | `=1` 이면 서버 라우트 bearer 인증 우회(**로컬 dev 전용**). 미설정 시 `Authorization: Bearer` 필수. |
| `A2A_ALLOWED_HOSTS` | — | 클라이언트(`send_task_to_a2a_agent`)가 호출할 수 있는 host(또는 host:port) allowlist. **fail-closed: 미설정이면 전면 거부**(SSRF·토큰유출 방지 — loopback/RFC1918/IPv6 를 빠짐없이 막기 어려워 명시적 allowlist 를 요구). 로컬 더미 데모는 `localhost:4010` 추가. |
| `A2A_BEARER` | — | 클라이언트가 대상에 보낼 기본 bearer 토큰(가드 통과 URL 에만 첨부). |

## V2 — muninn 을 A2A 서버로 (kind/클러스터 연결 시)

```bash
export MUNINN_A2A_ENABLED=1            # 서버 라우트 활성(필수)
export MUNINN_A2A_AUTH_DISABLED=1      # 로컬 dev: bearer 우회(운영에선 미설정 + Bearer 헤더 사용)
# 1) 에이전트 레지스트리 / 카드
curl -s localhost:3030/a2a/agents | jq
curl -s localhost:3030/a2a/agents/<HuginnAgent>/card | jq
curl -s 'localhost:3030/a2a/agents/<HuginnAgent>/.well-known/agent-card.json' | jq   # rewrite

# 2) message/send — 위임(HuginnIssue 생성). 반환 Task.id = issueName
curl -s localhost:3030/a2a/agents/<HuginnAgent> \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send",
       "params":{"message":{"kind":"message","role":"user","messageId":"m1",
       "parts":[{"kind":"text","text":"5xx 급증 조사 후 조치"}]}}}' | jq

# 3) tasks/get — Run/Issue 상태 폴링
curl -s localhost:3030/a2a/agents/<HuginnAgent> \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tasks/get","params":{"id":"<run-or-issue>"}}' | jq

# 4) message/stream — SSE 로 submitted→working→completed
curl -N localhost:3030/a2a/agents/<HuginnAgent> \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"message/stream",
       "params":{"message":{"kind":"message","role":"user","messageId":"m2",
       "parts":[{"kind":"text","text":"진단"}]}}}'
```

> `message/send`·`message/stream` 은 `k8sEnabled()` 가 true 여야 실제 위임된다(아니면 `k8s-disabled`).
> 인증: `MUNINN_A2A_REQUIRE_AUTH=1` 이면 `Authorization: Bearer <token>` 필수.

## V1 — 코파일럿을 A2A 클라이언트로 (클러스터 불필요)

```bash
node scripts/a2a-dummy-agent.mjs                            # 더미 A2A 에이전트(:4010)
MUNINN_A2A_ENABLED=1 A2A_ALLOWED_HOSTS=localhost:4010 pnpm dev   # 클라이언트 도구 활성 + 더미 호스트 허용
# 코파일럿에게: "http://localhost:4010 의 A2A 에이전트에게 'X 조사' 위임해줘"
```
