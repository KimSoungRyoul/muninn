# TODO — Pluggable Agent Runtime (claude-code ↔ huginn-self) 구현

> HuginnRun 실행 백엔드를 `AgentSpec.runtime` selector 로 선택한다 — `claude-code`(기본·고성능) / `huginn-self`(opt-in·비-Claude 자체/오픈 모델). 본 TODO 는 설계 문서의 **§9 마이그레이션 · §10 정정·개편 · §11 Open Questions** 를 구현 작업 단위로 풀어낸 것이다.
>
> **상태**: 설계 확정(v0.4) · **구현 미착수**. Q2(수요) 통과로 (B) 진행 결정됨.

## 📑 Source of Truth (설계 문서)

- **메인 설계**: [`docs/design/muninn-pluggable-agent-runtime.md`](docs/design/muninn-pluggable-agent-runtime.md) — SPI 계약(§2)·백엔드 분기(§4)·compaction GA gate(§6.1)·보안 gate(§6.2)·Open Questions(§11)
- **operator 시맨틱**: [`docs/design/operator-design.md`](docs/design/operator-design.md) — status 소유권(§2.2)·재시도·webhook(§4)·RBAC·Runtime selector plug(§2.7)
- **메인 스펙**: [`docs/design/muninn-devops-agent-platform.md`](docs/design/muninn-devops-agent-platform.md) — §5 런타임·§6.4 HITL
- **설계 인덱스**: [`docs/design/README.md`](docs/design/README.md)

## 🔗 관련 PR

- **#65** 초기 pluggable selector 설계: https://github.com/KimSoungRyoul/muninn/pull/65
- **#66** v0.4 완결성 보강 + 의사결정(Q2/Q7/Q1): https://github.com/KimSoungRyoul/muninn/pull/66

## ✅ 의사결정 현황 (설계 §11)

- ✅ **Q2 수요 = 있음 → (B) 진행** (구체 모델/팀/태스크 기입은 go/no-go 정량 위해 TODO)
- ✅ **Q7 HITL expiry = runner 폴링 > web TTL** (web `expired` 권위, `terminalKind=expired` 결정적)
- ⏸ **Q1 compaction 방식 = PoC 에서 결정** (권장 기본 = sliding window+pin + 요약 opt-in)
- ❓ **미결**: Q3 cost 정책 · Q4 tokens 의미 · Q5 모듈 토폴로지 · Q6 selector 수명 · Q8 codegen · Q9 `secretRef` 스키마 · Q10 tool allowlist · Q11 HITL 게이트 위치

---

## 🟢 (A) huginn-self 수요와 무관 — 즉시 착수 가능

> claude-code 단독에서도 이득. 수요 게이트와 독립으로 진행.

- [ ] **claude-편향 네이밍/PVC 리네임** (설계 §10-6,7) — `claudeStoreInitPath`/`CLAUDE_HOME_DIR`/`claude-home-init` → `agent*`; PVC `pvc-claude-<app>` → `pvc-agent-<app>`; `JobTemplate.ClaudePVCName/ClaudeSubPath` → `Agent*`. 코드: `huginnOperator/internal/controller/{helpers.go,huginnrun_controller.go}`, `api/v1beta1/huginnrun_types.go`. ⚠️ **orphan cleanup 동반**(`ensurePVC` 는 Get→Create 라 구 PVC 잔존).
- [ ] **§3 게이트웨이 env 주입** (설계 §3) — `AgentSpec.baseUrl/model/authStyle` 신설 + `buildJobTemplate` 이 `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/Bedrock·Vertex env 주입. webhook 순수 검증.
- [ ] **SPI 명문화 + conformance 층1** (설계 §8) — `runner.py` 페이로드 ↔ web `app/api/runs/[id]/report/route.ts` 스키마 **골든 계약 테스트**(향후 huginn-self 기준선).
- [ ] **컨테이너 격리 baseline** (설계 §6.2-6) — `expandPodSpec` 고정필드에 egress NetworkPolicy·`readOnlyRootFilesystem`·`seccompProfile=RuntimeDefault`·drop ALL caps. **claude-code 에도 적용**(현행 `bypassPermissions` 표면 차단).
- [ ] **도구 자격·bindings 주입** (설계 §2.7·§10-8) — `ToolBinding.secretRef`(키맵) 추가, operator 가 `inheritedBindings` 순회 → 도구별 표준 env(`ARGOCD_*`/`GRAFANA_TOKEN`…). muninnWeb mock 자격폼 → 실 K8s Secret 배선.
- [ ] **Q7 expiry race 해소** (설계 §2.6·§10-2) — operator `helpers.go` 의 `approvalTimeoutSeconds`(현재 5400s 단일소스)를 **web TTL < runner 타임아웃**으로 변경(`MUNINN_APPROVAL_TIMEOUT = approvalTtlMinutes×60 + grace`). `runner.py` "Expired 도달 불가" 주석 + 메인스펙 §6.4 stale 정정. conformance expiry 활성.

## 🟡 (B) huginn-self 종속 — 수요 게이트(✅통과) 후

- [ ] **`Runtime` enum 승격** (설계 §1·§10-3) — `+kubebuilder:validation:Enum=claude-code;huginn-self` 를 **v1beta1·v1 양쪽**(둘 다 served)에. `make manifests generate`.
- [ ] **`buildJobTemplate` runtime 분기** (설계 §4.1) — image/command/mountPath/env 분기. 주 분기점 1곳(`helpers.go`) + `expandPodSpec` 의 `agentSkillCmd` fallback 정리.
- [ ] **신규 webhook: runtime↔image 정합 검증** (설계 §4.2·§10-11) — 현 `ValidatingWebhook` 은 `workspaceId` 만 검증.
- [ ] **`agent.image` required 제거** (설계 §10-5) — operator config flag `--claude-code-image`/`--huginn-self-image`. `JobTemplate.Image` MinLength=1 연쇄(operator 기본 이미지로 선채움).
- [ ] **`huginn-agent` SA 최소권한 Role 신설** (설계 §6.2-5·§10-10) — 현재 **Role 미바인딩**(보안 사유 제거)이라 `kubectl_ro` 무동작. pods get,list·logs / deploy·rs get,list (**secrets 제외**). operator 자신도 권한 보유(privilege-escalation 회피). **PoC 전 선결**.
- [ ] **compaction 전략 구현** (설계 §6.1 · Q1) — PoC 에서 방식 확정(sliding window+pin / 요약). trigger(윈도우 75%)·tool 출력 캡·회계. env `MUNINN_MODEL_CONTEXT_WINDOW`/`MUNINN_COMPACT_THRESHOLD`.
- [ ] **`effectiveRuntime` 동결** (설계 §5·§10-9) — `HuginnIssueStatus.effectiveRuntime`(Operator 소유·1회 기록). 기록-생성 원자성 + resume 백엔드 일치 가드(`withResumeSession`).
- [ ] **huginn-self Go 백엔드 PoC** (설계 §4·§4.5) — 독립 모듈 `pkg/runtimeapi`(k8s import 없는 순수 DTO) → **SPI 종료/보고 행위 먼저**(terminal-1회·SIGTERM·HITL·resume preflight) → text-only → read-only tool → mutating 점진. cost/tokens 채움(§2.3a, `estimated` 플래그), 미완 tool_result 복구(§2.5).
- [ ] **huginn-self 이미지** (설계 §9) — 슬림 Go + 운영 CLI, **범용 인터프리터 미설치**(§6.2-1), `mona-public` p_success base, selftest(출력형식 동형 §2.6).
- [ ] **muninnWeb 반영** (설계 §10-5) — runtime `Select`(`components/pages.tsx`)에 `huginn-self` 추가, `AppVM.image`(`lib/incidents.ts`)·`AgentRuntimeConfig.image`(`lib/types.ts`) optional 화, `apps` PATCH 검증 완화.
- [ ] **conformance 층2 매트릭스 + 보안 회귀** (설계 §8) — `runtime∈{claude-code,huginn-self}`. guardrail 비대칭·cost/tokens 채움·bash allowlist 우회 거부·SSRF 내부대역 거부·시크릿 스크럽 누설 0.

---

## 🌐 muninnWeb 반영 매핑 (operator 내부 계약 ↔ web)

> muninnWeb 는 dual-mode 로 **Muninn API** 자체라 operator 계약을 상당 부분 공유한다(자세히는 설계 §2.2·§2.6·§4.5·§10-5).

| operator 내부 계약 | muninnWeb 위치 | 상태 |
|---|---|---|
| status 필드 소유권(writer별 자기 필드만) | `lib/k8s.ts` merge-patch | ✅ 반영 |
| HITL lazy expiry | `lib/incidents.ts:approvalState()` | ✅ 반영 (Q7 후 web TTL 이 권위) |
| report/recall 계약(이중적재·score `String()`) | `app/api/runs/[id]/{report,recall-report}` | ✅ 반영 |
| CRD 스키마 미러 | `pages.tsx` Select·`AppVM.image`·`apps` PATCH | ⚠️ huginn-self 미반영 → (B) |
| 도구 자격 | 자격 입력 폼 | ⚠️ mock(실 Secret 미배선) → (A) |

---

## ❓ 착수 전/중 결정 필요 (설계 §11)

- [ ] **Q1** compaction 방식 (huginn-self GA 직전 필수)
- [ ] **Q3** cost 추정 불가 정책 (fail-closed vs fail-open, `MUNINN_COST_POLICY`)
- [ ] **Q5** 모듈 토폴로지 (독립 모듈 + 순수 DTO 미러 범위)
- [ ] **Q2** 구체 워크로드(모델/팀/태스크) 기입 → go/no-go 정량(설계 §7)
- [ ] **Q4/Q6/Q8/Q9/Q10/Q11** — tokens 의미 / selector 수명 / codegen / `secretRef` 스키마 / tool allowlist / HITL 게이트 위치
