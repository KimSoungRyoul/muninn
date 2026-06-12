# muninn × A2A 통합 설계

> 상태: **제안(Proposal)** · PoC(V1) 스캐폴딩 포함 (`muninnWeb/lib/a2a`, `muninnWeb/app/a2a`).
> 선행 독해: [`muninn-goal-conversational-delegation.md`](./muninn-goal-conversational-delegation.md)(위임 시퀀스), [`operator-design.md`](./operator-design.md)(§2.2 status 소유권), [`../../muninnWeb/docs/copilotkit-request-flow.md`](../../muninnWeb/docs/copilotkit-request-flow.md).

## 0. 동기 — 왜 A2A 인가

muninn 은 **이미 에이전트↔에이전트 위임을 하고 있다**: 코파일럿(muninnWeb)이 `delegate_incident → HuginnIssue CR 생성 → 폴링(get_run_status)`으로 HuginnAgent(operator·Pod)에게 일을 넘긴다. 그러나 이 이음매는 **표준 프로토콜이 아니라 muninn 내부 규약**(CR + 폴링)으로만 표현된다. 외부 에이전트/오케스트레이터(LangGraph, CrewAI, 타 muninn, CLI)는 muninn 에 일을 위임하려면 K8s CR 문법과 폴링 라우트를 알아야 한다.

[A2A(Agent2Agent)](https://a2a-protocol.org)는 정확히 이 이음매를 위한 **개방형 에이전트간 프로토콜**이다. 흥미롭게도 A2A 의 Task 데이터 모델이 muninn 의 CR 모델과 **거의 1:1로 대응**한다(§2). 따라서 A2A 도입은 새 메커니즘을 발명하는 게 아니라 **이미 있는 시맨틱에 표준 봉투를 씌우는** 작업이다.

영감의 출처는 Grafana Assistant CLI(`grafana/assistant-cli`)다 — CLI 가 서버측 Assistant 에 **A2A API** 로 붙고, 역방향 터널로 서버측 에이전트가 로컬 도구를 실행한다. 그 두 아이디어(① A2A 위임 프로토콜, ② 역방향 도구 터널)를 muninn 에 대입하면 ①은 빈 칸을 채우고, ②는 방향이 반대라 거의 불필요하다(§6).

### 목표 / 비목표

**목표**
- 코파일럿↔HuginnAgent 위임 이음매를 A2A 표준으로 승격(내부·외부 호환).
- 외부 에이전트가 **K8s CR 을 몰라도** muninn DevOps 에이전트에 작업 위임 가능.
- HITL 승인 폴링을 A2A `input-required` 스트리밍/푸시로 대체할 길 확보.

**비목표 (가드레일)**
- **K8s CR 제어 평면을 대체하지 않는다.** CR(status 소유권 `operator-design.md §2.2`, reconcile, 재시도)이 **내구적 진실의 원천**이고 A2A 는 그 위의 **프로토콜 facade** 다. 상태 저장소를 대신하지 않는다.
- 새 LLM 백엔드 도입 없음(기존 `claude-agent-sdk` 유지).
- 에이전트 런타임(`huginnAgentRuntime`)을 무거운 오케스트레이터로 만들지 않는다 — leaf executor 유지, 위임은 muninnWeb 경유.

## 1. 프로토콜 3종 지도에서 muninn 의 위치

| 프로토콜 | 잇는 대상 | muninn 현황 |
|---|---|---|
| **MCP** | 에이전트 ↔ 도구 | 런타임 에이전트가 in-pod 에서 직접 도구 호출(kubectl/gh/git). |
| **AG-UI** | 에이전트 ↔ 사용자/프런트 | **보유** — CopilotKit(`@copilotkit/runtime` 1.59.x, `/v2` 엔트리의 `BuiltInAgent`)가 SSE 로 AG-UI 이벤트 스트림(`app/api/copilotkit/route.ts`). |
| **A2A** | 에이전트 ↔ 에이전트(서버간) | **빠진 계층** — 현재는 `delegate_incident → HuginnIssue → 폴링`으로 대체(`lib/copilot-tools.ts`). |

> 참고: 메모리 plane(recall/store)은 **도구**이므로 A2A 가 아니라 **MCP** 로 노출하는 것이 자연스럽다(§8 결정 4).

## 2. 코어 매핑 — A2A Task 모델 ≡ muninn CR 모델

| A2A 개념 | muninn 대응 | 코드 근거 |
|---|---|---|
| `contextId` (작업 세션, 여러 task 묶음) | **HuginnIssue** (이벤트=세션; 재시도=여러 Run) | `huginnissue_types.go`; CLAUDE.md "Session 혼동 피해 Issue 명명" 의도와 일치 |
| `task.id` (단일 실행) | **HuginnRun** (단일 attempt) | `huginnrun_types.go` |
| `status.state` | `HuginnRun.status.phase` | `incidents.ts:26 phaseToStatus`, `huginnrun_controller.go mapJobToRunStatus` |
| `Message.parts[]` (입력) | `goal` + `userPrompt` | `incidents.ts:316 delegateIncident` |
| `artifacts[]` (산출물) | `Run.status.output` | `runner.py` 보고 |
| `history[]` | `recalledMemoryIds` + report 스트림 | — |
| `pushNotificationConfig` | 승인 콜백(폴링 대체) — **신규** | §6.1 |
| Agent Card `securitySchemes` | SA 토큰 / OAuth | `copilot-anthropic.ts` |

### 2.1 상태 기계 — `TaskState` ↔ `RunPhase`

A2A 의 JSON-RPC 표기(소문자) 기준. (proto/gRPC 바인딩은 `TASK_STATE_*` 대문자.)

| A2A `TaskState` | `HuginnRun.phase` | 전이 주체 | 종류 |
|---|---|---|---|
| `submitted` | `Queued` / `Pending` | Operator | 진행 |
| `working` | `Running` | Operator | 진행 |
| **`input-required`** | **`AwaitingApproval`** | **API(muninnWeb)** | 중단(HITL) |
| `completed` | `Succeeded` | Operator | 종료 |
| `failed` | `Failed` | Operator | 종료 |
| `canceled` | `Cancelled` (`spec.suspend=true`) | API→Operator | 종료 |
| `auth-required` | (예약 — 미사용) | — | 중단 |

가장 절묘한 일치는 **`input-required` ↔ `AwaitingApproval`**: A2A 의 "에이전트가 입력 대기로 멈춤" 상태가 muninn 의 HITL 승인 게이트와 정확히 같다. 매핑 구현은 `muninnWeb/lib/a2a/task-mapper.ts`(`statusToA2AState`, `runVmToTask`, `runVmToStatusUpdate`, `isStreamFinal`) — 매핑 출처는 `HuginnRun.phase` 가 아니라 정규화된 `RunVM.status`(소문자) 다.

## 3. 아키텍처

```
        외부 A2A 클라이언트                              ┌── (V3) in-cluster 에이전트 하위위임
   (LangGraph · CrewAI · CLI · 타 muninn)               │     runner.py → POST A2A task
              │  JSON-RPC / SSE                          │
              ▼                                          │
 ╔══════════════════════════════════════════════════════╪═══════════════════╗
 ║  muninnWeb  =  A2A 게이트웨이 + 에이전트 레지스트리      │                   ║
 ║  GET  /a2a/agents/{app}/card  (HuginnAgent → AgentCard) ◀┘                ║
 ║  POST /a2a/agents/{app}   JSON-RPC                                        ║
 ║     • message/send · message/stream(SSE)                                 ║
 ║     • tasks/get · tasks/cancel · tasks/resubscribe                       ║
 ║     • tasks/pushNotificationConfig/set|get|delete                        ║
 ║  CopilotKit BuiltInAgent (브라우저 copilot, AG-UI) — 보유                   ║
 ║     • (V1) send_task_to_a2a_agent tool ── A2A 클라이언트                    ║
 ╚════════════════════════╤═════════════════════════════════════════════════╝
                          │ lib/a2a(card·task-mapper) → lib/incidents(delegate/approve) 재사용
                          ▼
 ╔══════════════════════════════════════════════════════════════════════════╗
 ║  Kubernetes 제어 평면 (진실의 원천 — 변경 없음)                            ║
 ║    HuginnIssue ≡ contextId  ── HuginnRun ≡ task.id (phase ≡ state)        ║
 ╚════════════════════════╤═════════════════════════════════════════════════╝
                          ▼ Job/Pod (backoffLimit=0)
 ╔══════════════════════════════════════════════════════════════════════════╗
 ║  huginnAgentRuntime (claude-agent-sdk, leaf) — 직접 도구 보유             ║
 ║    → 역방향 터널 불필요(Grafana 와 정반대 방향)                            ║
 ╚══════════════════════════════════════════════════════════════════════════╝
```

## 4. 통합 벡터 (작업량 순)

### V1 — 코파일럿을 A2A 클라이언트로 (가장 적은 작업)
`lib/copilot-tools.ts` 의 server tool 집합에 `send_task_to_a2a_agent` 추가 → 코파일럿이 "1 Issue = 1 에이전트" 결박을 벗어나 **여러 전문 에이전트(진단/PR/알림/외부 프레임워크)** 를 능력 기준으로 조합·라우팅. CR 변경 없음. PoC: `lib/a2a/client-tool.ts`(fetch 기반 JSON-RPC `message/send`). 플래그 `MUNINN_A2A_ENABLED=1` 로 게이트(기본 off → 기존 동작 불변).

### V2 — HuginnAgent 을 A2A 서버로 노출 (Grafana CLI↔Assistant 의 muninn 판)
muninnWeb 가 게이트웨이/레지스트리이므로 여기에:
- **Agent Card**: HuginnAgent CR → `GET /a2a/agents/{app}/card`(PoC). 운영에선 `next.config` rewrite 로 A2A 표준 경로 `/.well-known/agent-card.json` 매핑.
- **A2A 엔드포인트**: `POST /a2a/agents/{app}`(JSON-RPC). `message/send`→`delegateIncident()`, `tasks/get`→`getRunStatus()`/`getIssueRuns()`, `tasks/cancel`→`rejectRun()`. 폴링은 `message/stream`(SSE)로 승격(런타임이 AG-UI 에서 이미 SSE 사용).
- 효과: 외부 클라이언트가 CR 문법 없이 표준 A2A 로 위임. 탐색에서 지적된 "agent registry 부재"가 자연스럽게 채워짐.

### V3 — in-cluster 에이전트 간 위임 (HuginnRun → 자식 HuginnIssue)
현재 런타임은 **leaf executor**(하위 에이전트 생성 없음, `backoffLimit=0`). 에이전트가 이미 가진 `MUNINN_API_ENDPOINT` 로 **A2A task 를 POST** → muninnWeb 가 자식 HuginnIssue 생성. operator 의 교차참조 인덱스(`agentRef`/`issueRef`)로 에이전트 트리 구성. A2A `contextId` 가 부모-자식 Run 을 묶는 표준 봉투.

## 5. API 표면 & 코드 터치포인트

**신규 — `muninnWeb/lib/a2a/`**
- `types.ts` — A2A 최소 타입(AgentCard, Task, TaskState, Message, Part, JSON-RPC 봉투).
- `task-mapper.ts` — `statusToA2AState` / `runVmToTask` / `runVmToStatusUpdate` / `latestRun` / `isStreamFinal` (순수 함수).
- `card.ts` — `huginnAgentToAgentCard(cr, baseUrl)` (순수 변환).
- `gate.ts` — `a2aServerEnabled` / `a2aAuthOk` + 401/404 응답 헬퍼.
- `stream.ts` — SSE 브리지(첫 프레임 Task, 이후 status-update; Issue 종료성으로 final 판정).
- `client-tool.ts` — `send_task_to_a2a_agent` defineTool (V1).

**신규 라우트 — `muninnWeb/app/a2a/agents/[app]/`**
- `card/route.ts` (GET) → Agent Card.
- `route.ts` (POST) → JSON-RPC 디스패처.

**재사용(변경 최소)** — `lib/incidents.ts`(`delegateIncident`/`getRunStatus`/`getIssueRuns`/`approveRun`/`rejectRun`), `lib/k8s.ts`(watch/patch). **소규모 편집** — `lib/copilot-tools.ts` 에 플래그 게이트로 `send_task_to_a2a_agent` 추가.

## 6. 역방향 터널은? — muninn 에선 대부분 불필요

Grafana 터널은 **LLM 이 클라우드에 있어** 로컬 FS/셸로 손을 뻗는다. muninn 에이전트는 **클러스터 안에서 직접 도구를 쥔다**(kubectl/gh/git) — 방향이 반대라 터널이 거의 필요 없다. 단 두 곳만 유효:

### 6.1 승인 폴링 → A2A 스트리밍/푸시로 대체
현재 에이전트는 `MUNINN_API_ENDPOINT` 를 폴링해 승인 결과를 기다린다. A2A `input-required` + `tasks/resubscribe`(SSE) 또는 `pushNotificationConfig`(웹훅 콜백)가 **폴링을 제거**하는 표준 메커니즘 — 터널 양방향성의 유일한 의미 있는 muninn 대응물.

### 6.2 deny-list 보안 모델이 청사진
외부 A2A 에이전트에 도구 실행 채널을 연다면, Grafana 터널의 `.ssh/.env/키 거부 · 파괴적 명령 거부 · 최소 env · 인바운드 포트 0 · 프로젝트 스코프` 가 그대로 muninn 의 `guardrails + RBAC + non-root + Secret 주입` 철학에 포개진다.

## 7. 인증·보안

- **fail-closed 기본값**: 서버 라우트(`/a2a/agents/{app}`)는 `MUNINN_A2A_ENABLED=1` 게이트로 **기본 비활성** — 무인증 비가역 위임이 배포 즉시 노출되는 fail-open 을 막는다. 인증은 기본 bearer 필수이고 로컬 dev 만 `MUNINN_A2A_AUTH_DISABLED=1` 로 명시적 우회.
- **Agent Card `securitySchemes` = bearer**(SA 토큰/OAuth). `/a2a` 진입 시 검증 후에만 `delegateIncident`. Grafana 교훈("`CLI auth tokens` 가 Cloud 전용이라 셀프호스트 데모 불가")을 1급으로 반영 — 인증을 처음부터 셀프호스트 친화로. (PoC 는 형식 검사까지, 운영은 토큰→SA/RBAC/workspace 매핑.)
- **클라이언트(`send_task_to_a2a_agent`) SSRF 가드(fail-closed)**: `A2A_ALLOWED_HOSTS` allowlist 에 있는 호스트만 허용(미설정 시 전면 거부). 가드 통과 URL 에만 bearer 첨부(토큰 유출 방지), 30x redirect 추종 금지(`redirect:"error"`).
- **인증 실패는 HTTP 401**(+`WWW-Authenticate`), 서버 비활성은 404 — A2A 스펙이 인증을 HTTP 전송 계층에서 신호하므로 JSON-RPC 에러코드를 쓰지 않는다.
- **A2A caller → K8s RBAC/workspace 매핑**: 토큰 클레임 → HuginnAgent `workspaceId`. 크로스 워크스페이스는 명시적 허용 필요.
- **guardrails**(`maxIterations→max_turns`, `maxCostUsd→max_budget_usd`) = 위임 작업 한도 = 터널 deny-list 의 대응물. HuginnIssue spec 에 상속(`inheritedGuardrails`).
- **push 콜백 URL**: 허용 도메인 화이트리스트 + 페이로드 서명(SSRF/스푸핑 방지).

## 8. 단계별 롤아웃 & 열린 질문

| 단계 | 범위 | 작업량 | CR 변경 |
|---|---|---|---|
| **P0 스펙** | 이 문서 + PoC 스캐폴딩 | S | 없음 |
| **P1(V1)** | 코파일럿 = A2A 클라이언트 | S | 없음 |
| **P2(V2)** | muninnWeb A2A 서버(Card + /a2a + SSE) | M | 없음(상태 매핑만) |
| **P3(V3)** | in-cluster 하위위임 + push(폴링 제거) | L | `spec.subGoals[]`/callback(선택) |

**열린 질문**
1. **contextId 수명**: 동일 contextId + 후속 메시지 = 같은 Issue 계속? → **제안: contextId=Issue 유지, goal 변경 시 새 Issue.**
2. **멱등성/디둡**: 웹훅 `fingerprint` 디둡을 A2A 진입에도 적용할지.
3. **스트리밍 지연**: operator watch → SSE 지연 허용 범위(폴링 대비 개선이나 watch latency 존재).
4. **A2A vs MCP 경계**: 메모리는 **MCP(도구)**, 위임은 **A2A(에이전트)** — 제안.

## 8.1 후속(Future) — muninn CLI + Claude 플러그인 (언급만)

A2A 서버(V2)가 서면 그 위에 **muninn CLI**(grafana-assistant-cli 대응 thin A2A 클라이언트)와 이를 **MCP 다리**로 감싼 **Claude 플러그인**(원격 위임을 Claude Code 서브에이전트처럼 사용)을 얹을 수 있다. 단 Claude 는 A2A 를 직접 말하지 않으므로 **MCP→A2A 브리지**가 필요하고, A2A task(장시간·HITL 중단)는 **동기 서브에이전트가 아니라 비동기 위임 핸들**(`delegate`/`get_task`/`approve`)로 모델링해야 한다. 본 문서 범위 밖 — 별도 설계로 다룬다.

## 9. PoC(V1) 사용법

`muninnWeb/lib/a2a/README.md` 참고. 서버 라우트는 `MUNINN_A2A_ENABLED=1` 필요(미설정 시 404), 인증은 기본
`Authorization: Bearer` 필수(로컬은 `MUNINN_A2A_AUTH_DISABLED=1` 로 우회). 요약:
```bash
# 서버: MUNINN_A2A_ENABLED=1 MUNINN_A2A_AUTH_DISABLED=1 pnpm dev   (로컬 dev)

# 1) Agent Card 조회 (k8s 연결 시 실제 HuginnAgent, 아니면 mock)
curl -s localhost:3030/a2a/agents/payments-api/card | jq

# 2) A2A message/send 로 위임 (JSON-RPC). 운영에선 -H 'authorization: Bearer <SA토큰>' 추가
curl -s localhost:3030/a2a/agents/payments-api \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send",
       "params":{"message":{"kind":"message","role":"user","messageId":"m1",
       "parts":[{"kind":"text","text":"5xx 급증 조사 후 조치 PR"}]}}}' | jq

# 3) 코파일럿을 A2A 클라이언트로 (V1) — 더미 에이전트 대상 데모(클라이언트는 allowlist 필수)
node scripts/a2a-dummy-agent.mjs                                   # 더미 A2A 에이전트(127.0.0.1:4010)
MUNINN_A2A_ENABLED=1 A2A_ALLOWED_HOSTS=localhost:4010 pnpm dev     # send_task_to_a2a_agent tool 활성화
```
