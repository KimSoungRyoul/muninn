# muninn 코드 품질·복잡도 리뷰 (2026-06)

> muninn 모노레포 전반을 코드 품질·복잡도 관점에서 멀티에이전트로 리뷰하고(8개 컴포넌트 병렬 + 각 발견 사항 적대적 검증), 검증 통과한 71건의 리팩토링 후보를 정리한 문서다. 그중 21건(저위험·동작보존·검증가능)을 동반 PR 에서 구현했고, 나머지는 후속 백로그로 남긴다.

리뷰 방법: 컴포넌트별 리뷰어가 실제 코드를 읽어 발견 사항을 보고 → 각 발견을 독립 검증자가 file:line 을 다시 열어 실재성·프로젝트 규약 위반 여부·안전성을 적대적으로 판정 → recommend≠exclude & is_real 만 채택(77건 중 71건 통과).

- **검증 통과 후보**: 71건
- **이번 PR 구현**: 21건
- **후속 백로그**: 50건


## 이번 PR 에서 구현 (21건)

동작 보존 리팩토링만 채택했고, Go(build/vet/test)·TS(tsc/eslint) 로 검증했다. 두 개의 독립 적대 리뷰어가 diff 의 동작 보존을 재확인했다.

| ID | 컴포넌트 | 분류 | 요약 |
|----|----------|------|------|
| `dup-set-condition-helpers` | huginnOperator — 컨트롤러 | duplication | setRunCondition/setIssueCondition + agent 인라인 condition 설정이 동일 로직 3중 중복 |
| `dup-patchstatus-helpers` | huginnOperator — 컨트롤러 | duplication | run/issue patchStatus 헬퍼가 타입만 다르고 본문 동일 — 중복 |
| `map-job-status-nested-special-case` | huginnOperator — 컨트롤러 | complexity | mapJobToRunStatus 의 AwaitingApproval 보존 특례가 default 분기 안에 깊게 중첩 |
| `redundant-effective-runtime-recompute` | huginnOperator — 컨트롤러 | complexity | createRun 에러 메시지에서 effectiveRuntimeOf 재계산 — resolved 가 이미 확정값 보유 |
| `truncate-triplicated-divergent` | huginnSelfRuntime (Go) | duplication | truncate 헬퍼가 3곳에 중복 구현되고 byte vs rune 시맨틱이 갈린다 |
| `http-client-three-places` | huginnSelfRuntime (Go) | structure | http.Client 생성/폴백이 세 곳에 흩어져 타임아웃 일원화가 안 됨 |
| `mock-runvm-mapping-dup-3x` | muninnWeb — lib | duplication | mock Run→RunVM 매핑이 incidents.ts 안에서 3번 거의 동일하게 반복 |
| `approvalstate-vs-loadapprovable-expiry-dup` | muninnWeb — lib | duplication | approval 만료(expiresAt 경과) 판정이 approvalState 와 loadApprovableRun 두 곳에 복제 |
| `run-status-label-dup` | muninnWeb — components | duplication | run status→한국어 라벨 매핑이 5곳에 중복 (RUN_LABEL 2개 + 인라인 삼항 3개 + kLabel) |
| `incident-card-dup` | muninnWeb — components | duplication | incidents.tsx 의 사건 헤더+run 테이블 렌더 블록이 두 컴포넌트에 통째로 중복 |
| `dead-tool-category` | muninnWeb — components | dead-code | ToolCategoryHeader + ObsCategory/ToolCategory 별칭은 정의만 있고 사용처 없음 (데드코드) |
| `dead-ui-primitives` | muninnWeb — components | dead-code | ui.tsx / common.tsx 의 미사용 export 다수 (HmSpark, Calendar, Breadcrumb, Pagination, Toast, Skeleton, AvatarStack, Radio, Checkbox, Tag, Modal, Dropdown, MenuItem, RavenLockup) |
| `app-initials-dup` | muninnWeb — components | duplication | 앱 이니셜 계산 로직이 4곳에 인라인 복제 (ui.tsx Avatar 와도 거의 동일) |
| `escape-html-dup` | muninnWeb — components | duplication | escapeHtml(&/</> 치환) 헬퍼가 3개 파일에 각자 정의 |
| `phase-map-dup` | muninnWeb — components | duplication | HuginnIssue phase 매핑이 incidents.tsx(PHASE_MAP)와 copilot-tool-cards.tsx(PHASE_TO_STATUS)에 분리 중복 |
| `unused-react-aliases` | muninnWeb — components | dead-code | 사용되지 않는 React 훅 별칭/import (useMemo, useRef, useCallback) |
| `duplicate-raven-comment` | muninnWeb — components | duplication | common.tsx 의 Raven Logos 헤더 주석 블록이 통째로 두 번 반복 |
| `parse-json-body-boilerplate` | muninnWeb — API routes | duplication | JSON body 파싱 + invalid-body 에러의 try/catch 보일러플레이트가 7곳 반복 |
| `runvm-to-console-row-dup` | muninnWeb — API routes | duplication | RunVM→콘솔 Run row 매핑(duration/started 합성)이 두 라우트에 그대로 복제 |
| `self-dockerfile-redundant-copy` | 빌드/CI/설정 | dead-code | huginnSelfRuntime Dockerfile: `COPY go.mod ./` 가 직후 `COPY . .` 으로 무효화 (레이어 캐시 이득 0) |
| `self-runtime-no-dockerignore` | 빌드/CI/설정 | structure | huginnSelfRuntime 에 .dockerignore 부재 → 빌드 컨텍스트에 examples/ 등 불필요 파일 유입 |

### 구현 범위 정밀화 (표 제목이 실제 변경보다 넓게 읽힐 수 있는 항목)

- **`http-client-three-places`**: 세 http.Client 를 *일원화*한 게 아니다. **LLM 게이트웨이 호출(`buildLLM`)에만** 타임아웃을 도입했다(`io.ReadAll` 무한 hang 방지, 기본 600s, `MUNINN_LLM_HTTP_TIMEOUT_SEC` 로 조정 가능). SPI 클라이언트의 zero-Timeout 은 per-attempt `context.WithTimeout` 으로 이미 방어되는 의도된 설계라 **건드리지 않았다**.
- **`phase-map-dup`**: 클라이언트 사본 2개(`incidents.tsx`/`copilot-tool-cards.tsx`)를 `common.tsx` 의 단일 소스로 통합했다. **서버 전용 사본(`lib/incidents.ts`)은 server/client 경계상 의도적으로 잔존**한다(두 사본 drift 가드 테스트는 후속 백로그).
- **queued 라벨 정규화 (의도된 user-visible 변경)**: `runStatusLabel` 통합 과정에서 `queued` 상태 Run 의 표시 라벨이 일부 화면의 "대기" → 콘솔 표준값 **"대기 중"** 으로 통일됐다. running/awaiting/succeeded/failed/cancelled 라벨은 전부 보존. phase 배지(`PHASE_LABEL`)는 불변.

### 라운드 1 셀프리뷰 반영 (추가 정리)

PR 머지 전 다차원 적대 리뷰(blocker/major 0건)에서 나온 minor/nit 을 함께 반영했다:

- `strutil.Truncate` 에 `n <= 0` 가드 추가(음수 cap 슬라이스 패닉 방지) + 음수 케이스 테스트. 현 호출부는 양수 상수라 도달 불가이나 신규 export 유틸의 latent 패닉 제거.
- 데드 export 완결 정리: `Sparkline`(이 PR 이 유일 소비자 `HmSpark` 를 지워 데드가 됨) + 기존부터 미사용이던 `Progress`(ui.tsx)·`fmtMoneyK`·`HmAnnounce`(common.tsx) 제거. eslint warnings 22→21(Sparkline 의 `Math.random` purity 경고 해소).

## 후속 백로그 (50건)

아래는 가치는 있으나 (a) god-module/긴함수 분할처럼 churn·회귀위험이 큰 구조 작업, (b) 설계 결정이 필요한 항목(needs-discussion / 규약 충돌), (c) CI 변경처럼 로컬 검증이 어려운 것이라 이번 PR 에서 제외했다. 각 항목은 별도 PR 로 다루기를 권한다.


### huginnOperator — 컨트롤러

- **`agent-patchstatus-no-optimistic-lock`** [S/low/medium] — HuginnAgentReconciler 만 status patch 에 optimistic lock 미적용 — 패턴 비일관
  - 문제: 세 컨트롤러가 의도적으로 채택한 '신선한 캐시 재판정' 패턴을 agent 만 따르지 않는다. agent status 는 다른 writer 충돌 가능성이 낮아 실질 영향은 작지만, 패턴 비일관 자체가 독자에게 '여긴 왜 다르지' 혼란을 주고, 향후 webhookUrl/activeIssues 외 필드가 다중 writer 가 되면 잠재 race 가 된다. 또 conflict 시 노이즈 에러 로그가 난다.
  - 제안: 세 patchStatus 헬퍼를 제네릭/공통 함수로 추출하거나(예: client.Object + status patch 공통 래퍼), 최소한 agent 도 동일하게 MergeFromWithOptimisticLock + IsConflict→Requeue 로 맞춰 패턴을 통일한다. 셋이 거의 동일한 코드이므로 공통화하면 중복도 함께 해소된다.
- **`run-reconcile-too-long`** [M/low/medium] — HuginnRunReconciler.Reconcile 이 너무 길고 Job-ensure 분기가 깊게 중첩됨
  - 문제: 한 함수가 취소/회계초기화/Job생애/상태매핑을 모두 책임져 인지 부하가 크다. JobLost(소실) 처리 같은 자기완결적 로직이 본문 흐름 안에 펼쳐져 있어 핵심 happy-path(생성→매핑)가 잘 안 보인다.
  - 제안: issue 컨트롤러가 handleFirstRun/failMissingImage 로 분리한 것과 동일하게, Job 보장 분기를 `ensureJob(ctx, base, run) (ctrl.Result, error, handled bool)` 로 추출하고, JobLost 종결 블록(136-155)을 `failJobLost(run)` 헬퍼로 빼낸다. caps 복사(97-119)도 `inheritCaps` 로 추출하면 Reconcile 본문이 단계 호출 나열로 평탄해진다.
- **`issue-reconcile-failed-branch-deep`** [M/low/medium] — HuginnIssueReconciler.Reconcile 의 RunFailed 재시도 분기가 깊은 중첩 + 인라인 패치
  - 문제: 재시도 의사결정(maxRuns/backoff/다음 attempt 생성)이 거대한 switch case 안에 인라인돼, 집계 switch 의 다른 case 들과 추상화 수준이 안 맞고 backoff early-return 이 흐름을 끊는다. handleFirstRun 만 추출되고 retry 경로는 본문에 남아 비대칭이다.
  - 제안: RunFailed 케이스를 `handleRetry(ctx, base, issue, runs, latest, maxRuns) (ctrl.Result, error)` 로 추출해 handleFirstRun 과 대칭으로 만든다. 그러면 집계 switch 는 phase 결정만 남고, backoff/createRun/MaxRunsExhausted 의 조기 return 들이 한 헬퍼 안에 응집된다.
- **`expand-pod-spec-monolith`** [M/low/medium] — expandPodSpec 이 컨테이너·볼륨·initContainer·securityContext 를 한 함수에 직조 — 길고 다관심사
  - 문제: 한 함수가 너무 많은 고정 정책(하드닝/마운트/init/grace)을 직조해 길이가 길고, PVC 분기 안에 또 subPath 분기가 중첩된다. 단위 테스트도 거대 PodSpec 전체를 비교해야 한다.
  - 제안: `buildAgentContainer(jt)`, `buildAgentVolumeMounts(jt) (mounts, volumes, initContainers)`, `agentPodSecurityContext()` 로 분해하고 expandPodSpec 은 이들을 조립만 하게 한다. initContainer 생성은 `subPathInitContainer(jt)` 로 빼면 PVC/subPath 중첩이 평탄해지고 각 조각을 개별 테스트할 수 있다.

### huginnOperator — API 타입

- **`v1-is-storage-not-dead-code`** [M/medium/high] ⚠️**설계결정필요** — api/v1 은 데드 코드가 아니라 의도된 storage 버전 — 단 프로젝트 컨벤션(v1beta1 canonical)과 정면 충돌
  - 문제: 리뷰 전제(및 CLAUDE.md)는 'api/v1=데드 코드, v1beta1=canonical' 이지만, 실제 코드/CRD/문서는 'v1=storage(canonical 지향), v1beta1=deprecated'. 즉 api/v1 은 데드 코드가 아니다. 그러나 모든 실 사용처(muninnWeb lib/k8s.ts VERSION='v1beta1', config/samples/v1beta1_*.yaml, 모든 docs/design/examples/*.yaml, huginnAgentRuntime/huginnSelfRuntime examples, 컨트롤러·webhook 타입)는 여전히 deprecated 인 v1beta1 을 쓴다. 결과적으로 '권위 있는 storage 버전(v1)을 아무도 안 쓰고, deprecated 버전(v1beta1)을 전원이 쓴다'는 모순 상태. CLAUDE.md 와 operator/docs/crd-versioning.md 가 서로 다른 정식 버전을 주장하므로 신규 기여자가 어느 버전에 필드를 추가할지 혼란.
  - 제안: 두 문서의 정식 버전 정의를 단일화하라. 프로토타입(하위호환 불필요)이라는 점을 살려 가장 단순한 선택지는 '아직 운영 데이터가 없으니 v1 storage 도입을 롤백하고 v1beta1 단일 버전으로 되돌리는 것'(api/v1 패키지·PROJECT v1 엔트리·main.go:54 제거, deprecatedversion 마커 제거). 운영 클러스터에 v1beta1 객체가 이미 있어 v1 migration 을 진짜로 진행할 거면 반대로 CLAUDE.md/리뷰 컨벤션을 'v1=canonical' 로 고치고 docs/crd-versioning.md 후속작업 #2(클라이언트 v1 전환)를 완료하라. 어느 쪽이든 '두 문서가 반대로 말하는' 상태를 없애는 게 핵심.
- **`v1-v1beta1-handwritten-type-duplication`** [M/medium/high] — api/v1 과 api/v1beta1 타입 파일이 2줄(마커) 빼고 완전 동일 — 수기 복제본 이중 유지보수
  - 문제: controller-gen 은 zz_generated.deepcopy 만 재생성하고 huginn*_types.go(수기 타입)는 재생성하지 않는다. 따라서 필드를 하나 추가/수정할 때마다 api/v1 과 api/v1beta1 두 파일을 손으로 lockstep 동기화해야 한다. 누락 시 두 버전 스키마가 divergent 해지는데, divergent 순간 docs/crd-versioning.md:92-93 가 경고한 대로 conversion=None 전제가 깨져 조용히 깨진 CRD(또는 데이터 손상)가 된다. 770여 줄을 손으로 미러링하는 것은 전형적 복제 유지보수 함정이고, 프로토타입 단계에서 부담만 크고 이득(v1 storage)을 아무도 안 쓴다.
  - 제안: v1-is-storage-not-dead-code 의 결정과 연동. v1beta1 단일 버전으로 롤백하면 복제 자체가 사라진다(최선). v1 migration 을 유지해야 한다면, 적어도 '두 버전 타입 파일이 byte-동일(마커 제외)임' 을 CI 에서 강제하는 가드 테스트/스크립트(diff 기반)를 추가해 수기 drift 를 회귀로 막아라 — docs 의 '동일 스키마' 전제를 자동 검증.
- **`v1-admission-path-untested`** [M/low/medium] ⚠️**설계결정필요** — v1(storage) 직행 admission 경로에 대한 테스트가 0개 — 문서가 스스로 인정한 회귀 공백
  - 문제: webhook 이 v1 admission 을 처리한다고 선언했지만(workspaceId==namespace 강제 우회 방지가 목적, :62), 그 경로를 검증하는 테스트가 하나도 없다. v1 직행 write 가 실제로 defaulting/validation 을 거치는지 회귀로 보장되지 않으므로, 'v1 우회 차단' 이라는 보안성 의도가 실제로 동작하는지 미검증 상태. 동시에 현재 어떤 클라이언트도 v1 으로 write 하지 않으므로(데드 사용처), 이 분기 전체가 '테스트도 없고 사용처도 없는' 코드.
  - 제안: v1 을 유지한다면 webhook_suite_test 에 v1 apiVersion 으로 HuginnAgent 를 CREATE 해 defaulting(muninn.io/workspace 라벨)과 workspaceId!=namespace 거부가 적용되는지 확인하는 envtest 1개를 추가. v1 을 롤백한다면 webhook 마커의 `versions=v1;v1beta1` 을 `versions=v1beta1` 로 되돌려 분기 자체를 제거.
- **`validateupdate-lossy-error-unwrap`** [S/low/medium] — ValidateUpdate 가 validateAgent 의 StatusError 를 수동 언랩해 field.ErrorList 재조립 — 불필요·손실적 왕복
  - 문제: ErrorList → StatusError → ErrorList → StatusError 의 왕복이 군더더기이고, 그 과정에서 field.Required 같은 원래 에러 타입이 손실(전부 Invalid 로 강등)된다. ValidateCreate(:90-92)는 validateAgent 의 StatusError 를 그대로 반환해 일관성도 없다(같은 검증인데 Create 와 Update 가 에러 형태/타입이 달라짐). 깊은 타입 단언(`err.(*apierrors.StatusError)` + nil 체크 + Causes 루프)이 webhook 의 가장 읽기 어려운 부분.
  - 제안: validateAgent 의 시그니처를 `func validateAgent(obj) field.ErrorList` 로 바꿔 ErrorList 를 직접 반환하게 하라. 그러면 ValidateCreate 는 `errs := validateAgent(obj); if len(errs)>0 { return nil, apierrors.NewInvalid(agentGK(), obj.Name, errs) }`, ValidateUpdate 는 workspaceId immutable 에러를 같은 errs 에 append 후 동일 패턴으로 한 번만 NewInvalid — 언랩 루프(:101-105) 전체 삭제, 에러 타입 보존, Create/Update 일관.
- **`operator-dead-bindings-field`** [M/medium/medium] ⚠️**설계결정필요** — spec.bindings / status.inheritedBindings 는 operator 가 읽지도 쓰지도 않는 필드(타입+deepcopy 에만 존재)
  - 문제: Bindings 트리(~30줄 타입 + DeploymentBindings/ObservabilityBindings/RegistryBindings/ToolBinding/MetricsBinding 하위 타입들)는 'Platform Tool(MCP) 집합' 을 표현한다고 주석(:150)에 적혀 있지만 operator 의 어떤 reconcile 로직(buildJobTemplate/expandPodSpec/effectiveRuntime 등)도 이를 PodSpec/env/job 으로 전혀 반영하지 않는다. web 이 inheritedBindings 스냅샷만 떠 놓을 뿐 실제 에이전트 실행에 주입되는 경로가 없어 'declared but never actuated' 데드필드. status.inheritedBindings 도 operator 가 채우지 않으므로(web 이 채움) HuginnRunStatus 3-writer 소유권 모델 밖의 회색지대.
  - 제안: 두 갈래로 결정하라. (a) bindings 를 실제 기능으로 살릴 계획이면 buildJobTemplate 에서 bindings→MCP 서버 env/config 주입 경로를 구현해 데드 상태를 해소. (b) 당분간 MCP 바인딩을 안 쓸 거면(프로토타입, 하위호환 불필요) Bindings 전체 타입 트리와 Spec.Bindings(:245)·InheritedBindings(huginnissue_types.go:111) 및 muninnWeb 의 스냅샷 코드(incidents.ts:478)를 제거. 어중간하게 'web 만 스냅샷, operator 는 무시' 인 현 상태는 유지 비용만 발생.
- **`claudemd-stale-runtime-deadfield-note`** [S/low/medium] — CLAUDE.md 의 'AgentSpec.Runtime 데드필드' 메모는 stale — PR #68 이후 활발히 사용됨
  - 문제: 이건 코드 결함이 아니라 문서/리뷰 가이드의 stale 항목 보고다. AgentSpec.Runtime 은 pluggable runtime 의 핵심 selector 로 광범위하게 사용 중이므로 '데드필드' 가 아니다. CLAUDE.md 규약 문단('operator 가 안 읽는 ... AgentSpec.Runtime')이 PR #68 을 반영하지 못해 오래됐고, 이를 그대로 믿고 제거 리팩토링을 제안하면 런타임 선택 기능을 깨뜨리는 실수로 이어질 수 있다.
  - 제안: CLAUDE.md 규약 문단에서 'AgentSpec.Runtime' 을 데드필드 예시에서 삭제하라(spec.bindings·mock 자격 폼만 데드 예시로 유지). 코드 변경 아님 — 문서 정합성만 수정.

### huginnAgentRuntime (Python)

- **`run-live-god-function`** [L/medium/high] — run_live() 는 319줄 단일 함수에 5개 책임 + 4개 중첩 클로저가 뭉친 복잡도 핫스팟
  - 문제: 단일 함수가 인증/옵션 구성, 시그널 처리, 메모리 recall, SDK 루프 구동, status 보고, HITL 게이트, 취소/예외 종료 경로를 모두 소유해 한눈에 흐름을 파악하기 어렵다. 중첩 클로저가 nonlocal(final_sent, cost, tokens, step, last_text, session_id)에 의존해 상태 흐름이 암묵적이고, 한 경로(예: 취소 보고)를 단위 테스트하려면 함수 전체를 구동해야 한다. test_runner.py 가 send_final/gate_approval 을 직접 테스트하지 못하고 build_report_patch 같은 이미 추출된 순수 함수만 검증하는 것이 그 방증이다.
  - 제안: 상태를 담는 작은 dataclass(RunState: cost/tokens/step/last_text/session_id/final_sent)를 도입하고, 클로저를 모듈/클래스 레벨 함수로 끌어올린다: (1) build_run_options(goal, guardrails) — 657-676 옵션/resume/model 구성, (2) install_sigterm_handler() — 682-688, (3) Reporter 클래스(또는 함수군)로 report_async/report_async_deadline/send_final 묶기, (4) handle_cancellation(state, ...) — 875-925 취소 경로 추출(거절 선점 재조회 포함), (5) gate_approval 은 이미 거의 독립적이므로 인자로 goal/pr_mode 만 받게 해 최상위로. run_live 는 이 조립을 호출하는 ~80줄 오케스트레이터로 축소.
- **`outcome-title-line-triplication`** [S/low/medium] — outcome/title_line 파생 로직이 3곳에 중복되고 한 곳은 사실상 데드
  - 문제: 동일 비즈니스 규칙(첫 비공백 라인 추출, 80자 캡, dry-run 접두)이 세 곳에 흩어져 있어 한 곳만 고치면 보고된 outcome 과 stdout 의 outcome 이 갈라진다(drift). 945-948 의 재계산은 send_final 이 만든 outcome 을 노출하지 못해 발생한 우회로 — send_final 이 계산값을 nonlocal/반환으로 외부에 넘기면 통째로 제거 가능한 준-데드 코드다.
  - 제안: 순수 헬퍼 `derive_outcome(output: str, pr_mode: str) -> str` (title_line 추출 + dry-run 접두 + 80자 캡)를 추출해 build_report_patch 처럼 단위 테스트 대상으로 만든다. send_final 이 계산한 outcome 을 nonlocal 변수나 반환값으로 노출해 945-948 의 재계산 블록을 삭제하고 그 값을 stdout/로그에 재사용한다.
- **`report-async-wrapper-dup`** [S/low/medium] — report_async / report_async_deadline 는 optional 인자 하나 차이뿐인 중복 thread 래퍼
  - 문제: _report 가 이미 deadline 을 optional 인자로 받는데(169) 래퍼를 둘로 쪼개고 호출부에서 삼항으로 다시 분기해 불필요한 표면적과 분기를 만든다. 두 래퍼와 삼항을 합치면 코드와 인지부하가 모두 준다.
  - 제안: 단일 `report_async(patch, deadline=None)` 로 통합: `return await asyncio.to_thread(_report, patch, deadline)`. send_final 의 769-770 삼항을 `await report_async(patch, report_deadline)` 한 줄로 대체.
- **`approval-parsing-dup`** [S/low/medium] — _parse_approval_state 와 _approval_detail 가 동일한 flat/nested 방어 파싱을 각자 재구현
  - 문제: approval 객체의 위치 탐색(평탄 RunVM vs 중첩 CR-유사)이 두 함수에 복붙돼 있어 API 응답 형태가 또 하나 추가되면 두 곳을 동기화해야 한다. 한 곳만 고치면 state 판정과 detail 표면화가 서로 다른 형태를 읽는 미묘한 버그가 생긴다.
  - 제안: `_extract_approval_obj(run_obj) -> dict | str | None` 헬퍼로 위치 탐색을 1회 구현하고, _parse_approval_state(str/state 추출)와 _approval_detail(decidedBy/reason 조인)이 그 결과만 후처리하도록 리팩토링. 기존 test_runner.py 의 ParseApprovalStateTest/ApprovalDetailTest 가 회귀 가드 역할.
- **`cancellation-inline-block`** [M/medium/medium] ⚠️**설계결정필요** — CancelledError 핸들러에 50줄 거절-선점 재조회 로직이 인라인
  - 문제: 취소 경로의 핵심 로직(운영자 거절이 SIGTERM 으로 폴링을 선점했을 때 failed=True 오기록을 막는 보정)이 except 블록 안에 묻혀 있어 단위 테스트가 불가능하고, run_live 본문 가독성을 크게 떨어뜨린다. 이 보정은 비즈니스적으로 중요한데(거절≠실패) 테스트 커버가 없다.
  - 제안: `resolve_cancellation(state, deadline) -> (failed, abort_reason, outcome_override, terminal_kind)` 순수(또는 거의 순수) 함수로 분리해 approval.state→terminalKind 결정 규칙을 단위 테스트 대상으로 만들고, except 블록은 GET 조회 + 이 함수 호출 + shield(send_final) 만 남긴다.
- **`selftest-tool-list-dup`** [S/low/low] — preflight 도구 목록이 claude_skill.sh 와 runner.py selftest 에 따로 하드코딩
  - 문제: 운영 도구 계약(이미지에 있어야 할 CLI 집합)이 두 언어/두 파일에 중복돼 한쪽만 갱신하면 preflight 와 selftest 판정이 갈린다 — 실제로 curl 항목에서 이미 drift 발생. 어느 것이 권위인지 불명확.
  - 제안: 도구 목록을 단일 소스로 둔다. 가장 단순한 방법: bash preflight 를 진단 로그용 best-effort 로 명시(이미 그러함)하고 권위 검증은 runner.selftest 한 곳으로 일원화하거나, 공유 파일(예: tools.txt 또는 runner 가 노출하는 `--list-tools`)을 두 곳이 함께 읽게 한다. 최소 조치로 두 목록을 즉시 일치시키고 출처 주석을 단다.

### huginnSelfRuntime (Go)

- **`approval-timeout-default-drift`** [S/low/medium] ⚠️**설계결정필요** — MUNINN_APPROVAL_TIMEOUT 미주입 시 기본값이 Python(5400) 과 Go(5700) 로 갈린다
  - 문제: 두 백엔드가 '같은 SPI/HITL 계약을 만족해야 한다'(loop.go:4, report_test.go 의 cross-backend conformance 의도)는데, operator 가 MUNINN_APPROVAL_TIMEOUT 을 주입하지 않는 환경에서 huginn-self 는 95m, Python 은 90m 폴링한다. Python 주석은 90m 이 web TTL 기본과 의도적으로 맞춘 값이라고 명시 — Go 의 5700 은 근거 주석 없이 5m 더 큰 임의값이라 백엔드 교체 시 HITL 만료 타이밍이 미묘하게 달라진다.
  - 제안: 기본값을 5400 으로 일치시키거나(권장 — Python 의 web-TTL 정렬 근거가 명시적), 두 런타임이 공유하는 단일 상수 출처(설계 §10-2)를 정해 양쪽 주석에서 그 출처를 인용. 어느 쪽이든 두 기본값이 같아야 cross-backend 계약이 성립한다.
- **`guardrail-parsefail-default-drift`** [S/low/medium] — MUNINN_GUARDRAILS 파싱 실패 시 fallback 한도가 Python 보수값과 Go 관대값으로 갈린다
  - 문제: 동일한 깨진 guardrails env 가 들어왔을 때 Python 은 6턴/2달러로 죄고 Go 는 12턴/무제한으로 푼다 — 안전 시맨틱이 정반대다. 같은 입력에 대해 백엔드별로 위험 노출이 달라지며, Python 측이 명시적으로 '폭주 방지'라 부른 보호를 Go 가 안 한다(huginn-self 는 max_budget 을 아예 집행도 안 하므로 더 위험).
  - 제안: Go parseGuardrails 도 파싱 실패 시 보수 기본(maxTurns=6, maxBudget=2 등 Python 과 동일값)으로 강등하도록 맞춘다. 두 fallback 정책을 설계 문서의 한 곳에 정의하고 양쪽이 인용. (budget 미집행이 해소되기 전까지는 최소한 maxTurns 만이라도 보수값으로.)
- **`cost-always-zero`** [M/low/medium] — cost(r.cost)는 영원히 0 — 보고·stdout·outcome 모두 0.0000 으로 박제된 죽은 경로
  - 문제: cost 필드를 채우는 척하는 코드 경로(3곳의 %.4f 포맷·집계 변수)가 실제로는 항상 0 을 흘려보내, 독자에게 '비용 추적이 동작한다'는 잘못된 인상을 준다. MaxBudgetUSD(loop.go:28, main.go:115 에서 env→Config 까지 전파)도 read-only 데드필드로, 한도를 설정해도 무시된다(집행 코드 없음). PoC 라는 주석은 있으나 필드/포맷/전파가 살아있어 죽은 배선이 남아있다.
  - 제안: 둘 중 하나로 정리: (a) cost 추적/budget 집행을 실제 구현(llm Usage→단가 추정으로 r.cost 누적, MaxTurns 처럼 MaxBudgetUSD 체크) — 후속 작업이면 TODO 명시; (b) 구현 전까지는 cost/MaxBudgetUSD 전파를 제거하거나 한 곳에서만 0 으로 박고 나머지 %.4f 분기를 지워, '추적되는 것처럼 보이는' 죽은 경로를 없앤다. CLAUDE.md '데드필드는 개편 우선' 규약에 부합.
- **`selftest-final-report-probe`** [S/low/low] ⚠️**설계결정필요** — selftest 가 final:true terminal patch 를 더미 endpoint 로 쏴 코드경로를 태움 — 의도는 맞으나 final 의미가 오해 소지
  - 문제: selftest 의 report_wiring 체크가 final:true 를 보내면 Report 가 retries=4 경로를 타, 300ms deadline 안에서 127.0.0.1:1(닫힌 포트) 대상으로 backoff 재시도를 돌린다. deadline 으로 캡되긴 하나, '배선만 태운다'는 목적엔 진행보고(final 없음, retries=1)가 더 빠르고 적합하다. final:true 라벨은 또한 골든/계약상 terminal 의미를 띠어 selftest 의도와 의미가 어긋난다(Python selftest 는 runner.py:603 에서 retries=0 으로 명시 제한).
  - 제안: selftest probe 를 retries 적은 진행보고로 바꾸거나(final 제거), Python selftest 처럼 retries=0 을 강제하는 경로로 호출해 빠르게 끝낸다. Report 시그니처에 retries 오버라이드가 없으므로, 더미는 httpJSON 을 직접 retries=0 으로 부르거나 진행 patch 를 쓰는 편이 일관적.
- **`approval-state-string-literals`** [M/low/medium] — approval state / terminalKind / pr-mode 문자열 리터럴이 두 런타임에 손으로 미러됨 — drift 무방비
  - 문제: conformance 골든은 report/recall *payload* drift 만 막고(report_test.go), approval state·terminalKind·pr-mode 같은 enum 문자열은 골든 밖이라 Go/Python 간 또 Go 내부 여러 파일 간 손수 동기화에 의존한다. 한쪽에서 오타나 값 추가가 나도 컴파일/테스트가 안 잡는다(terminalKind 화이트리스트가 report.go 와 loop.go 양쪽에 중복된 게 대표 사례).
  - 제안: terminalKind/approval-state/pr-mode 를 Go 측에서 named const(또는 작은 enum 패키지)로 한 번만 정의하고 loop.go·report.go·client.go 가 참조. 가능하면 이 enum 값들도 conformance 골든이나 별도 shared fixture 로 Python 과 묶어 cross-language drift 까지 닫는다(현재 report payload 만 묶임).

### muninnWeb — lib

- **`data-live-recent-runs-overlap`** [S/low/medium] ⚠️**설계결정필요** — data.ts 의 LIVE_RUNS 가 RECENT_RUNS 의 부분집합 — 항상 [...LIVE_RUNS, ...RECENT_RUNS] dedup 으로 합쳐 사용
  - 문제: 같은 run id 에 두 개의 약간 다른 정의가 존재해, 어느 값이 콘솔에 보일지는 'LIVE 가 먼저 들어가 이긴다'는 암묵적 순서에 의존한다(우발적 결합). 모든 소비처가 두 배열을 합쳐 dedup 하므로 두 배열로 나눈 구분이 실질 의미가 없고, 분할 자체가 헷갈리는 추상화다.
  - 제안: 단일 ALL_RUNS 배열로 통합하고, '라이브' 여부가 필요하면 status(running/queued/awaiting) 로 파생하라. 두 배열 유지가 데모 화면 구분 목적이면 LIVE_RUNS 를 RECENT_RUNS 에서 status 필터로 derive 해 중복 정의 자체를 제거.
- **`runsbyissue-get-or-set-idiom`** [S/low/low] ⚠️**설계결정필요** — runsByIssue Map 의 get-or-set 한 줄 표현식이 불필요하게 난해
  - 문제: `.set(...).get(key)!` 는 정확하지만 읽는 사람이 'set 이 배열을 돌려주나?' 를 멈춰 생각하게 만든다. non-null assertion(!) 도 함께 써 가독성이 낮다. 같은 파일의 다른 누적 로직과 스타일도 불일치.
  - 제안: 표준 idiom 으로 풀어 쓴다: `let arr = runsByIssue.get(key); if (!arr) { arr = []; runsByIssue.set(key, arr); } arr.push(r);` 또는 헬퍼 `pushToMap(map, key, r)`.
- **`incidents-688-lines-mixed-responsibilities`** [M/low/medium] — incidents.ts(688줄)가 VM 매핑·조회·위임·승인·dedup·정규화 헬퍼를 한 파일에 모두 담음
  - 문제: 헤더 주석 스스로 '한곳에 모은다'고 적었지만 7개 책임이 한 모듈에 응집해, 어떤 라우트가 어떤 그룹을 쓰는지 import 표면이 넓고 테스트/탐색이 어렵다. 순수 변환(phaseToStatus/runView/VM 타입)과 부수효과 있는 CR 쓰기(delegate/approve/reject)가 섞여 있다.
  - 제안: 최소한 (a) 순수 매핑/VM 타입(run-view.ts), (b) 조회(incident-query.ts), (c) 상태변경 위임/승인/dedup(incident-commands.ts) 3분할. a2a/task-mapper.ts 가 이미 RunVM 만 import 하므로 VM 타입 분리는 결합도도 낮춘다.
- **`scope-where-vs-scope-sql-dual`** [M/medium/medium] ⚠️**설계결정필요** — db.ts 가 동일 필터 로직을 Drizzle 빌더(scopeWhere)와 raw SQL(scopeSql) 두 버전으로 병행 유지
  - 문제: 멀티테넌시 격리(workspace 강제)라는 보안상 중요한 조건이 두 곳에 복제돼, 한쪽만 수정되면 격리 누수/표류 위험이 있다(예: 새 격리 컬럼 추가 시 한쪽 누락). 두 함수는 같은 의미를 다른 문법으로 표현하는 본질적 중복.
  - 제안: raw SQL 경로는 id 회수 전용이므로 scopeSql 을 제거하고, recall 의 랭킹 쿼리도 workspace/scope/appId 를 sql 파라미터로 인라인하되 단일 헬퍼가 '필수 컬럼 목록'을 한 곳에서 정의하게 하라. 또는 두 함수 위에 격리 단위 테스트(workspace 누락 시 실패)를 두어 표류를 막는다.
- **`approval-reason-three-shapes`** [S/medium/medium] — approval 거절 사유를 reason/reasons[].detail 3중 형태로 동시 기록·역추적 — 과도기 호환 누적
  - 문제: 동일 의미(거절 사유)가 spec 상 두 필드(reason scalar vs reasons[].detail)로 이중 기록되고 읽기도 fallback 체인으로 흡수한다. CLAUDE.md 의 '하위호환은 필수 아님, 데드필드는 제거 우선' 규약상, operator 측 계약이 어느 하나로 확정되면 한쪽은 제거 대상. 현재는 어느 게 source-of-truth 인지 코드만 봐선 불명확.
  - 제안: operator-design 의 ApprovalStatus 확정 형태(reasons[{type,detail}] 권장 — buildApprovalRequest 와 일치)로 일원화하고 scalar reason 기록/읽기를 제거. 확정 전까지면 주석에 '확정 후 reason 제거' TODO 와 이슈 링크를 명시해 데드필드화를 추적.
- **`k8s-disabled-vs-call-fail-double-fallback`** [M/low/medium] — k8sEnabled() false 분기 + try/catch mock 폴백이 조회 함수마다 중복된 이중 폴백 구조
  - 문제: 동일한 'k8s 비활성 → mock / k8s 활성이나 호출실패 → mock' 폴백 정책이 함수마다 손으로 복제돼, 폴백 로그 문구·동작이 미묘하게 갈리고(getIssueRuns 는 catch 에서 null 반환으로 정책이 또 다름) 신규 조회 함수가 폴백을 빠뜨리기 쉽다.
  - 제안: `withMockFallback(realFn, mockFn, label)` 같은 고차 헬퍼로 '비활성/실패 → mock' 정책을 한 곳에 모은다. getIssueRuns 의 null 정책과의 차이도 이 헬퍼 시그니처로 명시적으로 구분.
- **`auth-requireauth-flag-complexity`** [L/medium/medium] ⚠️**설계결정필요** — requireAuth 가 3 boolean opts × OIDC/static/console/operator 경로 조합으로 분기 폭증
  - 문제: 각 분기의 상호배제·우선순위가 미묘하고(특히 operatorGroupEnforced 가드를 콘솔우회 '진입 전'에 둬야 하는 CRITICAL 회귀가 주석으로 경고됨), 함수 하나가 인증(authn)과 인가(authz)와 콘솔완화 정책을 모두 책임진다. 회귀 위험이 높은 곳인데 단일 함수라 단위 테스트 매트릭스도 크다.
  - 제안: 결정 단계를 작은 술어로 분해: `authenticate(req): {kind:'oidc'|'static'|'console'|'dev'|'none', payload?}` 로 '누구인가'만 판정하고, requireAuth 는 그 결과 + opts 로 '허용/거부'만 결정하는 얇은 정책 함수로 재구성. authn/authz 분리로 분기와 테스트 표면을 줄인다.
- **`eventfingerprint-dead-fallback-in-webhook`** [M/medium/medium] — eventFingerprint 의 `||` 폴백이 webhook 경로에서는 항상 사장 + fingerprint 가 두 번 계산됨
  - 문제: webhook 경로에서 eventFingerprint 의 의도된 '없으면 goal 에서 파생' 분기가 실질 죽은 코드이고, route 측 slug 와 incidents 측 slug 가 서로 다른 정규식(route.ts:37 `[^a-z0-9]+`→`-` (트림 없음) vs incidents.ts:406 slug 는 트림+40자 절단)이라 두 slug 가 미묘히 다를 수 있다. fingerprint 계산이 두 모듈에 분산돼 라벨 매칭 표류 위험.
  - 제안: fingerprint 생성 책임을 incidents.ts(delegateIncident 내부 eventFingerprint)로 단일화하고, hooks route 는 rawFingerprint 를 만들어 넘기지 말고 `fingerprint` 만(또는 아무것도) 전달해 한 번만 계산하게 한다. dedup 라벨이 필요하면 delegateIncident 가 계산한 fingerprint 를 결과로 반환해 route 가 재계산 없이 재사용.
- **`max-step-default-12-magic-scattered`** [S/low/low] ⚠️**설계결정필요** — max step 기본값 12 / maxCost 5 등 가드레일 기본값이 매직 넘버로 여러 곳에 흩어짐
  - 문제: 기본 iteration cap(12)·cost cap(5)이 상수화되지 않고 리터럴로 반복돼, 기본값 변경 시 누락 위험과 'mock 12 vs 실 default 12 가 같은 의도인가?' 불명확. CLAUDE.md 의 maxIterations→max_turns 계약과 연결되는 값이라 한 곳에서 관리할 가치가 있다.
  - 제안: `const DEFAULT_MAX_ITERATIONS = 12; const DEFAULT_MAX_COST_USD = 5;` 를 export 상수로 두고 runView/delegateIncident/mock 이 참조하게 한다.

### muninnWeb — components

- **`pages-god-module`** [L/medium/high] — pages.tsx 는 4개 라우트 트리 + 14개 컴포넌트를 담은 god 모듈 (1167줄)
  - 문제: 단일 파일이 서로 독립적인 4개의 라우트 화면을 모두 담아 1167줄이 됐다. 한 화면을 고치려면 무관한 코드를 스크롤해야 하고, import 표면이 비대하며, 변경 충돌·리뷰 비용이 크다. 도메인 경계(앱/메모리/플랫폼도구)가 파일 구조에 전혀 반영돼 있지 않다.
  - 제안: 도메인별로 파일 분리: app-detail.tsx(HmAppDetail + AgentSettingsTab + Overview/Events/Bindings/AppMemoriesTab/MemoryCard), apps-list.tsx(HmAppsList), memories.tsx(HmMemories + MemoryCard 공유), platform-tools.tsx(HmPlatformTools + ToolSection/*Section/ToolSubTabs/PlatformTable). MemoryCard 는 app 탭과 admin 페이지 양쪽이 쓰므로 공용 파일로. 각 파일이 단일 라우트 책임을 갖도록.
- **`manual-fetch-vs-useapi`** [M/medium/high] — useApi 훅이 이미 제공하는 loading/error/no-store fetch 로직을 3곳에서 수기 재구현
  - 문제: 동일한 fetch 보일러플레이트(약 18줄×3)가 반복되고, useApi 의 stale-guard 같은 미묘한 부분을 각자 약간씩 다르게 구현해 버그 표면이 늘어난다. 프로젝트 마이그레이션 계약(컴포넌트는 useApi 로 /api 호출)과도 어긋난다.
  - 제안: 세 곳을 useApi 로 교체. HmMemories 는 `useApi('/api/memories?limit=200')` + `data.items` 매핑. incidents 는 statusFilter 를 url 에 넣어 `useApi(`/api/issues?status=${statusFilter}`)`, 새로고침은 useApi 의 reload() 사용. HmIncidentDetail 의 5초 폴링만 useApi 위에 setInterval(reload, 5000)로 얇게 얹으면 된다.
- **`run-detail-summary-dup`** [M/low/medium] — HmRunDetail 와 RunSummaryDetail 의 헤더/액션 버튼/stats row 가 대부분 중복
  - 문제: run 상세 화면의 헤더/액션을 바꾸면 두 컴포넌트를 동기화해야 한다. 두 컴포넌트의 존재 이유는 '풀 트랜스크립트 유무'뿐인데 공통 골격까지 복제돼 있다.
  - 제안: `<RunDetailHeader id app meta status onBack/>` 와 `<RunActionButtons status/>` 를 추출해 두 컴포넌트가 공유. 본문(트랜스크립트 vs 요약 Empty)만 분기로 남긴다.
- **`agent-settings-tab-size`** [M/low/medium] — AgentSettingsTab 가 자격(Secret) 폼 전체 로직+렌더를 단일 컴포넌트에 담아 비대 (150줄)
  - 문제: 단일 컴포넌트가 폼 상태관리·파일읽기·PATCH 호출·복잡한 배지 분기 렌더를 모두 떠안아 한눈에 파악이 어렵고, 시크릿 행 렌더 분기가 깊다(L256-262 중첩 삼항 4단).
  - 제안: 시크릿 행을 `<CredentialRow cred onSetDraft onClear onUndo onFile/>` 로 추출(배지 상태는 `credBadge(c)` 헬퍼로). dirty/save 로직은 그대로 두되, 카드 단위(`<RuntimeCard/>`,`<CredentialsCard/>`)로 렌더 분리해 AgentSettingsTab 은 조립만 하게.
- **`tool-renderer-boilerplate`** [M/medium/medium] — useMuninnToolRenderers 의 8개 useRenderTool 이 동일 status 분기 보일러플레이트 반복
  - 문제: 새 tool 추가 시 같은 6줄 분기를 복붙해야 하고, status!=='complete'→Progress, complete→parse 후 렌더라는 규칙이 8번 반복돼 실수(빠뜨림) 여지가 있다.
  - 제안: `makeRenderer(label, (data)=>JSX)` 헬퍼 또는 `[{name,label,Card}]` 테이블을 만들어 map 으로 useRenderTool 을 등록(단, 훅 규칙상 고정 순서 보장 필요 → 정적 배열을 컴포넌트 밖에 두고 순회). router 가 필요한 카드는 클로저로 주입. 보일러플레이트를 1곳으로.
- **`newapp-form-untyped-any`** [M/low/medium] — new-app.tsx 폼이 단일 거대 form 객체 + any 로 검증/바인딩을 인라인 처리
  - 문제: 검증·기본값·자동토글 규칙이 컴포넌트 본문에 인라인으로 섞여 있고 errors:any 라 타입 안전성이 없다. KindCards onChange 는 set('kind') 와 setForm 을 연달아 호출해 kind 를 두 번 쓰는 군더더기(첫 set 은 두 번째 setForm 에 덮여 무의미).
  - 제안: 검증을 `validateNewApp(form): {name?,repo?}` 순수함수로 추출하고, kind 변경+binding 자동토글을 `applyKind(form, kind)` 한 번의 setForm 으로 통합(이중 set 제거). 폼 타입을 인터페이스로 명시해 any 제거.

### muninnWeb — API routes

- **`k8s-db-fallback-pattern`** [M/low/medium] — k8sEnabled/dbEnabled → try → mock-fallback + console.warn 분기 패턴이 4개 GET 라우트에 동형 반복
  - 문제: dual-mode 분기 + try/catch + warn 로깅 + mock 폴백이 라우트마다 손으로 재작성돼 보일러플레이트가 핸들러 본문을 가린다. warn 메시지 포맷·폴백 정책(에러 시 mock 으로 떨어질지)이 라우트별로 일관성 없이 굳을 위험.
  - 제안: `withK8sFallback(routeName, liveFn, mockFn)` / `withDbFallback(...)` 같은 고차 헬퍼를 lib 에 도입(켜져 있으면 liveFn 실행·실패 시 warn 후 mockFn, 꺼져 있으면 mockFn). 각 GET 라우트는 live/mock 두 콜백만 제공. 단 report 처럼 enable 분기가 폴백이 아니라 다른 응답(persisted:false)인 경우는 대상 제외.
- **`a2a-gate-triple-repeat`** [S/low/medium] — a2a 라우트 3곳의 'enabled→disabled / requireAuth→denied' 게이트 서두가 동일 복제
  - 문제: fail-closed 게이트 서두가 3곳에 복제돼, 게이트 정책(예: 새 헤더 검증·로깅 추가)을 바꿀 때 누락 위험이 있다. 보안 게이트라 drift 시 무인증 노출로 직결.
  - 제안: lib/a2a/gate.ts 에 `a2aGate(req, opts?)` 를 추가해 비활성/인증을 한 번에 검사하고 `Response | null` 반환(requireAuth 패턴과 동일). 세 라우트는 `const gate = await a2aGate(req); if (gate) return gate;` 한 줄로 통일.
- **`a2a-mock-agentcard-literal-dup`** [S/low/low] — AppVM→huginnAgentToAgentCard 입력 객체 리터럴이 card/agents 라우트에 중복
  - 문제: AppVM→pseudo-CR 변환 shape 이 두 곳에 박혀, AgentCard 가 참조하는 spec 필드가 늘면 두 곳을 동기화해야 한다. mock/live 카드 생성 경로가 분산돼 일관성 추적이 어렵다.
  - 제안: lib/a2a/card.ts 에 `appVmToAgentCard(a: AppVM, baseUrl)` 헬퍼(내부에서 pseudo-CR 구성 후 huginnAgentToAgentCard 호출)를 추가하고 두 라우트가 이를 호출. live(CR) 경로는 기존 huginnAgentToAgentCard 그대로 유지.
- **`a2a-dispatch-resolve-overlap`** [M/medium/medium] — a2a dispatch 내 task/context 해석 로직이 케이스마다 거의 동일하게 재구현됨
  - 문제: 267줄 단일 파일에서 동일한 'taskId → Run | Issue 해석' 로직이 4가지 변형으로 흩어져, app-scope 강제나 not-found 의미가 케이스별로 미세하게 달라질 위험. resolveRun 헬퍼가 있는데도 대부분 우회해 추상화가 절반만 적용된 상태.
  - 제안: `resolveTaskOrContext(idOrContext, app): { kind: 'run'|'context'|'none', run?: RunVM, scoped?: {runs,phase} }` 형태의 단일 리졸버를 만들어 direct-run/issue-scoped/not-found 를 한 번에 판별하게 하고, 4개 케이스가 이 결과를 분기 소비. strParam 검증도 dispatch 진입 시 공통화. (status 소유권·게이트 로직은 그대로 유지.)
- **`approve-reject-near-identical`** [M/low/medium] — approve/reject 라우트가 거의 동일 — 결과 분기·응답 형태 공유 가능
  - 문제: 두 고위험 결정 라우트의 에러 분기(특히 invalid-state/expired/not-found→conflict 매핑)가 복제돼, 한쪽의 결정 응답 정책을 바꾸면 다른 쪽과 drift 한다. 실패 분기 4종이 글자만 다르게 두 번 적힘.
  - 제안: 공통 `decideRun(req, params, { action: 'approve'|'reject' })` 헬퍼(또는 lib/incidents 에 `runDecisionError(res, runId)` 매퍼)를 추출해 인증·body 파싱·실패→conflict 매핑·mock 응답을 단일화하고, 두 라우트는 approveRun/rejectRun 호출과 라벨만 주입. 3-writer 소유권(API 가 approval 전이 소유)은 그대로 유지되므로 위반 없음.
- **`report-route-too-long`** [M/medium/medium] — report/route.ts POST 핸들러가 단일 함수 135줄 — 책임 과다
  - 문제: 단일 핸들러가 status 매핑·승인 상태머신·DB 동기화·Issue 집계 4가지 부수효과를 직렬로 안고 있어 읽기·테스트가 어렵다. finiteOr 는 매 요청 재정의되고, 이런 검증/매핑 로직은 단위 테스트 대상인데 라우트에 갇혀 있다.
  - 제안: (1) `finiteOr` 와 `collectAgentStatus(body)`(step/cost/tokens/output/sessionId/recalled 수집)를 lib/incidents 로 추출, (2) 승인 전이 판정(terminal 룩업+buildApprovalRequest)을 `maybeApplyApproval(runName, body)` 로, (3) incident DB 동기화 블록을 `syncIncidentFromReport(...)` 로 분리. 핸들러는 오케스트레이션만. 필드 소유권 경계(주석 명시)는 헬퍼 안에 그대로 캡슐화.
- **`any-typed-bodies-pervasive`** [L/medium/medium] — 라우트 전반에 `body: any` / `list: any` / `(x: any)` 남용으로 타입 안전성 상실
  - 문제: 외부 입력(req.json)과 mock 컬렉션을 any 로 다뤄 필드 오타·shape drift 를 컴파일러가 못 잡는다. 입력 검증 로직(report 의 finiteOr/whitelist)이 any 위에서 돌아 검증 누락을 타입이 보강해주지 못한다. 프로토타입이라도 입력 경계 타입은 안전망 가치가 크다.
  - 제안: 각 라우트의 요청 body 에 좁은 입력 인터페이스(예: `ReportBody`, `HookBody`)를 선언하고 `body: unknown` → 검증 후 narrowing, 혹은 zod 등 최소 파서를 parse-json 헬퍼에 통합. mock 컬렉션(MEMORIES/EVENTS)은 lib/data.ts 의 export 타입을 쓰면 `: any` 제거 가능.

### 빌드/CI/설정

- **`image-workflows-triplicated`** [M/low/high] — 3개의 *-image.yml 워크플로우가 거의 완전 중복 (~440줄)
  - 문제: 동일한 CI 파이프라인(amd64 load 빌드 → trivy 스캔 → SARIF/artifact 업로드 → multi-arch publish)이 3벌 복사돼 있다. trivy severity, ignore-unfixed, action SHA 핀, metadata 태그 정책, 권한 분리(publish job 만 packages:write) 같은 정책을 바꾸려면 3곳을 똑같이 고쳐야 하고, 한 곳만 빠뜨리면 컴포넌트 간 보안/배포 정책이 조용히 어긋난다(실제로 agent-runtime 만 selftest 게이트가 있고 나머지는 없는 상태).
  - 제안: 재사용 가능한 워크플로우(`.github/workflows/_image.yml`, `on: workflow_call`)로 추출하고 component/context/dockerfile/image-name 과 optional `selftest`(boolean) 입력을 파라미터화. 세 호출자 워크플로우는 트리거(paths)와 `uses: ./.github/workflows/_image.yml` + inputs 만 남긴다. matrix 대신 reusable-workflow 를 권장하는 이유: paths 필터가 컴포넌트마다 다르므로 트리거는 분리 유지하되 본문만 공유. 유지(현행 복사) vs 개편 비용: 추출은 1회 작업(M), 이후 trivy 게이트화·SHA 핀·publish 정책 변경이 1곳으로 수렴. 프로토타입이라도 3중 복사는 정책 drift 위험이 실재(이미 selftest 비대칭 존재)하므로 개편 권장.
- **`selftest-asymmetry-image-ci`** [S/low/medium] ⚠️**설계결정필요** — image 워크플로우 간 검증 게이트 비대칭 (agent-runtime 만 selftest, operator/web 은 publish 전 기능 검증 없음)
  - 문제: 동일 계열 워크플로우인데 컴포넌트별로 publish 전 게이트 강도가 다르다. operator/web 은 이미지가 실제로 부팅되는지조차 확인하지 않고 main 에서 latest 로 push 한다. 일관성 없는 패턴이며, 위 image-workflows-triplicated 를 reusable 로 합칠 때 `selftest` 입력으로 자연스럽게 정규화할 수 있다.
  - 제안: reusable 워크플로우에 optional `smoke`/`selftest` 입력을 두고, 최소한 operator 는 `--manager --version`(distroless 라 셸 없음 → entrypoint help), web 은 컨테이너 부팅 후 헬스 엔드포인트 curl 같은 가벼운 스모크를 추가하거나, 최소한 "검증 없음"을 의도로 명시. 또는 *-image.yml 에서 기능 검증은 *-ci.yml 에 위임하고 image 워크플로우는 빌드+스캔+publish 만 담당하도록 책임을 문서화해 비대칭을 의도된 설계로 고정.
- **`kind-load-podman-dup`** [M/medium/medium] — podman→kind 이미지 적재(save→image-archive) 로직이 루트와 operator Makefile 에 중복
  - 문제: kind 의 podman/docker 적재 차이와 provider 설정이라는 동일한 환경 우회 로직이 두 Makefile 에 복붙돼 있다. CLAUDE.md 가 "루트 run-kind ≠ operator run-kind"라고 명시할 만큼 둘은 다른 목적이지만, *이미지 적재 메커니즘* 자체는 동일하므로 한쪽 수정 시 다른 쪽 drift 위험. operator 쪽은 `trap ... EXIT` 로 tar 정리, 루트 쪽은 `rm -f` 로 루프 내 정리하는 등 미묘하게 구현이 갈라져 있어 이미 부분 drift 시작됨.
  - 제안: Makefile 은 include 공유가 어렵지만, 최소한 두 구현을 동일 패턴으로 통일(둘 다 trap 기반 또는 둘 다 루프-rm). 더 적극적으로는 공용 셸 헬퍼(`hack/kind-load.sh <cluster> <tool> <img...>`)를 만들어 양쪽 Makefile 이 호출하게 해 단일 소스화. 프로토타입 규약상 "중복 제거" 우선이므로 헬퍼 추출 권장(operator 의 run-kind 는 agent-runtime 1개, 루트는 3개 이미지라 가변 인자 헬퍼가 자연스럽다).
- **`self-runtime-no-make-no-ci`** [M/low/high] — huginnSelfRuntime 가 빌드 시스템에서 고아 — Makefile/CI/이미지 publish/루트 위임 전무
  - 문제: 정식 컴포넌트인데 빌드 어휘(build/image/lint/test/help)와 CI publish 파이프라인에서 완전히 빠져 있어, 다른 4개 컴포넌트가 누리는 일관된 진입점·자동 빌드·trivy 스캔·멀티아치 publish 를 못 받는다. pluggable runtime(claude-code↔huginn-self, 최근 커밋 #68)이 실제 기능인데 그 이미지를 빌드/배포하는 표준 경로가 없어, 사용자는 수동 `podman build` 에 의존하게 된다. 일관성 결여 + 사실상 자동화 데드존.
  - 제안: (1) huginnSelfRuntime/Makefile 추가 — huginnAgentRuntime/Makefile 을 본떠 image/build/lint(hadolint)/test/push/help 어휘 제공(단, selftest 는 Go `go test ./...` 또는 `huginn-self --selftest` 로). (2) 루트 Makefile images/lint/test 타깃에 self 위임 추가하고 SELF_REPO/SELF_IMG 좌표 정의. (3) image-workflows-triplicated 의 reusable 워크플로우가 생기면 self-image.yml 호출자를 추가(go 빌드라 selftest=false 또는 go test). 프로토타입이라도 "정식 컴포넌트인데 빌드 미배선"은 모순이므로 배선 권장.
- **`self-runtime-base-no-pin`** [S/low/medium] — huginnSelfRuntime Dockerfile 베이스 이미지 digest 핀 없음 (다른 런타임과 재현성 기준 불일치)
  - 문제: 같은 런타임 이미지 계열인데 공급망 안전 기준(digest 핀)이 컴포넌트마다 다르다. agent-runtime 이 digest 핀까지 한 의도(재현성·공급망)가 self 에는 적용 안 돼, slim/보안 지향이라는 self 의 명시 목표와도 모순. golang 빌더는 빌드 시점마다 패치 버전이 바뀔 수 있고, debian:bookworm-slim 런타임도 태그 부동.
  - 제안: agent-runtime 과 동일하게 `FROM golang:1.25-bookworm@sha256:...` 및 `FROM debian:bookworm-slim@sha256:...` 로 digest 핀(또는 distroless 검토 — operator 는 gcr.io/distroless/static:nonroot 사용, self 도 정적 CGO_ENABLED=0 바이너리라 distroless/static 으로 가면 apt 레이어/공격표면 더 축소 가능. 단 ca-certificates+git 필요분 확인). 일관성·재현성 측면에서 최소 digest 핀은 적용 권장.
- **`container-tool-default-split`** [S/low/medium] — CONTAINER_TOOL 기본값이 컴포넌트마다 docker vs podman 으로 갈림 (의도된 분기지만 함정 유발)
  - 문제: CLAUDE.md 가 이 분기("operator 타깃은 docker 기본")를 의도로 문서화했고 루트가 명시 전달로 봉합하므로 버그는 아니다. 그러나 4개 Makefile 중 1개만 기본이 다른 것은 인지 부하·함정이다: 하위 디렉터리에서 직접 빌드하는 개발자는 operator 만 docker 로 이미지를 만들어 kind(podman provider) 적재 시 혼선을 겪을 수 있다. kubebuilder scaffold 잔재(주석 "only tested with Docker")라 외부 유래의 비일관.
  - 제안: 프로토타입 규약상 podman 이 레포 기본이므로 huginnOperator/Makefile 의 `CONTAINER_TOOL ?= docker` 를 `?= podman` 으로 통일하고, kubebuilder scaffold 주석은 갱신/삭제. 그러면 루트 `images:` 의 명시 `CONTAINER_TOOL=` 전달도 불필요해져 Makefile:84-86 을 단순화할 수 있다. CLAUDE.md 의 "operator 만 docker 기본" 규약도 함께 제거 대상(하위호환 불필요 규약에 부합). 유지 이유가 있다면(CI 가 docker) CI 는 어차피 build-push-action 이라 Makefile CONTAINER_TOOL 을 안 쓰므로 통일 가능.
- **`root-test-lint-asymmetry`** [S/low/medium] — 루트 Makefile test/lint 타깃의 컴포넌트 커버리지 비대칭 (web 테스트 누락, self·docs 전무)
  - 문제: "일관된 어휘"를 표방한 루트 Makefile(파일 헤더 주석)인데 정작 build/lint/test 가 서로 다른 컴포넌트 집합을 위임해, `make test` 가 web 타입체크 게이트를 안 돌리고 `make lint` 가 docs/self 를 건너뛴다. 어떤 게이트가 어디서 도는지 예측 불가. self-runtime 미배선(self-runtime-no-make-no-ci)과 맞물려 루트에서 전체를 검증하는 단일 명령이 없다.
  - 제안: self 에 Makefile 추가(self-runtime-no-make-no-ci) 후, 루트 build/lint/test 가 동일한 컴포넌트 집합(operator/web/agentRuntime/self/docs)을 일관되게 위임하도록 정렬. 최소한 `test:` 에 `$(MAKE) -C muninnWeb test` 를 추가해 web 타입체크 게이트를 포함(이미 별칭이 존재하므로 한 줄). 각 컴포넌트가 해당 어휘를 지원 안 하면 no-op 별칭을 두어 매트릭스를 메운다.

## 특별 주목: API 버전 컨벤션 충돌

`operator-api-types` 리뷰에서 **`api/v1` 은 데드 코드가 아니라 의도된 storage 버전**이며, 동시에 프로젝트 컨벤션(CLAUDE.md: `muninn.io/v1beta1` 이 canonical)과 정면 충돌함이 확인됐다(`v1-is-storage-not-dead-code`). `api/v1` 과 `api/v1beta1` 타입 파일은 마커 2줄 빼고 완전 동일한 수기 복제본이라 이중 유지보수 부담이 있다(`v1-v1beta1-handwritten-type-duplication`). 이는 단순 리팩토링이 아니라 **저장 버전 전략 결정**(어느 쪽을 storage 로, conversion webhook 도입 여부)이 필요한 사안이므로 별도 설계 논의로 분리한다.
