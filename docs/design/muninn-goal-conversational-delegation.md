# Muninn `/goal` — 대화형 위임 · 기억 라이프사이클 설계서

> **상태**: Design v1.0 · 2026-06-07 · 구현 청사진(implementation blueprint)
> **관계**: 메인 스펙 [muninn-devops-agent-platform.md](./muninn-devops-agent-platform.md)(§2·§4·§7)와
> [operator-design.md](./operator-design.md)(§2.2 status 소유권)의 **대화형(manual) 트리거 경로**를
> 1급으로 구체화한다. CopilotKit 통합 경로는 [muninnWeb/docs/copilotkit-request-flow.md](../../muninnWeb/docs/copilotkit-request-flow.md) 참조.

## 0. 목표 (`/goal`)

muninnWeb 은 **기억(Memory Plane) + 오케스트레이션** 이다. 운영자가 muninnWeb CopilotKit
ChatWidget 에 자연어를 입력하면:

> "XX Application 에 발생한 장애는 아마 외부시스템 timeout 문제일거야. 확인해보고 맞다면
> XX Application 에 외부 API fallback 로직 추가하는 PR 생성하고 검토받아."

muninnWeb 이 다음을 수행한다:

1. **기억 검색** — metaDB(postgres, 텍스트 검색)에서 관련 기억 recall.
2. **메타데이터 생성** — 프롬프트를 goal + 정규화 이벤트로 변환.
3. **위임** — HuginnAgent(operator)에 기억+메타데이터를 넘겨 장애 대응을 위임(HuginnIssue 생성).
4. **결과 회수** — HuginnRun 진행/결과(step/cost/output/approval)를 status 로 회수.
5. **기억화** — 결과를 기억에 저장 + 1~2줄 요약 + 이력관리(history).

또한 조회: "어떤 Application 에 장애(HuginnIssue) 나고 대처(HuginnRun) 진행중?" 을 코파일럿이
실제 CR 을 읽어 답한다.

**핵심 분담**: 무거운 진단·PR 작업은 **claude-agent-sdk(Huginn 에이전트 플레인)** 가 한다.
muninnWeb 코파일럿은 **오케스트레이터**(recall·위임·회수·기억화)다. 코파일럿이 직접 진단하지 않는다.

## 1. 두 개의 트리거 경로 (둘 다 1급)

```
[Webhook]  Grafana/Airflow/ArgoCD ─▶ POST /api/hooks/{app} ─┐
                                                            ├─▶ Muninn API(정규화·dedup)
[Manual]   운영자 ─ CopilotKit ChatWidget ─ delegate_incident ┘        │
                                                                     ▼
                                          K8s API: HuginnIssue CR 생성
                                          (webhook → source 별 event / manual → source=manual,
                                           issuingUser, userPrompt, goal=프롬프트 기반)
                                                                     ▼
                                   [기존 operator] HuginnIssue→HuginnRun→Job→Pod(claude-agent-sdk)
                                                                     ▼
                                   PR/Issue(dry-run 가능) + status 보고 + memory store
```

두 경로 모두 **같은 HuginnIssue CR** 로 수렴한다. 차이는 provenance 뿐:
- webhook: `event.source ∈ {grafana,airflow,argocd}`, payload 는 alert 정규화.
- manual: `event.source = manual`, `spec.issuingUser`(운영자), `spec.userPrompt`(원본 프롬프트),
  `goal` 은 프롬프트에서 도출. severity 는 운영자/기본값(warning).

## 2. 컴포넌트 책임

| 컴포넌트 | 역할 | 상태 |
|---------|------|------|
| **muninnWeb (= Muninn API + Memory + Console)** | 코파일럿(오케스트레이터), K8s CR 생성/조회/패치, postgres 기억(recall/store/요약/이력), 에이전트 보고 수신 | **본 설계의 구현 대상** |
| **huginnOperator** | HuginnIssue→HuginnRun→Job→Pod 라이프사이클, 재시도, status 필드 소유권 | ~90% 완성 (CRD 에 manual 필드만 추가) |
| **huginnAgentRuntime** | claude-agent-sdk 자율 진단/PR + Muninn API 로 결과 보고 + memory store | 루프 완성, 보고/PR/store 추가 필요 |
| **postgres (Drizzle)** | memory / memory_history / incident_log | 신규 |

> **중요**: 설계상 "Muninn API"는 **muninnWeb Next.js 앱이 겸한다**(별도 서비스 없음).
> `app/api/**` 서버 라우트가 `@kubernetes/client-node` + `pg` 로 직접 K8s/postgres 를 다룬다.
> (메인 스펙/CLAUDE.md 의 "muninnWeb 은 프로토타입/mock" 서술은 본 구현으로 갱신된다.)

## 3. End-to-End 시퀀스 (대화형 위임)

```
운영자 ─ 프롬프트 ─▶ CopilotKit Sidebar ─▶ /api/copilotkit (BuiltInAgent classic, OAuth)
  코파일럿이 server tool 을 순차 호출:
  1) recall_memory(query)            → postgres 하이브리드(RRF) → 관련 기억 top-k
  2) delegate_incident(app, goal, recalled, severity?) 
        → lib/k8s.createHuginnIssue: HuginnIssue CR 생성
            · agentRef=app, event{source:manual, severity, fingerprint, title}
            · goal=요약된 목표, issuingUser, userPrompt=원본
            · inheritedGuardrails/identity = HuginnAgent 에서 복사(get 후 스냅샷)
            · recalled 기억을 goal/컨텍스트에 동봉(에이전트 seed)
        → incident_log 에 사건 시작 기록(recordIncident)
  3) (operator 가 HuginnRun→Job→Pod 실행; agentRuntime 가 진단·dry-run PR)
  4) get_run_status(runId | issue)   → HuginnRun.status (phase/step/cost/output/approval)
        · phase=AwaitingApproval 면 코파일럿이 사용자에게 승인/거절 제시(HITL)
  5) approve_run / reject_run(runId)  
        → approve: patchRunStatus(approval.state=Approved, decidedBy) → 에이전트 재개
        → reject : patchRunSpec(suspend=true) + status(approval.state=Rejected) → Cancelled
  6) 완료(Succeeded) 후:
        → store_memory(fact, app)        : 결과를 기억화
        → summarize_incident(runId)      : Claude 로 1~2줄 요약 → incident_log/memory
        → updateIncident(status, outcome, summary, cost)
            
agentRuntime(Pod) ── 진행/결과 ──▶ POST /api/runs/{id}/report  (step/cost/tokens/output → status PATCH)
                  ── recall 보고 ─▶ POST /api/runs/{id}/recall-report (recalledMemoryIds)
                  ── 메모리 저장 ─▶ POST /api/memories (store)   [또는 web 이 완료 후 대신 store]
```

## 4. CR 계약 (구현 기준)

`muninn.io/v1beta1`. plural: `huginnagents` / `huginnissues` / `huginnruns`.

### HuginnIssue.spec (위임 시 muninnWeb 이 채움)
- `agentRef`(=app name), `event: {id, source, severity, fingerprint, title, receivedAt}`,
  `goal`, `inheritedGuardrails: {maxIterations, maxCostUsd, maxTokens}`,
  `inheritedBindings?`, `identity: {k8sNamespace, ...}`, `retryPolicy: {maxRuns, backoff}`.
- **신규(manual)**: `issuingUser`(운영자), `userPrompt`(원본 프롬프트). webhook 이면 비움.
  → `huginnOperator/api/v1beta1/huginnissue_types.go` 에 추가 + `make manifests generate`.

### HuginnRun.status (결과 회수처 — 소유권 operator-design §2.2)
- Operator 소유: `phase`(Queued/Pending/Running/AwaitingApproval/Succeeded/Failed/Cancelled),
  `jobName`, `startedAt/finishedAt/durationSeconds`, `maxStep/maxCostUsd/maxTokens`.
- **Agent→API 소유**: `step`, `cost`, `tokens`, `output`, `recalledMemoryIds[]`.
- **API(muninnWeb) 소유**: `approval: {state, reasons[], requestedAt, expiresAt, decidedBy}`.
- muninnWeb 은 **자기 소유 필드만 merge-patch** 한다(operator MergeFrom 와 비충돌).

## 5. Muninn API 라우트 (muninnWeb `app/api/**`)

| 라우트 | 메서드 | 동작 |
|--------|--------|------|
| `/api/copilotkit` | POST | CopilotKit 런타임(BuiltInAgent + server tools) |
| `/api/issues` | POST | HuginnIssue CR 생성(위임) — 코파일럿/외부 공용 |
| `/api/hooks/{app}` | POST | webhook 정규화·dedup → HuginnIssue 생성(기존 mock → 실연동) |
| `/api/runs` | GET | HuginnRun 목록(K8s list) |
| `/api/runs/{id}` | GET | HuginnRun 상세 |
| `/api/runs/{id}/report` | POST | **에이전트 보고 수신** → status(step/cost/tokens/output) PATCH |
| `/api/runs/{id}/recall-report` | POST | recalledMemoryIds PATCH |
| `/api/runs/{id}/approve` | POST | **실 PATCH**: approval.Approved + phase 복귀 |
| `/api/runs/{id}/reject` | POST | **실 PATCH**: spec.suspend=true + approval.Rejected |
| `/api/memories` | GET/POST | GET=recall(하이브리드) · POST=store |
| `/api/issues` (GET), `/api/apps`, `/api/events`, `/api/dashboard` | GET | 실 K8s/DB 조회로 전환 |

## 6. 코파일럿 도구 (server vs frontend)

K8s/postgres 를 만지는 도구는 **server tool**(`defineTool`, @copilotkit/runtime/v2) — 서버에서 실행.
네비게이션만 frontend tool(브라우저). `app/api/copilotkit/route.ts` 의 BuiltInAgent 에 `tools:[...]` 주입.

| 도구 | 종류 | 동작 |
|------|------|------|
| `recall_memory(query, scope?, appId?)` | server | postgres 하이브리드 recall |
| `query_incidents(app?, status?)` | server | HuginnIssue/HuginnRun 조회("장애/대처 진행중?") |
| `get_application(app)` | server | HuginnAgent + 최근 Run 요약 |
| `delegate_incident(app, goal, recalled?, severity?)` | server | HuginnIssue 생성(위임) + incident_log |
| `get_run_status(runId)` | server | HuginnRun.status |
| `approve_run(runId)` / `reject_run(runId, reason?)` | server | status/spec PATCH |
| `store_memory(fact, app?, tags?)` | server | postgres store |
| `summarize_incident(runId)` | server | Claude 요약 → memory/incident_log |
| `open_app/open_run/go_to` | frontend | 콘솔 네비게이션 |

상태 변경 도구(delegate/approve/reject/store)는 시스템 프롬프트에서 **실행 전 한 줄 고지** 규칙 적용.

## 7. 기억(Memory) 모델

### 7.1 스토리지 (postgres — Drizzle ORM)
```sql
-- pgvector·확장 불필요(텍스트 검색 전용). 스키마는 lib/schema.ts(Drizzle), 부트스트랩은 ensureSchema.
memory(id, scope['global'|'app'], app_id, app_name, fact, tags text[], score real,
       curated bool, source_run_id, created_at, updated_at)
  -- 인덱스: GIN(to_tsvector('simple',fact)) + (app_id)
memory_history(id, memory_id, prev_fact, new_fact, changed_by, reason, changed_at)
incident_log(id, issue_name, run_name, app_id, app_name, issuing_user, user_prompt, goal,
             status, outcome, summary, cost, created_at, updated_at)
```
CRUD/리스트는 **Drizzle 타입빌더**, 검색 랭킹만 `sql\`\`` raw. → **메인 스펙 §7.4 의 `embedding vector(1536)`
은 제거**(MVP 는 텍스트 검색).

### 7.2 검색 (postgres 텍스트 검색)
**의미(벡터) 검색을 의도적으로 제거**했다 — 외부 임베딩/onnxruntime/pgvector 의존을 없애 어떤 postgres
(CNPG stock 이미지 포함)에서도 동작한다. 검색은 `to_tsvector('simple', fact)` + `plainto_tsquery` +
`ts_rank_cd`(BM25 근사) 키워드 랭킹. query 없으면 `curated, score, recency` 상위. 한국어+영어 키워드 매칭은
`simple` config 토큰화로 처리(필요 시 `pg_trgm` 퍼지 추가). 의미/교차언어 회상은 후속에서 정당화될 때 재도입.

### 7.4 라이프사이클 (recall → 위임 → store → 요약 → 이력)
```
위임 전:  recall(query)                    → 관련 기억을 goal 컨텍스트에 주입(seed)
실행:     에이전트가 진단/PR + (선택)추가 recall
완료 후:  store(fact, scope=app)            → 결과를 기억화
          summarize(결과)                   → Claude 1~2줄 distill → memory.fact/incident.summary
          memory_history insert             → 변경 이력(버전/감사)
          incident_log update               → 사건 이력(상태/outcome/cost/summary)
큐레이션: admin 이 curated=false→true 로 global 승격(후속 UI)
```

## 8. AgentRuntime 보고 계약 (huginnAgentRuntime)

`runner.py` 가 결과를 stdout 외 **Muninn API 로 보고**한다.
- env(이미 operator 가 주입): `MUNINN_API_ENDPOINT`(보고), `MUNINN_MEMORY_ENDPOINT`(store),
  `MUNINN_RUN_NAME`/`MUNINN_NAMESPACE`(대상 Run), 신규 `MUNINN_PR_MODE=dry-run`.
- 진행/완료: `POST {MUNINN_API_ENDPOINT}/api/runs/{run}/report {step,cost,tokens,output,phase?}`.
- 메모리: 완료 시 `POST {MUNINN_MEMORY_ENDPOINT}/api/memories {fact, appId, scope, sourceRunId}`.
- 승인: `approvalTriggers` 충족 시 report(phase 힌트) → API 가 AwaitingApproval 전이.
- **PR dry-run**: `gh pr create` 대신 diff/계획을 output 에 기록(실 PR 은 후속, 실 repo+PAT).

## 9. kind 배포 토폴로지

경량: `muninnWeb/examples/kind-goal-e2e.yaml`(bare `postgres:16` + SA/RBAC, operator 불필요).
권장: `deploy/quickstart`(CloudNativePG provision) + Helm chart(`metaDb.enabled`).
- **postgres** Deployment/Service(`postgres:16` — 텍스트 검색만, pgvector 불필요) + `DATABASE_URL`.
- muninn-web **ServiceAccount + Role/RoleBinding**: `huginnissues`(create/get/list/patch),
  `huginnruns` + `huginnruns/status`(get/list/watch/patch), `huginnagents`(get/list).
- Secret: OAuth(기존). 에이전트→muninn-web 보고는 Service DNS(`http://muninn-web.<ns>.svc:3030`)로.

## 10. 검증 (kind e2e — `/goal` 전체 루프)

1. kind(Podman) + CRD + operator + postgres + muninn-web(SA/RBAC) + Secret.
2. **조회**: "어떤 App 장애/대처 진행중?" → `query_incidents` 가 실제 CR 응답.
3. **위임 루프**: 큰 프롬프트 → recall → delegate(HuginnIssue 생성) → operator→Run→Job →
   agentRuntime 진단+dry-run PR+report → get_run_status(AwaitingApproval) → approve →
   Succeeded(output) → store/summarize → `/api/memories` 회수.
4. `kubectl get hissue,hrun,job,pod` + `psql`(memory/incident row) + 브라우저(코파일럿 표/이력).
5. `pnpm build`(타입체크) + operator `make test`.

## 11. 비고 / 후속

- 대규모(설계+3 코드베이스). status 필드 소유권 위반 금지(operator MergeFrom 보존).
- 자격/회사정보 비커밋(Secret-only, acme placeholder). PR dry-run(실 PR 후속).
- 메모리 검색은 텍스트(FTS) 전용 — 외부 임베딩/pgvector 제거로 어떤 postgres 든 동작. RBAC/네트워크 경로 e2e 확인.
- 후속: 의미(벡터) 검색 재도입(정당화 시), global 자동 distill·중복 감지, curate UI, 실 GitHub PR, webhook 등록 UI.
