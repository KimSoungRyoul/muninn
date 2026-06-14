# Huginn Operator — 설계 검토 & 구체화

> **상태**: Draft v0.3 · 2026-06-12 (멀티테넌시 admission `workspaceId==namespace` 강제, AwaitingApproval→Running 복귀, `MUNINN_WORKSPACE` 주입, CRD v1 보류 정책 반영)
> **범위**: 메인 설계서(`muninn-devops-agent-platform.md`) §2~§6 의 Operator 부분을 **구현 가능한 수준**으로 구체화하고, 발견한 모순/공백을 해소한다.
> **결론 요약**: Operator 는 **Go + kubebuilder(controller-runtime)** 로 구현한다. CRD 3종에 controller 3개 + HuginnAgent ValidatingWebhook 1개. 재시도/상태소유권/취소 전파 등 설계서가 모호하게 남긴 4개 지점을 아래에서 확정한다.
>
> **명칭 주의**: 구 명칭 `HuginnApplication`/`spec.applicationRef` 는 메인 스펙 v0.3 에서 **`HuginnAgent`/`spec.agentRef`** 로 확정됐다. 코드도 `HuginnAgentReconciler`/`agentRef` 다. 아래 본문의 잔존 표기는 모두 `HuginnAgent`/`agentRef` 로 읽어라.

---

## 0. kubebuilder 가 좋은 선택인가? — 그렇다

| 요구사항(설계서 근거) | controller-runtime/kubebuilder 가 주는 것 | kopf(Python) 였다면 |
|---|---|---|
| Operator 는 webhook 수신자가 아니라 **K8s API watch 기반 controller** (§2.2) | watch/informer/work-queue/reconcile 가 프레임워크 기본. `Owns()` 로 소유 리소스 자동 watch | 직접 watch 데코레이터, 큐/리트라이 수동 |
| **CRD 3종 + OpenAPI 스키마 + status 서브리소스 + conditions** (§3) | Go 타입 + controller-gen 마커로 CRD/스키마/RBAC 자동 생성, status subresource 기본 | 스키마를 YAML 수기 작성, drift 위험 |
| **workspaceId 불변성 + 멤버십 ValidatingAdmissionWebhook** (§3.1) | `kubebuilder create webhook` 로 webhook 서버/인증서/매니페스트 스캐폴딩 | webhook 서버·TLS·등록 전부 수동 |
| **Run = K8s Job** (backoffLimit/activeDeadlineSeconds/ttl/podFailurePolicy) (§3.3) | typed `batchv1.Job` 클라이언트, `Owns(&batchv1.Job{})` 로 Job 상태 변화 watch | OK 이지만 타입 안전성↓ |
| **ownerReferences cascade GC + finalizer**(§3.4, §11-7) | `controllerutil.SetControllerReference`, finalizer 헬퍼 | 수동 구현 |
| **멀티테넌시 RBAC**(§6.1) | RBAC 마커 → Role/ClusterRole 자동 생성 | 수동 |

**트레이드오프**: kopf 는 Memory Service(FastAPI/Python)와 언어를 통일한다는 장점(§11-6)이 있으나, 위 표의 K8s-native 요구가 압도적으로 많고 모두 Go 생태계에서 1급으로 지원된다. Operator 는 Memory Service 와 코드 공유가 거의 없는 별도 배포 단위이므로 언어 통일 이점은 작다. → **Go + kubebuilder 확정.**

- 버전: kubebuilder v4, controller-runtime v0.24.1, k8s.io/* v0.36.1, Go 1.26.
- API: `group=muninn.io`, `version=v1beta1`(설계서 네이밍 규칙). **현재 `v1beta1` 단일 버전**(served+storage). CRD `v1` 승격(conversion webhook)은 **보류** — 사유·체크리스트는 [`../../huginnOperator/docs/crd-versioning.md`](../../huginnOperator/docs/crd-versioning.md). 이번 PR 은 버저닝/디프리케이션 정책 doc-comment(`api/v1beta1/groupversion_info.go`) + 전략 문서로 **기반만 마련**했고, v1 패키지·conversion 은 아직 없다.
- 모듈 경로: `github.com/KimSoungRyoul/muninn/huginnOperator`.

---

## 1. Controller ↔ 리소스 watch 토폴로지

```
HuginnAgentReconciler
  For:   HuginnAgent
  Owns:  PersistentVolumeClaim   (앱별 격리 리소스, §5.5)
  ※ ServiceAccount(huginn-agent)는 ensure 하되 Owns 하지 않는다 — namespace 공용 SA 라
    Agent 삭제 시 같이 GC 되면 다른 Run/Agent 가 깨진다(premature GC 방지; 코드 정정).
  Watch: HuginnIssue (→ owner Agent 로 enqueue, status.activeIssues 재계산, §8.4)
  할 일: webhookUrl 발급(§4.5) · bindings 검증 · 앱 PVC 보장 · SA(비소유) 보장 · activeIssues/conditions

HuginnIssueReconciler
  For:   HuginnIssue
  Owns:  HuginnRun
  할 일: retryPolicy 에 따라 HuginnRun(attempt N) 생성/재시도 · run phase 집계 → issue phase
         · AwaitingApproval 집계(§6.4) · suspend 전파

HuginnRunReconciler
  For:   HuginnRun
  Owns:  batchv1.Job
  Watch: (Job 상태 변화는 Owns 로 자동)
  할 일: Job(+필요 시 guardrails ConfigMap) 생성 · 상속 caps 복사 · env/volume 주입(§5.1)
         · Job 상태 → Run.status.phase 매핑 · timeout/ttl 을 Job 네이티브 필드로 위임 · suspend 시 Job 삭제
```

**field indexer**(reconcile 성능): `HuginnIssue.spec.agentRef`, `HuginnRun.spec.issueRef` 에 인덱스를 건다. `Owns()` 가 자동 생성하는 ownerRef 역참조와 별개로, 이름 기반 cross-ref 조회에 사용.

---

## 2. 해소한 모순/공백 (★ 핵심 구체화)

### 2.1 재시도 모델 — "새 Run 생성" vs "Job backoffLimit" 모순 해소

설계서 §3.3 은 **둘 다** 적었다: ① "retry/replay 시 run 이 늘어난다" ② "`retryPolicy.maxRuns → Job backoffLimit`". 이 둘은 양립 불가다. backoffLimit 으로 Pod 를 재시도하면 Run CR 은 1개로 유지되기 때문이다.

**확정안: Run = 1 attempt = backoffLimit 0 인 Job 1개. 재시도는 Issue controller 가 새 Run(attempt N+1)을 만들어 수행한다.**

근거:
- 에이전트 실행은 **비멱등**이다(PR/Issue/메모리 저장 부작용). Pod 를 무지성 재시작하면 중복 PR 위험 → Pod-level 재시도(backoffLimit)는 부적합.
- attempt 마다 **독립 transcript·cost·token 회계**가 필요(UI Run 목록은 attempt 단위). Run CR 분리가 이를 자연히 만족.
- "retry 마다 새 Run" 이라는 설계 의도(§3.3, 그림의 "이슈 안에 여러 Run")와 일치.

따라서:
- `HuginnRun → Job.spec.backoffLimit = 0`(Pod 실패 = attempt 실패).
- `HuginnIssue.spec.retryPolicy.maxRuns` = **이슈가 만들 수 있는 Run 총개수 상한**. Issue controller 가 직전 Run 이 `Failed` 면 `len(runRefs) < maxRuns` 일 때 다음 attempt Run 생성.
- `backoff: exponential` 은 Issue controller 가 **재시도 간 `RequeueAfter`** 로 구현(예: 30s·60s·120s). Job 네이티브 backoff 아님.
- **멱등 가드(에이전트 측 책임, 문서화)**: PR 생성 전 `huginn` 라벨 열린 PR 존재 여부 확인 후 생성/갱신. (Operator 가 강제할 수 없으니 SOUL/global prompt 에 규약으로 명시.)

> 설계서 §3.3 의 "maxRuns→backoffLimit" 문구는 **본 문서가 정정**한다(메인 설계서 차기 개정 반영 대상).

### 2.2 status 다중 writer 문제 — 필드 소유권 분리

`HuginnRun.status` 를 **두 주체**가 쓴다: Operator(Job lifecycle 기반)와 Agent/Muninn API(실행 진행 메트릭). 충돌 방지를 위해 **소유 필드를 분리**한다.

| status 필드 | 소유자 | 출처 |
|---|---|---|
| `phase`(Queued/Pending/Running/Succeeded/Failed/Cancelled) | **Operator** | Job/Pod lifecycle |
| `phase=AwaitingApproval` 전이 | **Muninn API** | 에이전트 request-approval(§6.4) |
| `startedAt` | Operator | Job start |
| `finishedAt`, `duration` 계산 | Operator | Job 종료 |
| `step` | **Agent→API** | SDK 메시지 스트림(§5.3) |
| `cost`, `tokens` | **Agent→API** | ResultMessage(§5.4) |
| `maxStep`, `maxCostUsd`, `maxTokens` | Operator(생성 시 1회) | 이슈 상속 복사(maxStep=maxIterations) |
| `recalledMemoryIds` | **API**(recall-report, §5.6) | 에이전트 보고 |
| `output`(PR/Issue) | **Agent→API** | 발행 결과 |
| `sessionId`(Claude 세션) | **Agent→API** | 스트림 init/Result 메시지(§5.5 resume). 다음 attempt 가 `MUNINN_RESUME_SESSION_ID` 로 이어받는다 |
| `conditions[]` | Operator(전이 사유) + API(승인 사유) | — |

**충돌 회피 메커니즘**: 두 writer 모두 **status subresource 만** 패치하고, 각자 **자기 필드만** 패치(JSON Merge Patch/SSA field manager 분리). Operator 는 진행 메트릭(step/cost/...)을 **절대 0 으로 덮어쓰지 않는다**(reconcile 시 해당 필드는 read-only 취급). 이를 위해 Operator 의 Run reconcile 은 status 패치 시 `phase/startedAt/finishedAt/conditions` 만 갱신하는 부분 패치를 사용.

> AwaitingApproval ↔ Pod Running 공존 (**구현됨**): 승인 대기 중에도 Pod 는 살아 에이전트(runner.py)가 `GET /api/runs/{id}` 로 결정을 폴링한다. 승인 시 **Muninn API 는 `approval.state=Approved` 만 쓰고 `phase` 는 건드리지 않으며**, Operator 가 다음 reconcile 에서 `phase=AwaitingApproval && approval.state=Approved` 를 관측하면 **`phase` 를 `Running` 으로 복귀**시킨다(`huginnrun_controller.go` `mapJobToRunStatus`; condition `reason=Approved`). 아직 Pending 이면 phase 를 보존만 한다. status 패치는 `MergeFromWithOptimisticLock` 으로 두 writer 경합을 409→requeue 로 처리. Job 이 종료되면 그때만 Succeeded/Failed 로 전이.

### 2.3 취소/거절 전파 — `spec.suspend`

승인 거절/사용자 취소 시 **실행 중 Pod 를 멈춰야** 한다. K8s-native 하게:

- `HuginnRun.spec.suspend: bool`(기본 false) — Job 의 suspend 의미를 차용하되, 에이전트 Pod 는 suspend-resume 이 무의미하므로 **Operator 는 suspend=true 를 보면 Job 을 삭제하고 phase=Cancelled** 로 전이.
- 흐름: 운영자 거절 → Muninn API 가 해당 Run 들 `spec.suspend=true` 패치 + Issue `status.phase=Cancelled` → Run reconciler 가 Job 삭제 → phase=Cancelled, condition `reason=ApprovalRejected`.
- graceful: 삭제 시 `propagationPolicy=Background`, Pod `terminationGracePeriodSeconds`(기본 30s) 동안 에이전트가 finishedAt/recall-report flush. 더 강한 보장이 필요하면 §3 finalizer.

### 2.4 부수 리소스 생성 주체

| 리소스 | 생성/보장 주체 | 비고 |
|---|---|---|
| Namespace `ns-{workspace-slug}` | **Operator 범위 밖**. 플랫폼 admin / Muninn API 가 사전 provision | 차기: WorkspaceReconciler 후보. **App.namespace ↔ workspaceId 정합은 validating webhook 이 강제(구현됨, §4)** — `spec.workspaceId == metadata.namespace` 불일치 시 거부 |
| 앱 PVC `pvc-claude-{app}` (`~/.claude`) | **HuginnAgentReconciler** (Owns) | §5.5 MVP=앱별 격리 PVC. accessMode 는 설정(RWO 기본, 동시 Run 시 RWX) |
| ServiceAccount `huginn-agent` | **HuginnAgentReconciler** (ensure, **비소유**) | 자기 ns Secret/CM 만 read(§6.1). namespace 공용이라 Owns 하지 않는다(premature GC 방지) |
| guardrails/context ConfigMap | **HuginnRunReconciler** 또는 env 직접 주입 | MVP=env 직접(`MUNINN_GUARDRAILS` JSON), CM 은 global-prompt/team-settings/soul 만 |
| Job (→Pod) | **HuginnRunReconciler** (Owns) | jobTemplate.podSpec 기반 |
| event Secret `{issue}-event` | **Muninn API** (CR 생성 시 함께) | **Secret 생성은 미구현(후속)**. 다만 인입 이벤트는 metaDB `inbound_event` 테이블에 영속된다(원본 payload 는 평문 text, dedup·재처리·감사용 — 메인 스펙 §4.4). 원본 payload 를 Secret 으로 격리하는 것은 후속. Operator 는 참조만 |

### 2.5 에이전트 env 주입 — Issue 단위 + Run 단위

에이전트 컨테이너 env 는 **두 시점**에서 채워진다(보고가 특정 Run 을 가리킬 수 있어야 하므로):

- **Issue 단위**(`buildJobTemplate`, Issue→Run 생성 시): `MUNINN_GOAL`, `MUNINN_GUARDRAILS`(JSON),
  `MUNINN_MEMORY_ENDPOINT`/`MUNINN_API_ENDPOINT`(= muninnWeb, operator env 로 설정), 자격(Secret), SOUL/payload 참조.
- **Run 단위**(`runScopedEnv`, Job 생성 시 — Run 이름이 확정되는 시점): `MUNINN_RUN_NAME`, `MUNINN_ISSUE_NAME`,
  `MUNINN_AGENT_NAME`(= app, 메모리 scope), `MUNINN_NAMESPACE`, `MUNINN_WORKSPACE`(멀티테넌시 경계 — `muninn.io/workspace` 라벨 우선, 누락 시 `run.Namespace` 폴백; runner.py 가 메모리 store/recall 에 동봉해 테넌트 간 기억 누수 차단), `MUNINN_ATTEMPT`, `MUNINN_PR_MODE`(기본 `dry-run`).

재시도 attempt(N≥2)에는 Issue controller 가 Run 생성 시 **가장 최근에 보고된** `status.sessionId`
(attempt 역순으로 첫 non-empty — `lastSessionID`; 직전 attempt 가 init 전에 죽었으면 그 이전 세션으로
폴백)를 `MUNINN_RESUME_SESSION_ID` 로 jobTemplate.env 에 덧붙인다(`withResumeSession`, §5.5) —
runner 가 이 값으로 직전 Claude 세션을 resume 해 진단 컨텍스트를 이어받는다. 전부 비어 있으면 새 세션.
runner 쪽에도 preflight 가 있다: resume 대상 transcript 가 PVC 에 없으면(`_has_transcript`) 깨진
resume 으로 attempt 를 태우는 대신 새 세션으로 폴백한다.

에이전트(runner.py)는 이 env 로 **회상→보고→기억화**를 수행한다(보고 계약은 `muninn-goal-conversational-delegation.md` §8):
`POST {MUNINN_MEMORY_ENDPOINT}/api/memories/recall`(위임 직전 회상) → `POST {MUNINN_API_ENDPOINT}/api/runs/{run}/report`
(step/cost/tokens/output·outcome — Agent→API 소유 필드만; §2.2) → `POST {MUNINN_MEMORY_ENDPOINT}/api/memories`(결과 기억화).
`MUNINN_PR_MODE=dry-run` 이면 실제 `gh pr create` 대신 **PR 계획(title/요약/diff)** 을 output 으로 보고한다(실 PR 은 후속).

### 2.6 `~/.claude` PVC 스코프 — Issue별 subPath 격리 (실행 어댑터 설계 노트)

**문제(이전 설계).** 앱별 PVC(`pvc-claude-<app>`, `ensurePVC`, RWO)를 모든 Run 이 `~/.claude` 루트에 그대로
마운트했다. 그런데 **resume 경계는 Issue**(`withResumeSession` — attempt 간만, Issue 간 컨텍스트 오염 방지)
인데 **영속 경계는 App** 이라 스코프가 어긋났다. 결과:

- 같은 앱의 **서로 다른 Issue** 들의 transcript(`projects/<cwd-hash>/*.jsonl`)·설정(`settings.json`)이
  한 디렉토리에 물리적으로 뒤섞인다(§5.5 의 "Issue 간 오염 방지" 의도가 resume 의 session-id 매칭에만
  의존하고 파일 레이아웃으로는 보장되지 않음).
- RWO PVC 라 같은 앱의 두 Issue Pod 가 다른 노드에 스케줄되면 Multi-Attach 로 두 번째가 Pending,
  같은 노드면 `~/.claude` 공유 파일 동시쓰기 경합.

**변경.** `JobTemplate.ClaudeSubPath` 필드를 추가하고 `buildJobTemplate` 이 이를 **Issue 이름**으로 채운다.
`expandPodSpec` 이 그 값을 `VolumeMount.SubPath` 로 적용해 **앱 PVC 안의 Issue별 하위 경로**를 `~/.claude` 로
마운트한다. 영속 경계를 resume 경계(Issue)와 일치시킨다.

subPath 디렉토리는 kubelet 이 pod 마운트 시 생성하는데, fsGroup chown(볼륨 attach 1회) *이후*라
`root:root 0755` 로 만들어질 수 있다(k8s subPath+fsGroup gap). 그러면 비-root(uid 1000) 런타임이
`~/.claude` 하위에 transcript/`settings.json` 를 못 써 resume 이 **조용히 깨진다**(기존 루트 마운트엔 없던
회귀). 이를 막기 위해 `expandPodSpec` 은 subPath 가 채워질 때 **initContainer(`claude-home-init`)** 를
함께 단다 — PVC 루트를 `/claude-store` 에 (subPath 없이) 마운트하고 `mkdir -p` 로 subPath 디렉토리를 미리
만든다. 루트는 fsGroup 으로 그룹쓰기가 가능하므로 uid 1000 init 이 디렉토리를 만들면 소유권이 1000 으로
잡혀 main 컨테이너의 subPath 마운트가 쓰기 가능해진다. init 은 pod SecurityContext(RunAsUser/fsGroup 1000,
root 승격 없음)를 그대로 따르고 `mkdir -p` 라 멱등하다.

```
BEFORE                                  AFTER
pvc-claude-<app> (RWO)                  pvc-claude-<app> (RWO)
└ ~/.claude/         ← 모든 Issue 공유   ├ <issue-A>/  → Run(A·attempt들)  ~/.claude
  ├ settings.json    ⚠ 동시쓰기 경합     └ <issue-B>/  → Run(B·attempt들)  ~/.claude
  └ projects/*.jsonl ⚠ Issue 혼재               ↑ subPath 로 물리 격리
                                        ✓ Issue 간 ~/.claude 오염 제거
resume=Issue, 영속=App (불일치)         ✓ resume(=Issue) 내 attempt 는 같은 subPath → 정상
```

- **같은 Issue 의 attempt 들**은 같은 subPath 를 공유 → 세션 transcript 가 남아 resume 이 그대로 동작
  (`withResumeSession` / `_has_transcript` 불변).
- **비면(레거시 JobTemplate)** PVC 루트를 마운트 — 기존 동작 보존(하위호환).

**RWO vs 병렬성(정직한 한계).** subPath 는 *디렉토리 격리*와 *resume 스코프 정합*을 보장하지만, 단일
RWO PVC 라는 사실은 그대로다 — 같은 앱의 Issue 들을 **노드를 가로질러 동시 실행**하려면 RWX
StorageClass 가 필요하다(operator 의 `--storage-class` 로 지정 가능). RWX 미가용 환경에서는 같은 앱의
Issue 들이 볼륨 레벨에서 직렬화되지만 데이터 격리·resume 정합은 항상 유지된다. 진정한 앱 내 병렬을
강제로 원하면 후속에서 **Issue별 PVC**(Issue ownerRef, RWO each)로 갈 수 있으나, PVC 라이프사이클/GC
비용이 늘어 현 단계에서는 채택하지 않는다.

**왜 runner.py(Agent SDK)를 들어내지 않는가 — 기각된 대안.** "runner.py 를 빼고 `claude` CLI 이미지만
PVC 마운트해 직접 실행" 안이 제기됐으나 기각한다. runner.py 는 *Claude Code 런처/인스톨러가 아니라*
**Muninn 통합 어댑터**다(이미지에 `claude` CLI 가 baked-in, 런타임 설치 없음). SDK `query()` 루프는
~30줄뿐이고 나머지는 전부 플랫폼 계약이다: status 보고(§2.2 Agent→API 소유 필드), 메모리 recall/store,
HITL 승인 게이트·폴링(§C-HITL), SIGTERM→terminal 보고 내구성(incident 'running' 고착 방지). bare CLI 로
바꾸면 이 어댑터가 사라지는 게 아니라 사이드카/wrapper 로 **이동**할 뿐이며(stream-json 손파싱), 타입
메시지·resume·usage 추출을 재구현해 더 나빠진다.

| 대안 | 결정 | 이유 |
|------|------|------|
| bare `claude` CLI (runner.py 제거) | 기각 | Muninn 어댑터를 사이드카로 이동시킬 뿐 — 복잡도 감소 아님, 타입 메시지 상실 |
| raw Messages API + 자체 루프 | 기각 | 에이전트 루프·도구 실행기·resume 재발명 = 더 큰 복잡도 |
| Managed Agents (self-hosted sandbox) | 기각 | in-cluster 실행은 가능하나 루프 오케스트레이션이 Anthropic 쪽 → operator 의 `HuginnRun.phase` 소유권(§2.2) 충돌, beta, memory_store/env-credential 미지원 |
| Python SDK → CLI `--output-format stream-json` | 보류 | Python SDK 의존 1개 제거되나 session_id/usage 손파싱 필요 → 순효과 wash |

→ **실행 모델(self-host + Agent SDK in K8s Job)은 유지가 정답.** 클러스터 자격으로 운영하는 에이전트를
호스팅 샌드박스로 옮길 수 없다. runner.py 의 응집도 문제(루프+보고+HITL+시그널 혼재)는 *구조 변경이
아니라 모듈 분리*(`report.py`/`memory.py`/`approval.py`)로 푸는 **후속 리팩터링**으로 남긴다(동작 불변).

> **인증 정책(2026-06-15~).** Anthropic 이 6/15 부터 Agent SDK·프로그래밍 사용을 구독 풀이 아니라 별도
> 크레딧 풀(표준 API 요금)로 분리한다. 운영 기본 자격은 `ANTHROPIC_API_KEY`(종량제 키), 구독
> `CLAUDE_CODE_OAUTH_TOKEN` 은 로컬 개발/테스트 한정으로 둔다(2월 ToS 상 OAuth 는 Claude Code/Claude.ai
> 한정). 코드는 이미 dual-mode(`claude_skill.sh`, `copilot-anthropic.ts`)라 키 주입만 바꾸면 된다.

---

## 3. Finalizer (§11-7 구체화)

- **MVP**: ownerReference cascade GC 로 충분(App 삭제 → Issue → Run → Job → Pod). finalizer **선택**.
- **추가 시점**: 진행 중 Run 이 삭제될 때 (a) 에이전트가 recall-report/finishedAt 를 flush 하고 (b) 외부 부작용(열린 draft PR) 정리 훅이 필요하면 `HuginnRun` 에 finalizer `muninn.io/run-cleanup` 추가. Operator 가 finalize 시 Job graceful delete + API 에 종료 통지.
- 본 구현: finalizer 상수/헬퍼를 Run reconciler 에 **스캐폴딩만** 두고 기본 비활성(주석). 부작용 정리 정책 확정 후 활성화.

---

## 4. Admission Webhook 범위 (§3.1)

`HuginnAgent` ValidatingWebhook + Defaulting:

- **Validating(순수, 외부 의존 없음)**:
  - `spec.workspaceId` required & **immutable**(update 시 변경 거부).
  - `metadata.name` 형식 `^[a-z0-9-]+$`(CRD OpenAPI 패턴과 이중 방어).
  - `spec.output ∈ {pull_request, github_issue}`, `spec.kind ∈ {triton,fastapi,airflow,other}` (CRD enum 과 이중).
  - **`spec.workspaceId == metadata.namespace` 강제(구현됨)** — 워크스페이스=네임스페이스. 불일치 시 거부, 빈 workspaceId 거부. (단위테스트 컨텍스트처럼 `metadata.namespace` 가 빈 경우만 이 매칭을 건너뜀.)
- **Defaulting**: 라벨 `muninn.io/workspace=<workspaceId>` 자동 주입(selector 보조, §3.1).
- **멤버십(owner|member) 검증은 webhook 에 넣지 않는다**: metaDB 조회가 필요해 webhook 가 DB 가용성에 의존하게 되고, webhook 다운 시 모든 CR 연산이 막힌다(가용성 리스크). **CR 생성자인 Muninn API 가 이미 사용자 인증 후 멤버십을 검사**하므로 그 계층에서 집행. (webhook 는 인증 주체를 신뢰할 수 없는 경우의 최후 방어선이지만, 본 플랫폼은 API 가 유일 생성 경로이므로 API 검증으로 충분.)

> webhook 는 순수 함수로 유지 → 가용성·테스트 용이성 확보.

---

## 5. RBAC (controller-gen 마커로 생성)

- CRD 3종: `create;delete;get;list;patch;update;watch` + `/status`,`/finalizers`.
- `batch/jobs`: `create;delete;get;list;watch;patch`.
- `core/pods`: `get;list;watch`(상태 관찰, 로그는 API 가 담당).
- `core/persistentvolumeclaims`,`core/serviceaccounts`: `create;get;list;watch;patch`.
- `core/configmaps`,`core/secrets`: `get;list;watch`(주입 참조). guardrails CM 생성 시 configmaps `create;patch`.
- `core/events`: `create;patch`.

---

## 6. 상태 머신 매핑 (Job → Run.phase)

| 관찰(Job/Pod) | Run.phase | condition |
|---|---|---|
| Run 생성, Job 미생성 | `Queued` | `JobCreated=False` |
| Job 생성, Pod Pending | `Pending` | `PodScheduled` |
| Pod Running | `Running` | `Running=True, reason=AgentRunning` |
| (API) request-approval | `AwaitingApproval` | `Approval=Pending` |
| Job `Complete` | `Succeeded` | `Succeeded=True` |
| Job `Failed`(backoffLimit 0 → 1 Pod 실패) | `Failed` | `Failed=True, reason=...` |
| `spec.suspend=true` | `Cancelled` | `Cancelled=True, reason=ApprovalRejected/UserCancel` |
| `activeDeadlineSeconds` 초과 | `Failed` | `reason=DeadlineExceeded` |

Issue.phase = Run 들의 집계:
- 활성 Run 이 `Running/Pending/Queued` → `Running`.
- 활성 Run 이 `AwaitingApproval` → `AwaitingApproval`.
- 최신 Run `Succeeded` → `Succeeded`(`status.outcome` = Run.output).
- 모든 attempt 소진 & 최신 `Failed` → `Failed`.
- suspend/취소 → `Cancelled`.

---

## 7. Phase 0 (Walking Skeleton) 구현 체크리스트

- [x] kubebuilder init + API 3종 + types(spec/status, OpenAPI 마커)
- [x] CRD/RBAC 매니페스트 생성(`make manifests`)
- [x] HuginnRunReconciler: Run→Job 생성, env/volume 주입, Job→phase 매핑, suspend→Cancel
- [x] HuginnIssueReconciler: Issue→Run(attempt 1) 생성, run phase 집계, 재시도(maxRuns)
- [x] HuginnAgentReconciler: webhookUrl 발급, PVC/SA 보장, activeIssues 집계
- [x] HuginnAgent ValidatingWebhook(workspaceId required/immutable + **`workspaceId==namespace` 강제**) + Defaulting(label) + 단위테스트(`huginnagent_validation_test.go`)
- [x] **AwaitingApproval API 연동**: API 가 `approval.state` 만 쓰고 Operator 가 Approved 관측 시 phase→Running 복귀(§2.2), `MUNINN_WORKSPACE` Run env 주입(§2.5)
- [x] field indexer(issueRef/agentRef), Owns 토폴로지
- [x] `make build` 컴파일 통과
- [ ] (차기) e2e(kind), finalizer 활성화, 만료 자동집행 데몬, 멤버십 검증(API), CRD v1 conversion(보류 — crd-versioning.md)

---

## 8. 메인 설계서 정정 제안(요약)

1. §3.3 "retryPolicy.maxRuns → Job backoffLimit" → **"Job.backoffLimit=0; Issue controller 가 attempt 별 Run 생성, maxRuns=Run 상한"** 으로 정정(본 문서 §2.1).
2. §3.3/§3.4 status 필드에 **소유자(Operator vs API)** 주석 추가(본 문서 §2.2).
3. `HuginnRun.spec.suspend` 필드 신설 — 취소/거절 전파 경로(본 문서 §2.3).
4. §6.4 승인 멤버십·§3.1 workspaceId 멤버십 검증을 **API 계층** 책임으로 명시(webhook 는 순수 검증만; 본 문서 §4).
