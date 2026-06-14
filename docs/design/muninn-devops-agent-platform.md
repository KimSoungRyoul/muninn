# Muninn DevOps Agent Platform — 설계서

> **상태**: Draft v0.3 · 2026-06-03 · (v0.2 → v0.3: Operator 구현·검토 반영 — CRD kind `HuginnApplication`→`HuginnAgent` 확정, [operator-design.md](./operator-design.md) 추가)
> **출처**: `muninnAgentPlatform_architecture.png`(아키텍처 그림, 우선) + `muninnAgentPlatform디자인/`(UI 프로토타입)
> **네이밍 규칙**: 아키텍처 그림의 구조를 우선한다. 그림의 `huggin`/`hugginSession`(오타)은 노르드 신화 정식 철자인 **Huginn** 으로 교정한다(짝이 되는 **Muninn** 과 철자 일관성). CRD `kind` 는 **`HuginnAgent`**(운영 대상=영속적 에이전트 정의) / **`HuginnIssue`**(이벤트 1건) / **`HuginnRun`**(실행 1회). 최상위는 그림의 `kind: huggin` 과 그림의 'Agent' 용어(*huggin AgentOperator*)를 반영해 `HuginnAgent` 로 확정했다(초안의 `HuginnApplication` 에서 변경; 도메인상으로는 여전히 "Application" 을 표현). 오타 철자(`hugginAgent` 등)는 쓰지 않는다. 이벤트 CR 은 Claude Agent SDK 의 `session`(대화 transcript)과의 혼동을 피해 `HuginnSession`→`HuginnIssue` 로 개명했다.

---

## 0. 한눈에 보기

**Muninn DevOps Agent Platform** 은 관측(Observability) 신호를 입력으로 받아, 운영 문제를 자율적으로 진단하고 **PR / Issue** 로 해결안을 제출하는 **이벤트 기반 자율 운영(Autonomous Operations) 플랫폼**이다.

오딘의 두 까마귀에서 이름을 따왔다.

| 까마귀 | 역할 | 책임 |
|--------|------|------|
| **Huginn** (사고, *thought*) | **실행 평면 (Agent Plane)** | 이벤트를 받아 Claude Code 기반 에이전트를 실행한다. 로그·트레이스·메트릭을 조사하고, 코드를 읽고, PR/Issue 를 만든다. |
| **Muninn** (기억, *memory*) | **기억 평면 (Memory Plane) + 콘솔** | 과거 사건에서 distill 한 지식(memory)을 저장/회상(recall)한다. 운영자가 보는 UI/API/metaDB 전체를 포함한다. |

핵심 한 줄: **"이벤트(webhook) 또는 운영자 대화(Muninn CopilotKit) → Huginn 이 조사하고 고친다 → Muninn 이 기억하고 제안한다."**

트리거는 **두 경로**이며 둘 다 1급이다(상세: [muninn-goal-conversational-delegation.md](./muninn-goal-conversational-delegation.md)):

```
[Webhook] Grafana/Airflow/ArgoCD ─┐
[Manual]  운영자 ─ CopilotKit ─────┤─▶ Muninn API(=muninnWeb) ─▶ (정규화·dedup·recall) ─▶ K8s API ─▶ HuginnIssue CR
   "외부 timeout 의심, 확인하고 PR"  │                                          │  (Operator 가 watch/reconcile)
                                 Claude Agent SDK loop ◀── HuginnRun(Pod/Job) ──┘
                                 recall(Muninn) · loki · tempo · github
                                                           ▼
                                 PR / Issue  +  Muninn 에 기억 저장·요약·이력
```

> **Muninn API = muninnWeb.** 게이트웨이(이벤트/대화 수신, K8s CR 생성, 에이전트 보고 수신/status
> PATCH, 메모리 recall/store 중개)는 별도 서비스가 아니라 muninnWeb Next.js 앱의 `app/api/**` 가 겸한다
> (`@kubernetes/client-node` + `pg`). 운영자 대화형 진입은 CopilotKit ChatWidget 이다.

---

## 1. 설계 입력 분석

### 1.1 아키텍처 그림(우선)에서 도출한 사실

| 그림의 요소 | 해석 |
|-------------|------|
| `User → Muninn UI → Muninn API → PostgreSQL(metaDB)` | 운영자 콘솔. metaDB 에 application·event·run·memory 상태를 저장하고 조회한다. |
| "N개의 memories 를 보고 application 데이터/상태/회상 확인" | Muninn UI 의 핵심 가치는 **에이전트가 무엇을 기억하고 어떻게 회상했는지**를 운영자가 검수하는 것. |
| `Huginn Agent Operator` | Kubernetes Operator. CR 을 watch 하며 조정(reconcile)한다. |
| `Huginn Custom Resource` (그림 표기 `kind: huggin`, `name: ai-router-svc-huggin`) → 정식 **`kind: HuginnAgent`**, `apiVersion: muninn.io/v1beta1`. "Application 들로 한번에 생성", `pvc(~/.claude/)` 공유 | Application 1개 = CR 1개. PVC 로 `~/.claude`(Claude Code **프로젝트 설정/Claude SDK transcript**)를 마운트한다. **인증 키는 PVC 가 아니라 env(Secret)** 로 주입한다(§5.1). |
| `Huginn Issue` (그림 표기 `kind: hugginSession`) → 정식 **`kind: HuginnIssue`** | **이벤트 페이로드 1건 = HuginnIssue 1개.** 동시에 여러 이슈가 뜬다. |
| `Huginn Run` (이슈 안에 여러 개) → **`kind: HuginnRun`** | 이슈 내부의 실제 에이전트 실행. retry/replay 시 run 이 늘어난다. |
| `claude_skill.sh` 박스: goal / muninn global system prompt / 운영팀 settings / claude code huginn run / event payload | 에이전트 컨테이너의 **엔트리포인트와 주입 컨텍스트**. goal 은 "이 event payload 의 문제를 인식하고 처리하라". |
| `grafana alert (webhook)` → `event payload` | 진입 트리거는 Grafana alerting webhook. |
| `grafana datasource: mimir, loki, tempo` | 관측 백엔드: **메트릭=Mimir, 로그=Loki, 트레이스=Tempo** (에이전트의 조사 도구). |
| `Application(faiss) name: ai router service`, `Application(airflow Dags)`, `Application 들` | 운영 대상은 다양한 워크로드(추론 서버/배치 DAG 등). |
| "Python 이나 TypeScript 로 작성하세요 — Agent SDK" | 에이전트 구현은 **Claude Agent SDK** (https://code.claude.com/docs/ko/sdk/agent-sdk/overview). |

### 1.2 UI 프로토타입에서 도출한 도메인 모델

`muninnAgentPlatform디자인/hm-*.jsx` 분석으로 확정된 엔티티:

- **Workspace**: 멀티테넌시 경계(AI Platform / Payments / Data Platform). `role: owner|member`, `color`, `appCount`.
- **Application**: 운영 대상. `kind: triton|fastapi|airflow|other`, `output: pull_request|github_issue`, `repo`, 집계지표 `runs24h/failed24h/cost7d`(§8.1).
- **Event**: 트리거. `source: grafana|airflow|argocd|manual`, `severity: info|warning|error|critical`, `fingerprint`(dedup key), `dedup`(중복 횟수), `runIds[]`(파생; §8.2).
- **Run**: 에이전트 1회 실행. 상태(§3.4), `step/maxStep`, `cost/maxCost`, `tokens/maxTokens`, `duration`, `output`(PR #842 / Issue #143 …).
- **Step**: Run 내부 단계. `kind: thought|tool|tool-pending`(§5.3).
- **Memory**: Muninn 지식 단편. `scope: global|app`, `fact`(Markdown), `tags[]`, `score`(0~1), `curated`, `run`(출처), `when`.
- **Platform Tool**: admin 이 등록하는 인프라 도구 인스턴스(ArgoCD/Airflow/Grafana/메트릭/Loki/Saga/Tempo/Pyroscope/Harbor).

> **그림 vs 프로토타입 차이 메모**: 그림은 메트릭 datasource 를 `mimir`, 프로토타입 Platform Tools 는 `VictoriaMetrics` 로 표기. 둘 다 Prometheus 호환 TSDB 이므로 **"Prometheus 호환 메트릭 백엔드(pluggable)"** 로 추상화하고, 그림 우선 원칙에 따라 기본 예시는 Mimir 를 쓴다.

---

## 2. 아키텍처 개요

```mermaid
flowchart TB
    subgraph EXT["External / Observability"]
        GRAF["Grafana Alerting<br/>(webhook)"]
        MIMIR["Mimir<br/>(metrics)"]
        LOKI["Loki<br/>(logs)"]
        TEMPO["Tempo<br/>(traces)"]
        GH["GitHub"]
        ARGO["ArgoCD"]
        AF["Airflow"]
    end
    subgraph CTRL["Control Plane (Muninn)"]
        UI["Muninn UI"]
        API["Muninn API<br/>(gateway · REST · WS/SSE · RBAC)"]
        MEM["Muninn Memory Service<br/>(recall/store · hybrid)"]
    end
    subgraph K8S["Agent Plane (Huginn, on Kubernetes)"]
        APISRV["K8s API Server"]
        OP["Huginn Operator<br/>(controller-runtime)"]
        SESS["HuginnIssue CR"]
        RUN["HuginnRun CR → Job/Pod"]
    end
    subgraph DATA["Data Plane"]
        PG["PostgreSQL + pgvector"]
        REDIS["Redis<br/>(dedup · queue · cache)"]
        PVC["PVC ~/.claude"]
    end
    User --> UI --> API
    GRAF -- "alert payload" --> API
    API -- "정규화·dedup" --> REDIS
    API -- "create CR (kubectl/client-go)" --> APISRV
    APISRV -- "watch" --> OP
    OP --> SESS --> RUN
    RUN -- "recall/store (MCP)" --> MEM
    MEM <--> PG
    RUN --> LOKI & TEMPO & MIMIR & GH & ARGO & AF
    RUN -- "mount" --> PVC
    RUN -- "PR/Issue" --> GH
    RUN -. "status/transcript 보고 (REST)" .-> API
    API <--> PG
    API <--> REDIS
    UI -. "live runs (WS/SSE)" .-> API
```

### 2.1 컴포넌트 책임 (프로토타입 status bar 와 1:1)

`gateway · huginn · muninn · postgres · redis` 가 곧 런타임 컴포넌트다.

| 컴포넌트 | 표기 | 역할 | 기술(제안) |
|----------|------|------|-----------|
| **Muninn UI** | Muninn UI | 운영자 콘솔 | React 18 + Next.js, Pretendard/JetBrains Mono |
| **Muninn API (Gateway)** | `gateway` | webhook 수신, **K8s CR 생성**, 정규화, REST, WS/SSE, 인증/RBAC, **모든 도구 호출 감사** | FastAPI(Python) |
| **Muninn Memory Service** | `muninn` | recall/store, hybrid 검색, 임베딩 | Python + pgvector |
| **Huginn Operator** | `huginn` | CR watch/reconcile, Job 수명주기 | Go(controller-runtime) 또는 kopf(Python) |
| **Agent Runtime** | Huginn Run | 에이전트 실행 루프 | **Claude Agent SDK** (Python/TS) |
| **PostgreSQL** | `postgres` | metaDB + memory(pgvector) | PostgreSQL 16 + pgvector |
| **Redis** | `redis` | dedup, 작업 큐, 캐시 | Redis 7 |

> **구현 현황**: 위 표·다이어그램은 *목표 설계*다. 현재 구현은 단순화돼 있다 — **Muninn API·Muninn Memory Service 는 별도 서비스가 아니라 muninnWeb(Next.js) 한 앱이 겸한다**(§0 콜아웃; `app/api/**` 게이트웨이 + recall/store). **Redis 와 FastAPI·별도 Memory Service 는 구현되지 않았다**: dedup 은 Redis 가 아니라 활성 HuginnIssue CR 조회 + metaDB `inbound_event` 영속으로 구현됨(§4.4 — Redis 없이 동작), 메모리는 muninnWeb + 외부 **postgres**(Drizzle)에 저장하고 **텍스트 검색**(`to_tsvector`/`ts_rank_cd`)만 쓴다 — 임베딩·**pgvector·확장 불필요**(§7.4). 따라서 다이어그램의 `API`/`MEM` 노드는 muninnWeb 하나로, `REDIS` 노드와 `PG` 의 pgvector 는 현 구현에 없다고 읽어라.

### 2.2 Issue 생성 경로 (중요)

Operator 는 **외부 webhook 수신자가 아니라 K8s API watch 기반 controller** 다. 따라서 흐름은:

1. Grafana → **Muninn API**(`POST /hooks/{app}`) 가 webhook 을 받는다.
2. API 가 payload 를 **정규화**(§4.3)하고 **dedup**(§4.4)을 평가한다.
3. 신규/재발이면 API 가 **K8s API Server 에 `HuginnIssue` CR 을 생성**(client-go/Python client)한다. 원본 alert 는 Secret `{issue}-event`, 정규화 구조는 `spec.event` 에 둔다.
4. Operator 의 watch 가 이를 감지해 `HuginnRun`(→ Job/Pod)을 만든다.

> 즉 "API → OP" 화살표는 직접 RPC 가 아니라 **CR 생성을 통한 간접 트리거**다.

---

## 3. CRD 설계 (`muninn.io/v1beta1`)

```mermaid
flowchart LR
    APP["HuginnAgent<br/>(운영 대상 1개)"]
    SESS["HuginnIssue<br/>(이벤트 1건)"]
    RUN["HuginnRun<br/>(실행 1회 · Job)"]
    APP -- "1:N · spec 상속(identity·guardrails·bindings)" --> SESS
    SESS -- "1:N · retry/replay" --> RUN
```

전체 샘플: [`examples/`](./examples/). 아래는 핵심과 변경점만.

### 3.1 `HuginnAgent`

UI "새 Application 등록" 6단계 위저드 → spec 직렬화.

**UI 폼 → spec 매핑** (workspaceId 가 0단계로 추가됨)

| UI 폼 | CRD 경로 |
|-------|----------|
| 0. Workspace(헤더에서 선택) | **`spec.workspaceId`** (required, immutable) |
| 1. 이름/설명/repo | `metadata.name`, `spec.description`, `spec.source.repo` |
| 2. 종류(kind) | `spec.kind` (배포 바인딩 자동 결정의 **UX 힌트**; 저장은 명시적 `spec.bindings`) |
| 3. 결과 형식 | `spec.output` |
| 4. Platform Tools 토글 | `spec.bindings.*` |
| 5. 이벤트 트리거 | `spec.trigger.severityThreshold` |
| 6. 안전 한도 | `spec.guardrails.*` |
| (자동) SOUL.md | `spec.agent.soulRef`(ConfigMap 이름; §8.3 동기화) |

**v0.2 변경**
- **`spec.workspaceId` 를 1급 필드로** 승격(라벨이 아니라 spec). ValidatingAdmissionWebhook 이 (a) 불변성, (b) 생성자의 워크스페이스 멤버십(owner|member)을 검증한다. (라벨 `muninn.io/workspace` 는 selector 용 보조로만 유지.)
- `spec.kind` 의 "배포 도구 자동 선택(airflow→Airflow, 그 외→ArgoCD)" 은 **폼 UX 헬퍼**이며, 최종 권위는 저장된 `spec.bindings`.
- `status.conditions[]`(Ready 등 K8s 표준), `status.activeIssues`(Operator 가 reconcile 주기마다 `phase∈{Pending,Running,AwaitingApproval}` 이슈 수로 계산; §8.4).
- `spec.source.pr.approvalTriggers`(§6.4) 로 승인 조건을 정책화.

### 3.2 `HuginnIssue`

**이벤트 1건당 1개**. Gateway 가 dedup 통과 후 생성.

- `spec.agentRef`(부모 HuginnAgent 이름), `spec.event`(정규화 payload; 원본은 Secret 참조), `spec.goal`.
- **상속**: `spec.inheritedGuardrails`(maxIterations/maxCostUsd) + `spec.inheritedBindings`(Application.spec.bindings 복사, Phase 2 에서 이슈 override 허용). `spec.identity` 도 Application 에서 복사.
- `spec.retryPolicy.maxRuns`(이슈가 만들 수 있는 Run 상한). **Job `backoffLimit` 으로 매핑하지 않는다** — 재시도는 HuginnIssue 컨트롤러가 *새 attempt* `HuginnRun` 을 만드는 방식이며, Run 의 Job 은 항상 `backoffLimit=0` 으로 생성된다(에이전트 실행은 non-idempotent → pod-level 재시도 금지; operator-design §2.1, 핵심 계약 #2).
- `status.phase`(§3.4), `status.conditions[]`(Approved/OutputReady/Reconciled 등), `status.runRefs[]`, `status.dedupCount`(그림의 `dedup:17`), `status.approval`(§6.4 — AwaitingApproval 시 해당 Run 들의 승인 메타 집계).

### 3.3 `HuginnRun`

이슈 내부 실제 실행 1회. **MVP 는 K8s Job 으로 실행**(native `activeDeadlineSeconds`·`ttlSecondsAfterFinished` 활용). Job 은 `backoffLimit=0` 고정 — pod-level 재시도는 쓰지 않는다(아래 참조).

- `spec.issueRef`, `spec.attempt`, `spec.jobTemplate.podSpec`(image, `command:["/usr/local/bin/claude_skill.sh"]`, volumeMounts `~/.claude`, env, **resources**).
- **재시도/타임아웃/정리**: `spec.timeoutSeconds`(기본 3600)→`activeDeadlineSeconds`, `spec.ttlSecondsAfterFinished`(기본 86400). **재시도는 Job `backoffLimit` 이 아니다** — Job 은 `backoffLimit=0` 으로 고정되고(에이전트 실행 non-idempotent), 재시도는 HuginnIssue 컨트롤러가 새 attempt `HuginnRun` 을 생성하는 방식으로 수행하며 상한은 `HuginnIssue.retryPolicy.maxRuns`(기본 3)다(operator-design §2.1, 핵심 계약 #2).
- `status`: `phase`(§3.4), `conditions[]`, `step/maxStep`, `cost`, `tokens`, **`maxCostUsd`/`maxTokens`**(생성 시 이슈 상속값 복사), `startedAt`/**`finishedAt`**, `recalledMemoryIds[]`(§5.6), `output`, `approval`(§6.4).
- **주입 메커니즘**: Operator 가 Run 생성 시 `HuginnAgent.spec.agent.soulRef` → `MUNINN_SOUL_REF` env, `inheritedGuardrails` → env, 인증 Secret → env 로 전파(§5.1).

> **Pod vs Job**: Job 은 표준 필드로 타임아웃(`activeDeadlineSeconds`)/정리(`ttlSecondsAfterFinished`)를 얻으므로 MVP 채택(`backoffLimit=0` — pod-level 재시도는 쓰지 않고 Issue 컨트롤러가 새 attempt Run 으로 재시도). 장기 실행 이슈(Claude session 컨텍스트 재사용)이 필요하면 Open Question §11-3 참조.

### 3.4 상태 모델 & 수명주기

CRD `status.phase` 는 **K8s 관례에 따라 PascalCase**, 표현 계층(UI 프로토타입·SQL `status`)은 **소문자**를 쓴다. Muninn API 가 변환한다.

| CRD phase (PascalCase) | UI/SQL (소문자) | 의미 |
|------------------------|-----------------|------|
| `Queued` | `queued` | Run CR 생성됨, Pod 노드 스케줄 대기 |
| `Pending` | `pending` | Pod 생성됨, 컨테이너 시작 중 |
| `Running` | `running` | 에이전트 실행 중 |
| `AwaitingApproval` | `awaiting` | Human-in-the-loop 승인 대기(§6.4) |
| `Succeeded` | `succeeded` | 완료(PR/Issue 발행) |
| `Failed` | `failed` | 실패(guardrail/오류/만료) |
| `Cancelled` | `cancelled` | 사용자 취소/승인 거절 |

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Pending
    Pending --> Running
    Running --> AwaitingApproval: 승인 조건 trip
    AwaitingApproval --> Running: 승인
    AwaitingApproval --> Cancelled: 거절/만료
    Running --> Succeeded
    Running --> Failed
    Running --> Cancelled
```

- **`status.step`** = 현재 실행 중 Step 의 `ix`(1부터). **`status.maxStep`** = `guardrails.maxIterations` 상한. 완료 step 수는 `step` 테이블 `count(*)`.
- **삭제/정리**: Run/Issue 는 `ownerReferences` 로 cascade GC. 진행 중 Pod 의 graceful shutdown 이 필요하면 finalizer 추가(§11). conditions 로 전이 사유(거절/타임아웃/비용초과)를 기록한다.
- **모든 CR(App/Issue/Run)** 의 `status.conditions[]` 는 `{type,status,reason,message,lastTransitionTime}` 표준 구조.

---

## 4. 이벤트 → 이슈 → 런 흐름

```mermaid
sequenceDiagram
    autonumber
    participant G as Grafana
    participant API as Muninn API
    participant R as Redis
    participant K as K8s API Server
    participant OP as Huginn Operator
    participant A as Agent Job (Run)
    participant M as Muninn Memory
    participant GH as GitHub

    G->>API: POST /hooks/{app} (alertmanager payload)
    API->>API: 정규화(§4.3) + severity 필터
    API->>R: dedup(app,fingerprint) · dailyRunCap (§4.4)
    alt 신규 fingerprint 또는 재발
        API->>K: create HuginnIssue (spec.event + goal), Secret {sess}-event
        K-->>OP: watch 이벤트
        OP->>K: create HuginnRun → Job/Pod (claude_skill.sh)
        Note over A: 주입: goal · global prompt · team settings · event payload ·<br/>SOUL.md · guardrails · ANTHROPIC_API_KEY(env) · ~/.claude(PVC)
        A->>M: recall(query,k) (MCP)
        M-->>A: top memories (id, fact, score, reason)
        loop SDK loop (max_turns ≤ maxIterations, max_budget_usd ≤ maxCostUsd)
            A->>A: thought
            A->>+GH: tool call (또는 loki/tempo/mimir)
            GH-->>-A: result
            A-->>API: step/transcript stream (REST/WS)
        end
        alt output=pull_request & approvalTriggers 충족
            A->>API: request-approval(reasons) → Issue.phase=AwaitingApproval
            API-->>A: 운영자 승인/거절(폴링/콜백)
        end
        A->>GH: create PR(draft) 또는 Issue
        A->>M: store(fact, scope=app, run)
        A->>API: recall-report + finishedAt → Run.status=Succeeded
    else 중복(dedup hit)
        API->>R: dedupCount++ (이슈 미생성)
    end
```

### 4.1 핵심 규칙
- **1 Event = 1 Issue, 1 Issue = N Run**(retry/replay).
- **Guardrails**: SDK 파라미터로 집행(§5.4). UI Run 상세 Meter 가 한도 대비 진행률 시각화.
- **Severity gate**: `severityThreshold` 미만 alert 는 Gateway 즉시 drop.

### 4.2 Muninn API 의 역할
webhook gateway + **K8s CR 생성자** + event normalizer + 도구 호출 audit + WS/SSE 스트림 허브. 데이터 조회 endpoint 는 §8.1.

### 4.3 정규화된 Event Payload 스키마
Grafana alertmanager webhook(`alerts[]`, `labels`, `annotations`)을 Muninn 표준형으로 매핑한다.

```jsonc
// HuginnIssue.spec.event (정규화형) — 원본은 Secret {issue}-event 에 보존
{
  "id": "e_3f8a91",
  "source": "grafana",            // enum: grafana|airflow|argocd|manual
  "severity": "critical",          // enum: info|warning|error|critical
  "fingerprint": "PodCrashLooping",// alertmanager fingerprint 또는 labels 해시
  "title": "...",                  // annotations.summary (sanitize, §6.5)
  "receivedAt": "ISO8601",
  "payload": { "alertname": "...", "namespace": "...", "pod": "...", "reason": "..." }
}
```
- `POST /hooks/{app}` 에서 필수 필드 검증(JSON Schema). SQL `event.payload jsonb` 보존.
- 매핑 규칙: `severity` ← `labels.severity`, `fingerprint` ← alertmanager `fingerprint`, `title` ← `annotations.summary`.

### 4.4 Dedup 구현 상세
- **범위**: 앱별 fingerprint. *목표 설계*는 Redis key `dedup:{app_id}:{fingerprint}` 에 `INCR ... EX 86400`(24h). **현 구현은 Redis 가 아니라 활성 HuginnIssue CR 조회로 dedup 한다**(아래 콜아웃).
- **재발 판정**: 동일 fingerprint 의 활성 Issue(`phase∈{Pending,Running,AwaitingApproval}`)가 있으면 새 이슈 생성 안 함(카운트만). **`Succeeded`/`Failed`/`Cancelled`** 만 있으면 재발로 보고 새 이슈 생성.
- **영속화**: webhook 수신 시 `inbound_event` 테이블에 인입 이벤트를 영속(감사·재처리). dedupCount 는 Issue `status.dedupCount` 에 누적된다.

> **구현 현황**: **dedup + 이벤트 인입 내구성은 구현됨.** `POST /hooks/{app}`(muninnWeb `app/api/hooks/[app]/route.ts`)는 (1) 수신 즉시 인입 이벤트를 metaDB `inbound_event` 테이블에 영속(`status=received`, best-effort — DB 실패해도 처리는 계속)하고, (2) `muninn.io/event-fingerprint` 라벨로 활성 HuginnIssue(`phase∈{Pending,Running,AwaitingApproval}`)를 label-selector 조회해 동일 fingerprint 활성 Issue 가 있으면 **새 Issue 대신 그 Issue 의 `status.dedupCount` 를 +1** 하고 `inbound_event.status=deduped` 로 마킹한다. fingerprint 는 `{source}:{slug}` 다.
>
> **남은 후속**: ① **severity gate 는 아직 하드코딩**(`warning` 임계 고정 — 앱별 `severityThreshold` 동적화 미구현), ② **원본 payload 는 `inbound_event.payload` 에 평문 text 로 저장**(최대 100KB 절단) — 별도 Secret(`{issue}-event`) 보존은 후속, ③ **재처리 워커 미구현**(`inbound_event_status_idx` 인덱스만 깔려 있고 `received`/`failed` 행을 소비하는 워커는 없다), ④ Redis 는 여전히 미사용(dedup 을 CR 조회로 대체).

### 4.5 Webhook 생성/등록
- Operator 가 App 생성 reconcile 시 `status.webhookUrl = https://{muninn-api-fqdn}/hooks/{name}` 발급(~30s).
- base FQDN 은 Muninn API ingress/Service DNS 설정에서 유도.
- **외부 등록은 수동**: Grafana(알림 채널), Airflow(`on_failure_callback`), ArgoCD(notification webhook) 에 이 URL 을 등록. (Phase 3: 자동 등록 검토.)

---

## 5. 에이전트 런타임 (Huginn Run)

### 5.1 컨테이너 부팅 시퀀스
```
1. PVC(~/.claude) 마운트 → Claude Code "프로젝트 설정/스킬/Claude SDK transcript"만 공유.
   ※ 인증 키는 PVC 가 아니라 env(K8s Secret)로 주입한다.
2. 컨텍스트 주입(env/ConfigMap/Secret/파일):
   - MUNINN_GOAL                       : "event payload 문제를 인식하고 처리하라"
   - MUNINN_GLOBAL_SYSTEM_PROMPT_REF   : 플랫폼 공통 정책(ConfigMap)
   - MUNINN_TEAM_SETTINGS_REF          : 워크스페이스/앱 운영 정책(ConfigMap)
   - MUNINN_EVENT_PAYLOAD_REF          : 정규화 이벤트(Secret)
   - MUNINN_SOUL_REF                   : 이 앱 전용 SOUL.md(ConfigMap)
   - MUNINN_GUARDRAILS                 : maxIterations/maxCostUsd/maxTokens(상속, JSON)
   - ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN : 인증(둘 중 하나, secretKeyRef(agent-secrets), 둘 다 optional)  ← env 로만
   - GITHUB_PAT / GRAFANA_TOKEN ...    : 도구 자격(secretKeyRef)
3. Claude Agent SDK 로 에이전트 루프 시작 (Python/TS), permission_mode 설정(§5.4).
4. MCP 서버 등록 + allowedTools 적용(§5.2).
5. 종료 시: PR/Issue 발행 + memory store + Run status/transcript 보고(§5.6).
```
- **resources** 권장 기본: `requests {cpu:500m, memory:512Mi}`, `limits {cpu:2000m, memory:2Gi}`.

> **구현 현황(MVP)**: 위 부팅 시퀀스는 *목표*다. operator(`buildJobTemplate`)는 `MUNINN_*_REF` env 를 실제로 주입하지만, **현재 runner.py 는 이 REF 들을 소비하지 않는다** — 2단계의 ConfigMap/Secret 마운트·합성(글로벌/팀/SOUL 프롬프트·이벤트 페이로드)과 4단계의 MCP 서버 등록·`allowedTools` 적용이 **미구현(후속)**이다. MVP system prompt 는 `MUNINN_GOAL` 중심 최소 구성이고, 도구 권한 경계도 아직 강제되지 않는다.

### 5.2 MCP 도구 (권한 · 감사 · SDK 네이밍)
SDK 도구명 규칙은 **`mcp__<server>__<fn>`**(예: `mcp__muninn__recall`). `claude_skill.sh` 가 `ClaudeAgentOptions.mcpServers={muninn:…, loki:…}` 로 등록하고, `allowedTools=['mcp__muninn__*','mcp__loki__*', …]` 로 앱별 권한을 부여한다. **모든 호출은 Muninn API 가 중개·감사**하며 `step` 테이블에 기록된다.

> **구현 현황(MVP)**: 이 절(mcpServers 등록·`allowedTools` 권한 경계·read-only 강제·Muninn API 호출 중개)은 **아직 런타임에 구현되지 않았다(후속)**. 현재 runner.py 는 `mcpServers`/`allowedTools` 를 설정하지 않으며, recall/store/report 는 MCP 가 아니라 `MUNINN_*_ENDPOINT` 로의 직접 HTTP 호출로 처리한다.

| server(ns) | 대표 fn | 권한 | 비고 |
|------------|---------|------|------|
| `muninn` | `recall(query,k)`, `store(fact,scope,tags)`, `update_embedding(id,fact)` | RW(자기 워크스페이스) | 1순위: 조사 전 recall |
| `loki` | `query_range(logql,range)` | **read-only**, mandatory label `{namespace=identity.k8sNamespace}` | 1순위 로그 |
| `tempo` | `search_traces(service,…)` | read-only | |
| `mimir` | `query(promql)` | read-only | Prometheus 호환 |
| `github` | `read_file`,`search_code`,`list_files`,`create_pr` | **PR 생성(draft)만**, merge/delete 불가 | §6.2 |
| `argocd` | `get_app`,`sync_status` | read-only(조회) | sync 트리거는 불허 |
| `airflow` | `get_dag_run`,`task_logs` | read-only | |
| `harbor` | `scan_image` | read-only(scan 조회) | PR 전 취약점 |

`step.tool_ns` 는 위 8종 enum 으로 제한(§8 CHECK). 부팅 시 `spec.bindings` 외 ns 호출은 거부.

### 5.3 Step 모델 & SDK 메시지 변환
SDK `query()` 가 반환하는 `AsyncIterator<Message>` 를 Muninn `Step` 으로 변환한다:

| SDK 메시지/블록 | Step | 추출 |
|-----------------|------|------|
| `AssistantMessage.content[TextBlock]` | `thought` | `text`, `tokens_in/out ← message.usage` |
| `AssistantMessage.content[ToolUseBlock]` | `tool`/`tool-pending` | `ns.fn ← block.name`(`mcp__ns__fn` 파싱), `args ← block.input`; 결과 도착 전이면 `tool-pending` |
| tool result | `tool`(완성) | `result`, `status` |
| `ResultMessage` | Run 종료 | `total_cost_usd`, `usage`, `num_turns` → `status` 반영 |

각 Step 은 `step(run_id, ix, …)` 행으로 저장되고 WS/SSE 로 UI 스트리밍(프로토타입 "실시간 스트림·자동 스크롤").

### 5.4 Guardrail 집행 (SDK 계약)
- `spec.guardrails.maxIterations` → SDK **`max_turns`**(루프 최대 턴, 초과 시 중단).
- `spec.guardrails.maxCostUsd` → SDK **`max_budget_usd`**(도달 시 다음 iteration 거부).
- **cost 는 예상치**: `ResultMessage.total_cost_usd` 는 API 응답 기반 추정이며 실제 청구와 다를 수 있다. `run.cost` 는 이 추정치를 저장.
- `permission_mode`: 기본 `plan`(도구 호출 시 승인 흐름), 저위험 도구(recall/read 등)는 `allowedTools` 로 자동 허용. 더 엄격하면 `dontAsk` + 사전 허용 도구만. 승인 필요 시 Run 을 `AwaitingApproval` 로 전환(§6.4).

### 5.5 PVC 동시성 & 격리
여러 Run 이 같은 `~/.claude` PVC(RWX)를 동시 마운트하면 K8s 는 쓰기 충돌을 막아주지 않는다. 선택지:
- **A. Run/앱별 개별 PVC**(격리↑, 비용↑)
- **B. 공유 PVC + `/.claude/run/{runId}.lock` 분산 락**(MVP 권장)
- **C. `ReadWriteOncePod` + 장기 Issue Pod 1개**(Claude session 컨텍스트 재사용 시)

**구현 = A(앱별 PVC) + Issue별 subPath**. 앱별 PVC(`pvc-claude-<app>`) 안에서 **Issue 이름**을 subPath 로
`~/.claude` 에 마운트한다(`JobTemplate.ClaudeSubPath`) — 분리 단위를 Run 이 아니라 **Issue** 로 잡는 것이
핵심이다(아래 resume 범위가 Issue 내 attempt 간이므로, 같은 Issue 의 attempt 들은 같은 `~/.claude` 를
공유해야 transcript resume 이 동작한다). 이로써 같은 앱의 **다른 Issue** 들의 transcript/설정이 물리적으로
격리되어 동시쓰기 오염이 사라진다 — 영속 경계(subPath)와 resume 경계(Issue)가 일치한다. RWO PVC 의
노드 간 동시 마운트 제약 때문에 같은 앱 Issue 들의 *진정한 병렬* 실행은 RWX StorageClass 가 필요하다
(미가용 시 볼륨 레벨 직렬화되나 격리·resume 정합은 유지). 상세: `operator-design.md §2.6`.

**세션 resume (구현됨)**: PVC 에 남는 Claude 세션 transcript(`~/.claude/projects/…`)를 같은 Issue 의
재시도 attempt 가 이어받는다. runner 가 스트림에서 세션 ID 를 잡는 즉시 `status.sessionId`(Agent→API
소유)로 보고하고, Issue controller 가 다음 attempt Run 에 `MUNINN_RESUME_SESSION_ID` 로 주입하면
runner 가 SDK `resume` 옵션으로 직전 진단 컨텍스트에서 계속한다. **resume 범위는 Issue 내 attempt
간으로 한정** — Issue 간 연속성은 메모리(recall + `~/.claude/CLAUDE.md`)가 담당한다(컨텍스트 오염 방지).
attempt 간 pod 겹침은 없으므로(Issue controller 가 직전 Run 의 터미널 phase 확인 후에만 다음 attempt
생성) 동일 세션 이어쓰기가 안전하다. 폴백 2중화: ① controller 는 attempt 역순으로 첫 non-empty
sessionId 를 고른다(직전이 init 전에 죽어도 세션 체인 유지), ② runner 는 transcript 부재 시
(PVC 재생성 등) resume 을 끄고 새 세션으로 시작한다 — 둘 다 깨진 resume 으로 retry budget 을
소모하지 않기 위한 것.

### 5.6 Run 완료 & 보고 경로
Pod 가 종료(Succeeded/Failed/Cancelled)할 때:
1. `recall-report`: `POST /runs/{id}/recall-report` 로 `recalledMemoryIds[{id,score,recall_time}]` 전송(직접 CR PATCH 대신 **API 경유** 권장 — RBAC 단순화).
2. `finishedAt` 보고 → Operator 가 `duration_s = finishedAt - startedAt` 계산 후 SQL 기록.
3. transcript/step 은 실행 중 스트리밍으로 이미 적재.

---

## 6. 보안 / 거버넌스 / 멀티테넌시

### 6.1 멀티테넌시 격리
- Workspace 당 전담 namespace `ns-{workspace-slug}`. Operator 가 `spec.workspaceId` 로 namespace 강제(App YAML 의 namespace 하드코딩 금지).
- Pod ServiceAccount 는 자기 namespace 의 Secret/ConfigMap 만 read.
- 모든 SQL 조회는 `workspace_id`/`application_id` 필터(PostgreSQL **RLS** 고려).
- PVC 는 앱별 격리, cross-workspace 마운트 금지. NetworkPolicy 로 egress 제한.

> **구현 현황**: **workspace=namespace 경계는 구현됨.** ① operator 의 HuginnAgent validating webhook 이 `spec.workspaceId == metadata.namespace` 를 강제하고(불일치 시 거부, 빈 값 거부, update 시 immutable), 라벨 `muninn.io/workspace` 를 defaulter 가 동기화한다(`internal/webhook/v1beta1/huginnagent_webhook.go`). `workspaceId` 는 1급 spec 필드(required·immutable, CEL XValidation). ② operator 가 Run Job 에 `MUNINN_WORKSPACE` env 를 주입한다(`run.Namespace` 우선 — workspace=namespace 가 단일 진실원천; `muninn.io/workspace` 라벨은 selector 보조이며 namespace 가 빈 비정상 경로의 폴백 — `huginnrun_controller.go`). ③ 메모리(postgres) `memory` 테이블에 `workspace` 컬럼 + 인덱스 추가, recall/store/list 가 모두 workspace 로 필터(`lib/db.ts` 의 `scopeWhere`/`scopeSql`, recall 은 FTS 결과에도 2차 `workspace` 가드).
>
> **남은 후속**: ① **SQL RLS 미구현** — 격리는 전적으로 애플리케이션 레이어 `WHERE workspace=$1` 이며 DB 사용자는 우회 가능, ② **NetworkPolicy egress 제한 미구현**(레포에 NetworkPolicy 매니페스트 없음), ③ **workspace 멤버십(owner|member) 검증 미구현** — webhook 은 의도적으로 멤버십 DB 조회를 하지 않고(가용성을 DB 에 묶지 않기 위함) CR 생성자인 Muninn API 인증 레이어로 위임(operator-design §4), 현재 그 검증은 미구현. agent SA 의 자기 namespace 한정 Secret/ConfigMap read 는 operator 의 namespace 한정 Role 로 강제된다.

### 6.2 GitHub PAT 정책
- **fine-grained PAT**, 대상 repo 한정, **PR 생성/코멘트만**(merge/branch 삭제 불가).
- 30~90일 자동 로테이션. Muninn API 가 모든 GitHub 호출 중개 + 감사 로깅.
- `spec.source.pr.draft:true` 강제, `requireApprovalOnWorkflowChange:true`.

### 6.3 MCP 도구 권한 & 감사
- §5.2 권한 칼럼대로 read-only 강제. 관측 백엔드는 mandatory label filter 로 워크스페이스 격리.
- `step` 테이블에 `tool_requester`, `tool_auth_context` 추가 → 호출 감사 추적.

### 6.4 Human-in-the-loop 승인
- **승인 필수 조건(정책화, `spec.source.pr.approvalTriggers`)**: `output=pull_request` 이면서 ① dependency 파일 변경 ② diff > 임계(기본 200줄) ③ `.github/workflows/**` 변경 ④ cost/tokens > 한도 60% 중 하나 이상.
- **`output=github_issue` 는 자동 발행(승인 불필요)**.
- **집행**: 에이전트가 위험작업 직전 `POST /runs/{id}/report {requestApproval}` → **Muninn API 가** Run 을 `AwaitingApproval` 로 전이(`AwaitingApproval` 전이·`approval` 은 **API 소유 필드**다 — Operator 가 아니라 API 가 쓴다; operator-design §2.2). 승인 시 API 는 `approval.state=Approved` 만 쓰고, Operator 가 그 phase 를 `Running` 으로 복귀시킨다. 현 구현은 런너 측 게이트(`MUNINN_REQUIRE_APPROVAL`/`guardrails.requireApproval`) 기반, `approvalTriggers` 정책 중앙화는 후속.
- **승인자**: Workspace owner 또는 `Application.admins[]`, RBAC 검증. **코파일럿(CopilotKit) 은 승인/거절 server tool 을 갖지 않는다** — 승인은 콘솔 전용(`/api/runs/[id]/approve|reject`)으로 격리(자율 승인 게이트, §6.6).
- **만료/거절**: `expiresAt`(기본 90분, `MUNINN_APPROVAL_TTL_MINUTES`) 초과 후 approve/reject 호출은 `expired` 로 차단된다. 거절 → `approval.state=Rejected` + `spec.suspend=true`(operator 취소 경로) → `Cancelled`, event 는 manual retrigger 가능. (만료를 타이머로 자동집행하는 데몬은 후속.)
- **감사**: `approval(run_id, reasons, state, requested_at, expires_at, decided_by, decided_at, reason)` 에 전 이력 기록.

> **구현 현황**: **HITL 승인 루프 E2E 는 구현됨.** ① runner.py 가 `MUNINN_REQUIRE_APPROVAL`(또는 `MUNINN_GUARDRAILS.requireApproval`)일 때 위험작업(에이전트 루프 진입) 직전 `POST /runs/{id}/report {requestApproval}` 로 승인을 요청한다. ② report 라우트가 비종료 Run 에 한해 `phase=AwaitingApproval` / `approval.state=Pending` / `requestedAt` / `expiresAt`(now + `MUNINN_APPROVAL_TTL_MINUTES`, 기본 **90분**)로 전이한다(`buildApprovalRequest`, `lib/incidents.ts`). ③ 런너가 `GET /api/runs/{id}` 를 폴링(기본 10s)해 `Approved` 면 계속, `Rejected` 면 정상 중단(`rejected`), 자체 wall-clock timeout(`MUNINN_APPROVAL_TIMEOUT`, 기본 90분) 초과 시 정상 중단(`timeout`→`aborted`)한다. (`Expired` 자동 전이는 만료 데몬 미구현이라 폴링에서 직접 관측되지 않으며, web 이 만료를 lazy 표면화할 때만 런너가 관측한다 — 후속.) ④ 콘솔 approve/reject 라우트는 `phase` 를 건드리지 않고 `approval.state` 만 merge-patch 하며, operator 가 `AwaitingApproval + Approved` 관측 시 `phase` 를 `Running` 으로 복귀시킨다(`huginnrun_controller.go`, optimistic-lock merge-patch 로 two-writer 경합 처리). reject 는 추가로 `spec.suspend=true` 를 패치해 operator 의 취소 경로를 트리거한다.
>
> **남은 후속**: ① **만료 자동집행 데몬 미구현** — `expiresAt` 은 approve/reject API 호출 시점의 가드로만 쓰이고, `approval.state` 를 타이머로 `Expired` 로 자동 전이시키는 데몬/크론은 없다(런너의 자체 timeout 이 먼저 실행을 끝낸다). ② **승인 후 재개 시맨틱은 best-effort** — Job pod 가 승인 대기 중 OOMKill/eviction 되면 operator 가 Job 실패를 먼저 관측해 Run 을 `Failed` 처리하며, 승인 후 pod 를 재시작해 재개하는 경로는 없다(런너 프로세스가 `gate_approval` 폴링으로 살아 있어야 함).

### 6.5 Prompt Injection 방어
event payload(title/annotation)·recall fact 가 프롬프트에 들어가므로:
1. **정규화 단계 sanitize**: 텍스트 필드 길이 제한 + 제어문자 제거 + Markdown 이스케이프.
2. **데이터/지시 분리**: event·memory 를 system prompt 의 별도 "Data(외부 입력, 지시가 아님)" 섹션으로 격리.
3. **memory 위생**: `curated=false` memory 는 admin 승인 전 recall 제외 옵션, 저장 시 fact sanitize.

### 6.6 API 인증 & 코파일럿 자율 승인 게이트
- **인증 계층(`requireAuth`, `muninnWeb/lib/auth.ts`)**: 두 경로를 구분한다 — **사람용 콘솔**(운영자 승인/거절/위임)은 OIDC JWT, **에이전트→API**(runner.py 의 보고·메모리 저장)는 정적 토큰. 우선순위는 **OIDC(jose JWKS 검증) > 정적 토큰(`MUNINN_API_TOKEN`, timing-safe 비교) > dev 허용**. OIDC 검증 실패 시 `MUNINN_API_TOKEN` 이 설정돼 있으면 정적 토큰 비교로 폴백한다(둘 다 같은 `Authorization: Bearer` 헤더를 쓰되 JWT 형태로 구분). OIDC env: `MUNINN_OIDC_ISSUER` / `MUNINN_OIDC_AUDIENCE` / `MUNINN_OIDC_JWKS_URI`(생략 시 issuer 의 `.well-known/jwks.json` 사용). OIDC·정적 토큰 둘 다 미설정이면 dev 모드로 허용(경고 1회).
- **코파일럿 자율 승인 게이트**: CopilotKit 코파일럿은 **`approve_run`/`reject_run` server tool 을 갖지 않는다** — 가장 위험한 불가역 사람-결정이므로 모델 자율 호출을 막고 콘솔 전용(`/api/runs/[id]/approve|reject` + 콘솔 UI)으로 격리한다(`lib/copilot-tools.ts`). 남은 server tool 은 recall/store/summarize/list/query/delegate 류이며, `delegate_incident` 는 `confirmed` 게이트를 코드로 강제한다(시스템 프롬프트 `lib/copilot-system.ts` 가 모델에게도 "승인/거절은 콘솔 전용" 을 명시).

---

## 7. Muninn 기억 시스템

### 7.1 검색 모드 & hybrid 알고리즘
모드: `hybrid`(기본) / `bm25` / `vector`(프로토타입 Memories 필터). 점수는 0~1 로 정규화.

- **BM25 구현**: Phase 0 은 PostgreSQL `ts_rank_cd`(TF-IDF 근사). 정확한 BM25 가 필요하면 Phase 2+ 에 `pg_search`/RUM 등 확장 도입(트레이드오프 명시).
- **점수 정규화·결합**(둘 중 택1, 구현 시 명시):
  - **RRF(권장, 정규화 불요)**: `score = 1/(60+rank_bm25) + 1/(60+rank_vector)`.
  - **정규화 가중합**: cosine `(1-(emb<=>q))` 와 정규화 BM25 의 가중합(기본 vector 0.7, bm25 0.3, 앱별 조정).

### 7.2 스코프 & 큐레이션 & 병합
- `scope=global`(공유, 보통 `curated=true`) / `scope=app`(전용, distill 시 `curated=false`).
- **scope 병합**: 각 scope 독립 top-k 후 재정렬. RRF 또는 정규화 점수 + scope 가중(기본 app 0.6/global 0.4), global 신뢰 보정(+0.05), app 시간 감가. 운영자가 Settings→Memories 에서 가중치 조정.
- admin 은 편집/삭제/승인(curated 승격) 가능.

### 7.3 회상 → 저장 사이클
```mermaid
flowchart LR
    RUN["Run 시작"] -->|"recall(query,k,scopes)"| S["hybrid search<br/>(pgvector + ts_rank)"]
    S -->|"top-k {id,fact,score,reason}"| CTX["컨텍스트 주입"]
    CTX --> SOLVE["진단/해결"]
    SOLVE -->|"store(fact,run,tags) + embedding"| W["app-scoped memory"]
    W -.->|"admin 큐레이션"| G["global 승격"]
```

### 7.4 임베딩 전략
> **구현 현황(MVP)**: 현재 muninnWeb 구현은 임베딩/pgvector 를 제외하고 **postgres 텍스트 검색**
> (`to_tsvector`/`ts_rank_cd`)만 쓴다 — 외부 임베딩 키·onnxruntime·pgvector 의존을 회피해 어떤
> postgres(CNPG stock 이미지 포함)에서도 동작. 본 절의 벡터/하이브리드 전략은 의미(시맨틱) 검색이
> 정당화될 때 재도입하는 **목표 설계**다. → `muninn-goal-conversational-delegation.md` §7.
- **모델/차원(pluggable)**: 기본 후보 — Voyage AI(1024-dim, 다국어) 또는 OpenAI `text-embedding-3-large`(Matryoshka 로 1536-dim 축소). 스키마 예시는 `vector(1536)` 이나 **설정 가능**하며, 모델 변경 시 전체 re-embed 필요(Open Question).
- **수명주기**: 생성 시 fact+embedding 동시 생성. **fact 수정 시 `update_embedding` 으로 재생성** + `updated_at` 갱신. 재생성 실패 시 alert + admin 대시보드 "임베딩 갱신 필요" 배지.

### 7.5 자동 Distill 파이프라인
- **트리거**: `Run.status=Succeeded` 전환 시 에이전트가 `muninn.store(fact, scope=app, run)` 호출.
- **품질**: global system prompt 에 "run 종료 시 해결한 문제를 1–2줄 Markdown 으로 정리" 지시.
- **중복 방지**: Phase 1 수동 큐레이션(curated toggle), Phase 3 embedding cosine 유사도(>0.85) 자동 중복 감지.

### 7.6 Recall 감사
`muninn.recall` result 를 `{items:[{id,fact,score,reason}]}` 로 확장(reason 예: `"vector 0.92 + bm25 0.88 (hybrid)"`). Run 상세 "Recall된 Memories" 카드에서 선택 근거/탈락 후보 팝오버 제공.

---

## 8. 데이터 모델 (PostgreSQL + pgvector — 목표 설계)

> **구현 현황(MVP)**: 현재 muninnWeb 구현은 `embedding vector(1536)` 컬럼과 `ivfflat` 인덱스를 **제외**하고 텍스트 검색(FTS)만 쓴다(§7.4). 아래 스키마의 벡터 컬럼/인덱스는 의미 검색이 정당화될 때 재도입하는 목표 설계다. → `muninn-goal-conversational-delegation.md` §7.

```sql
-- 멀티테넌시
workspace(id, name, slug, description, color, created_at)
membership(workspace_id, user_id, role)              -- owner | member

-- 운영 대상 (CRD 와 동기화)
application(id, workspace_id, name, kind, output, repo,
            severity_threshold, max_iters, max_cost_usd, daily_run_cap,
            webhook_url, soul_ref TEXT,               -- §8.3: ConfigMap 내용(Markdown)
            created_at)

-- 트리거
event(id, application_id, source, severity, fingerprint, title,
      dedup_count, payload jsonb, received_at)
-- run 은 event 를 역방향 FK 로 참조(§8.2)

-- 실행
run(id, event_id, application_id, status, step, max_step,
    cost, max_cost_usd, tokens, max_tokens,           -- guardrail caps 영속화
    duration_s, output, started_at, finished_at)
step(id, run_id, ix, kind, text, tokens_in, tokens_out,
     tool_ns, tool_fn, tool_args jsonb, tool_result jsonb, tool_status,
     tool_requester, tool_auth_context, finished_at,
     CONSTRAINT tool_ns_valid CHECK (tool_ns IN
       ('muninn','loki','tempo','mimir','github','argocd','airflow','harbor')))

-- 기억 (Muninn)
memory(id, scope, application_id, fact, tags text[], score real,
       curated bool, source_run_id, embedding vector(1536),
       created_at, updated_at)
-- 인덱스: ivfflat(embedding) + GIN(to_tsvector(fact)) → hybrid

-- 인프라 도구(admin)
platform_tool(id, kind, name UNIQUE, endpoint, status, brand_color, category)
app_binding(application_id, tool_id, config jsonb)     -- §8.5 name→id 매핑

-- 승인
approval(id, run_id, reasons jsonb, state, requested_at, expires_at, decided_by)
```

### 8.1 집계 & 대시보드 KPI
프로토타입의 `runs24h/failed24h/cost7d`, 성공률, top failing, 월 비용은 **`run` 테이블 집계**다.
- **구현**: `run(application_id, started_at)` 인덱스 + materialized view `app_run_stats(app_id, period, runs_count, failed_count, success_rate, avg_cost_per_run)`, **5분 주기 refresh**(또는 on-demand view).
- **API**: `GET /workspaces/{ws}/apps/{id}/stats?period=24h|7d|month`. 대시보드 KPI(성공률 = (runs-failed)/runs)는 이 endpoint 또는 view 로 계산.

### 8.2 Event ↔ Run 관계
저장은 **`run.event_id` 역방향 FK 만**. 프로토타입의 `Event.runIds[]` 는 `SELECT … WHERE event_id=?` 로 파생되는 **표시용 denormalized 필드**(event 테이블에 `run_ids` 칼럼 두지 말 것).

### 8.3 SOUL.md 저장/동기화
`spec.agent.soulRef` 는 ConfigMap 이름. Operator 가 내용을 읽어 `application.soul_ref TEXT`(Markdown)에 저장. UI 편집 시 SQL + ConfigMap 양쪽 갱신. (단순화하려면 ConfigMap 생략하고 SQL 단일 소스로 두는 안도 가능.)

### 8.4 status 파생값
`activeIssues` 는 Operator 가 reconcile(기본 30s)마다 계산하는 transient 값(SQL 영속 불요, 필요 시 Redis 30s TTL 캐시).

### 8.5 Platform Tool 바인딩
`spec.bindings.*.instance`(이름) → Gateway 가 `platform_tool.name`(UNIQUE) 조회로 `tool_id` 결정 → `app_binding(application_id, tool_id, config)` 저장.

### 8.6 goal 영속화
`HuginnIssue.spec.goal` 은 event 단위 불변 컨텍스트. 운영 감사 필요 시 `event.goal VARCHAR` 추가, 아니면 CRD-only transient 로 둠(설계 의도 명시).

---

## 9. 기술 스택 (제안)

| 레이어 | 1순위 | 비고 |
|--------|-------|------|
| Agent Runtime | **Claude Agent SDK**(Python/TS) | `query()` AsyncIterator, `mcpServers`, `allowedTools`, `max_turns`, `max_budget_usd`, `permission_mode` |
| Operator | Go(controller-runtime) | 대안 Python `kopf` |
| API/Gateway | FastAPI(Python) | webhook + CR 생성 + WS/SSE + RBAC + 감사 |
| UI | React 18 + Next.js | 프로토타입 계승 |
| Memory | Python + pgvector | hybrid + 임베딩(pluggable) |
| Storage | PostgreSQL 16 + pgvector, Redis 7 | metaDB/memory, dedup/queue |
| 이미지/런타임 | **Podman**(빌드), CRI 호환 노드 | OCI 이미지 |
| 관측(외부) | Mimir/Loki/Tempo(+Grafana) | 그림 datasource |

> **구현 현황**: 위는 *제안* 스택이다. 실제 구현은 **API/Gateway·UI·Memory 를 muninnWeb(Next.js 15 + React 19, App Router) 하나로 통합**했다 — FastAPI·별도 Memory Service 없음(§2.1 콜아웃). **Storage 는 외부 postgres 단일**(metaDB=memory 겸용, **텍스트 검색만 → pgvector·확장 불필요**), **Redis 는 미사용**(dedup 은 CR 조회 + `inbound_event` 영속으로 구현 — §4.4). Operator 는 Go(controller-runtime v0.24.1 / k8s v0.36.1 / go 1.26) 그대로다. Agent Runtime 베이스 이미지는 digest 핀(node:24) + CLI/SDK 최신. CI 에 govulncheck(operator) / trivy(이미지 스캔) + operator·web 이미지 publish 워크플로가 추가됨.

---

## 10. 구현 로드맵

### Phase 0 — Walking Skeleton
- [ ] `muninn.io/v1beta1` CRD 3종(+ OpenAPI enum/validation, conditions)
- [ ] Operator: 단일 namespace, Issue→Job 생성, GC
- [ ] Agent Runtime(`claude_skill.sh` + Agent SDK): event → recall → loki → Issue, step 스트리밍
- [ ] PostgreSQL + pgvector 스키마, Redis dedup(`dedup:{app}:{fp}`)
- [ ] Muninn API: webhook 정규화(§4.3) → CR 생성

### Phase 1 — 콘솔
- [ ] 프로토타입 ↔ 실데이터(stats endpoint, materialized view §8.1)
- [ ] Run transcript WS/SSE
- [ ] "새 Application 등록" 위저드 → CR(+ workspaceId admission webhook)

### Phase 2 — 자율성 & 안전
- [ ] PR 출력 + 승인(approvalTriggers, 만료/거절, RBAC)
- [ ] Guardrail 집행(max_turns/max_budget_usd, permission_mode)
- [ ] MCP 도구 풀세트(권한·감사), prompt injection 방어, GitHub PAT 정책

### Phase 3 — 기억 고도화 & 운영
- [ ] hybrid recall(RRF/정규화) + scope 병합 + 자동 distill + 중복 감지
- [ ] Platform tools 관리, 관측 도구 label-RBAC
- [ ] 멀티 워크스페이스 RBAC/RLS, 비용 리포팅, webhook 자동 등록

---

## 11. 미해결 질문 (Open Questions)

1. **메트릭 백엔드**: Mimir vs VictoriaMetrics — 단일화 or pluggable 유지.
2. **임베딩 모델/차원 확정**: Voyage(1024) vs OpenAI(1536) — 변경 시 re-embed 비용.
3. **에이전트 격리 단위**: Run 당 Job(짧고 깨끗) vs Issue 당 장기 Pod(Claude session 컨텍스트·`~/.claude` 캐시 재사용). 그림의 PVC 공유는 후자 시사 → §5.5 와 연계.
4. **이슈 동시성 상한 / 우선순위 큐**(critical 우선).
5. **Secret 공급**: K8s Secret vs Vault/External Secrets Operator + PAT 로테이션 자동화.
6. **Operator 언어**: Go vs Python(Memory Service 와 통일).
7. **finalizer**: 진행 중 Run graceful shutdown 을 cascade GC 로 충분히 다룰지, custom finalizer 가 필요할지.
8. **비용 모델**: rate card(모델별 단가) 설정 아티팩트, 워크스페이스 월 한도(monthCap) 집행 위치.

---

*관련 파일*: [`examples/`](./examples/) — 샘플 CR YAML · [`README`](./README.md) — 인덱스 · [`muninn-goal-conversational-delegation.md`](./muninn-goal-conversational-delegation.md) — `/goal` 구현 청사진
