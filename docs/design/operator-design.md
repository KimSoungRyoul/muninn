# Huginn Operator — 설계 검토 & 구체화

> **상태**: Draft v0.1 · 2026-06-03
> **범위**: 메인 설계서(`muninn-devops-agent-platform.md`) §2~§6 의 Operator 부분을 **구현 가능한 수준**으로 구체화하고, 발견한 모순/공백을 해소한다.
> **결론 요약**: Operator 는 **Go + kubebuilder(controller-runtime)** 로 구현한다. CRD 3종에 controller 3개 + HuginnApplication ValidatingWebhook 1개. 재시도/상태소유권/취소 전파 등 설계서가 모호하게 남긴 4개 지점을 아래에서 확정한다.

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

- 버전: kubebuilder v4, controller-runtime(최신), Go 1.26.
- API: `group=muninn.io`, `version=v1beta1`(설계서 네이밍 규칙).
- 모듈 경로: `github.com/KimSoungRyoul/muninn/huginnOperator`.

---

## 1. Controller ↔ 리소스 watch 토폴로지

```
HuginnApplicationReconciler
  For:   HuginnApplication
  Owns:  PersistentVolumeClaim, ServiceAccount   (앱별 격리 리소스, §5.5/§6.1)
  Watch: HuginnSession (→ owner App 으로 enqueue, status.activeSessions 재계산, §8.4)
  할 일: webhookUrl 발급(§4.5) · bindings 검증 · 앱 PVC/SA 보장 · activeSessions/conditions

HuginnSessionReconciler
  For:   HuginnSession
  Owns:  HuginnRun
  할 일: retryPolicy 에 따라 HuginnRun(attempt N) 생성/재시도 · run phase 집계 → session phase
         · AwaitingApproval 집계(§6.4) · suspend 전파

HuginnRunReconciler
  For:   HuginnRun
  Owns:  batchv1.Job
  Watch: (Job 상태 변화는 Owns 로 자동)
  할 일: Job(+필요 시 guardrails ConfigMap) 생성 · 상속 caps 복사 · env/volume 주입(§5.1)
         · Job 상태 → Run.status.phase 매핑 · timeout/ttl 을 Job 네이티브 필드로 위임 · suspend 시 Job 삭제
```

**field indexer**(reconcile 성능): `HuginnSession.spec.applicationRef`, `HuginnRun.spec.sessionRef` 에 인덱스를 건다. `Owns()` 가 자동 생성하는 ownerRef 역참조와 별개로, 이름 기반 cross-ref 조회에 사용.

---

## 2. 해소한 모순/공백 (★ 핵심 구체화)

### 2.1 재시도 모델 — "새 Run 생성" vs "Job backoffLimit" 모순 해소

설계서 §3.3 은 **둘 다** 적었다: ① "retry/replay 시 run 이 늘어난다" ② "`retryPolicy.maxRuns → Job backoffLimit`". 이 둘은 양립 불가다. backoffLimit 으로 Pod 를 재시도하면 Run CR 은 1개로 유지되기 때문이다.

**확정안: Run = 1 attempt = backoffLimit 0 인 Job 1개. 재시도는 Session controller 가 새 Run(attempt N+1)을 만들어 수행한다.**

근거:
- 에이전트 실행은 **비멱등**이다(PR/Issue/메모리 저장 부작용). Pod 를 무지성 재시작하면 중복 PR 위험 → Pod-level 재시도(backoffLimit)는 부적합.
- attempt 마다 **독립 transcript·cost·token 회계**가 필요(UI Run 목록은 attempt 단위). Run CR 분리가 이를 자연히 만족.
- "retry 마다 새 Run" 이라는 설계 의도(§3.3, 그림의 "세션 안에 여러 Run")와 일치.

따라서:
- `HuginnRun → Job.spec.backoffLimit = 0`(Pod 실패 = attempt 실패).
- `HuginnSession.spec.retryPolicy.maxRuns` = **세션이 만들 수 있는 Run 총개수 상한**. Session controller 가 직전 Run 이 `Failed` 면 `len(runRefs) < maxRuns` 일 때 다음 attempt Run 생성.
- `backoff: exponential` 은 Session controller 가 **재시도 간 `RequeueAfter`** 로 구현(예: 30s·60s·120s). Job 네이티브 backoff 아님.
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
| `maxStep`, `maxCostUsd`, `maxTokens` | Operator(생성 시 1회) | 세션 상속 복사(maxStep=maxIterations) |
| `recalledMemoryIds` | **API**(recall-report, §5.6) | 에이전트 보고 |
| `output`(PR/Issue) | **Agent→API** | 발행 결과 |
| `conditions[]` | Operator(전이 사유) + API(승인 사유) | — |

**충돌 회피 메커니즘**: 두 writer 모두 **status subresource 만** 패치하고, 각자 **자기 필드만** 패치(JSON Merge Patch/SSA field manager 분리). Operator 는 진행 메트릭(step/cost/...)을 **절대 0 으로 덮어쓰지 않는다**(reconcile 시 해당 필드는 read-only 취급). 이를 위해 Operator 의 Run reconcile 은 status 패치 시 `phase/startedAt/finishedAt/conditions` 만 갱신하는 부분 패치를 사용.

> AwaitingApproval ↔ Pod Running 공존: 승인 대기 중에도 Pod 는 살아 에이전트가 결정을 폴링한다. Operator 는 Pod=Running 인데 phase=AwaitingApproval 이어도 **phase 를 Running 으로 되돌리지 않는다**(API 소유 전이 존중). Job 이 종료되면 그때만 Succeeded/Failed 로 전이.

### 2.3 취소/거절 전파 — `spec.suspend`

승인 거절/사용자 취소 시 **실행 중 Pod 를 멈춰야** 한다. K8s-native 하게:

- `HuginnRun.spec.suspend: bool`(기본 false) — Job 의 suspend 의미를 차용하되, 에이전트 Pod 는 suspend-resume 이 무의미하므로 **Operator 는 suspend=true 를 보면 Job 을 삭제하고 phase=Cancelled** 로 전이.
- 흐름: 운영자 거절 → Muninn API 가 해당 Run 들 `spec.suspend=true` 패치 + Session `status.phase=Cancelled` → Run reconciler 가 Job 삭제 → phase=Cancelled, condition `reason=ApprovalRejected`.
- graceful: 삭제 시 `propagationPolicy=Background`, Pod `terminationGracePeriodSeconds`(기본 30s) 동안 에이전트가 finishedAt/recall-report flush. 더 강한 보장이 필요하면 §3 finalizer.

### 2.4 부수 리소스 생성 주체

| 리소스 | 생성/보장 주체 | 비고 |
|---|---|---|
| Namespace `ns-{workspace-slug}` | **Operator 범위 밖(MVP)**. 플랫폼 admin / Muninn API 가 사전 provision | 차기: WorkspaceReconciler 후보. Operator 는 App.namespace ↔ workspaceId 정합만 검증 |
| 앱 PVC `pvc-claude-{app}` (`~/.claude`) | **HuginnApplicationReconciler** (Owns) | §5.5 MVP=앱별 격리 PVC. accessMode 는 설정(RWO 기본, 동시 Run 시 RWX) |
| ServiceAccount `huginn-agent-{ns}` | **HuginnApplicationReconciler** (Owns) | 자기 ns Secret/CM 만 read(§6.1) |
| guardrails/context ConfigMap | **HuginnRunReconciler** 또는 env 직접 주입 | MVP=env 직접(`MUNINN_GUARDRAILS` JSON), CM 은 global-prompt/team-settings/soul 만 |
| Job (→Pod) | **HuginnRunReconciler** (Owns) | jobTemplate.podSpec 기반 |
| event Secret `{session}-event` | **Muninn API** (CR 생성 시 함께) | Operator 는 참조만 |

---

## 3. Finalizer (§11-7 구체화)

- **MVP**: ownerReference cascade GC 로 충분(App 삭제 → Session → Run → Job → Pod). finalizer **선택**.
- **추가 시점**: 진행 중 Run 이 삭제될 때 (a) 에이전트가 recall-report/finishedAt 를 flush 하고 (b) 외부 부작용(열린 draft PR) 정리 훅이 필요하면 `HuginnRun` 에 finalizer `muninn.io/run-cleanup` 추가. Operator 가 finalize 시 Job graceful delete + API 에 종료 통지.
- 본 구현: finalizer 상수/헬퍼를 Run reconciler 에 **스캐폴딩만** 두고 기본 비활성(주석). 부작용 정리 정책 확정 후 활성화.

---

## 4. Admission Webhook 범위 (§3.1)

`HuginnApplication` ValidatingWebhook + Defaulting:

- **Validating(순수, 외부 의존 없음)**:
  - `spec.workspaceId` required & **immutable**(update 시 변경 거부).
  - `metadata.name` 형식 `^[a-z0-9-]+$`(CRD OpenAPI 패턴과 이중 방어).
  - `spec.output ∈ {pull_request, issue}`, `spec.kind ∈ {triton,fastapi,airflow,other}` (CRD enum 과 이중).
  - (선택) `metadata.namespace` 가 workspaceId 규약과 정합한지.
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

Session.phase = Run 들의 집계:
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
- [x] HuginnSessionReconciler: Session→Run(attempt 1) 생성, run phase 집계, 재시도(maxRuns)
- [x] HuginnApplicationReconciler: webhookUrl 발급, PVC/SA 보장, activeSessions 집계
- [x] HuginnApplication ValidatingWebhook(workspaceId required/immutable) + Defaulting(label)
- [x] field indexer(sessionRef/applicationRef), Owns 토폴로지
- [x] `make build` 컴파일 통과
- [ ] (차기) envtest 단위테스트, e2e(kind), finalizer 활성화, AwaitingApproval API 연동, 멤버십(API)

---

## 8. 메인 설계서 정정 제안(요약)

1. §3.3 "retryPolicy.maxRuns → Job backoffLimit" → **"Job.backoffLimit=0; Session controller 가 attempt 별 Run 생성, maxRuns=Run 상한"** 으로 정정(본 문서 §2.1).
2. §3.3/§3.4 status 필드에 **소유자(Operator vs API)** 주석 추가(본 문서 §2.2).
3. `HuginnRun.spec.suspend` 필드 신설 — 취소/거절 전파 경로(본 문서 §2.3).
4. §6.4 승인 멤버십·§3.1 workspaceId 멤버십 검증을 **API 계층** 책임으로 명시(webhook 는 순수 검증만; 본 문서 §4).
