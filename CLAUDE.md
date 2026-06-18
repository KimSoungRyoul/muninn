# CLAUDE.md

전체 소개 + Quick Start 는 `README.md`. 이 파일은 gotcha/계약 계층이다.

## 개요

독립적으로 빌드되는 네 컴포넌트 + 권위 있는 스펙(spec)으로 구성된 모노레포:

| 경로 | 무엇 | 스택 |
|------|------|-------|
| `huginnOperator/` | CRD 라이프사이클을 소유하는 K8s 오퍼레이터 | Go, kubebuilder/controller-runtime |
| `huginnAgentRuntime/` | 각 에이전트 실행이 돌아가는 컨테이너 이미지 (`claude-code` 런타임) | Dockerfile + `claude_skill.sh` + Python (`claude-agent-sdk`) |
| `huginnSelfRuntime/` | 옵션 런타임 (`huginn-self`): 비-Claude/오픈 모델을 OpenAI 호환 API 로 직접 구동하는 에이전트 루프 | Go (`main.go` + `agent`/`llm`/`spi`/`runtimeapi`), Dockerfile |
| `muninnWeb/` | 오퍼레이터 콘솔 + Muninn API (프로토타입) | Next.js (App Router), pnpm |
| `muninnDocs/` | 문서 사이트(GitHub Pages) — `docs/design/` 을 빌드 시 동기화 | Next.js (Nextra 4), pnpm |
| `docs/design/` | **권위 있는 스펙** — 코드 주석이 `§` 섹션을 인용한다 | Markdown + 예제 CR |

`docs/design/muninn-devops-agent-platform.md`(메인 스펙)와 `operator-design.md`(오퍼레이터 시맨틱)가 source of truth 다. 오퍼레이터 동작을 바꿀 땐 `operator-design.md` 를 먼저 읽어라 — 주석이 섹션 번호(`§2.2`, `§5.1`)로 이를 참조한다. `muninn-pluggable-agent-runtime.md` 는 런타임 셀렉터(`claude-code` ↔ `huginn-self`) 와 SPI 계약을, `muninn-goal-conversational-delegation.md` 는 코파일럿 오케스트레이션을, `muninnWeb/docs/copilotkit-request-flow.md` 는 CopilotKit→Anthropic 요청/OAuth 흐름을 다룬다.

## 아키텍처 (파일을 가로지르는 부분)

**CR 네이밍 (`muninn.io/v1beta1`).** Kind 는 `HuginnAgent`(관리 대상 앱) / `HuginnIssue`(이벤트) / `HuginnRun`(실행). 이벤트 CR 은 Claude SDK 의 "session" 과 충돌을 피하려고 `HuginnSession` 이 **아니라** `HuginnIssue` 다. 다이어그램의 `huggin`/`hugginSession` 은 **Huginn** 으로 정규화됨.

**Status 필드 소유권 (`HuginnRunStatus`) — 위반 금지** (`operator-design.md §2.2`). 세 writer 로 나뉜다:
- **Operator**: `phase` / `startedAt` / `finishedAt` / `durationSeconds` / `jobName` / caps / `conditions`
- **Agent→API**: `step` / `cost` / `tokens` / `recalledMemoryIds` / `output` / `sessionId`
- **API**: `AwaitingApproval` 전이 + `approval`

오퍼레이터는 다른 writer 의 필드를 덮어쓰지 않도록 status 를 `r.Status().Patch(ctx, run, client.MergeFrom(base))` 로만 쓴다(전체 update 금지). muninnWeb 의 `lib/k8s.ts` 도 같은 이유로 merge-patch 를 쓴다. 양쪽 모두에서 이를 유지하라.

**재시도는 pod 레벨이 아니다.** Job 은 `backoffLimit=0` 으로 생성된다. 재시도는 `HuginnIssue` 컨트롤러가 *새 attempt* `HuginnRun` 을 만드는 방식이며, `retryPolicy.maxRuns` 로 backoff 와 함께 제한된다. 에이전트 실행은 non-idempotent 이므로 pod restart 를 절대 다시 켜지 마라. 재시도 attempt 는 직전 attempt 의 `status.sessionId` 를 `MUNINN_RESUME_SESSION_ID` 로 받아 Claude 세션을 resume 한다(같은 Issue 내로 한정 — 앱별 `~/.claude` PVC 의 transcript 재사용, §5.5).

**`JobTemplate` 은 전체 PodSpec 이 아니라 큐레이팅된 슬림 subset 이다** (`huginnrun_types.go`). 전체 `corev1.PodSpec` 을 넣으면 CRD OpenAPI 스키마(~590KB)가 256KB client-side-apply 어노테이션 한계를 넘는다. `buildJobTemplate`(helpers.go)이 Agent+Issue 로 슬림 recipe 를 채우고, `expandPodSpec`(huginnrun_controller.go)이 고정 필드(restartPolicy=Never, 컨테이너 이름, `~/.claude` 마운트, non-root securityContext)를 더해 실제 PodSpec 을 만든다.

**agent-runtime 이미지 계약** (`huginnAgentRuntime/`): `claude` CLI 가 root 에서 `--dangerously-skip-permissions` 를 거부하므로 **non-root**(`node`, 베이스 이미지의 uid 1000)로 실행된다. `~/.claude` 는 `/home/node/.claude`(오퍼레이터의 `claudeMountPath` 와 일치해야 함). 엔트리 `claude_skill.sh` 에는 `run`(라이브)과 `selftest`(오프라인 tool+SDK 배선 점검, API 호출 없음) 모드가 있다. `runner.py` 가 `claude-agent-sdk` 를 구동하고, SDK 는 `PATH` 의 `claude` CLI 를 띄운다 — 따라서 이미지에 npm CLI 와 Python SDK 가 **둘 다** 필요하다. Guardrail 매핑: `maxIterations→max_turns`, `maxCostUsd→max_budget_usd` (`maxTokens` 는 SDK 필드가 없어 플랫폼이 추적).

**런타임은 pluggable 이다** (`AgentSpec.Runtime`, enum `claude-code`|`huginn-self`, 기본 `claude-code`). `helpers.go` 의 `effectiveRuntimeOf`/`defaultImageForRuntime`/`resolveAgentForRun` 이 런타임을 확정하고, `buildJobTemplate`/`expandPodSpec` 이 런타임별 이미지·env 로 분기한다. `huginn-self`(`huginnSelfRuntime/`)는 claude CLI 없이 OpenAI 호환 게이트웨이를 직접 호출하는 Go 루프로, runtime↔API 의 status 보고는 `runtimeapi.BuildReportPatch`(Go) / `runner.py`(Python)가 **동형 계약**으로 미러한다 — 한쪽 계약(approval state, terminalKind, cost/step 보고)을 바꾸면 반드시 다른 쪽도 맞춰라(`muninn-pluggable-agent-runtime.md`). selftest 출력도 두 런타임이 동형(`§2.6`). 두 런타임 간 공유돼야 할 문자열/기본값 상수는 아직 손으로 미러돼 drift 위험이 있다.

**인증은 env(Secret) 전용.** 오퍼레이터는 `agent-secrets` Secret 에서 `ANTHROPIC_API_KEY` 와 `CLAUDE_CODE_OAUTH_TOKEN`(둘 다 `optional` — 런타임은 최소 하나 필요), 앱의 `source.secretRef` Secret(키 `token`, *별도* Secret)에서 `GITHUB_PAT` 를 주입한다. 자격증명을 이미지·매니페스트·웹 mock 에 절대 넣지 마라. `SELFTEST` 센티넬(`ANTHROPIC_API_KEY=SELFTEST` 또는 `MUNINN_SELFTEST=1`)은 실제 키 없이 파이프라인 QA 를 위해 런타임을 오프라인으로 돌린다.

**muninnWeb 은 dual-mode** (게이트웨이 + 메모리 + 콘솔). `app/api/**` 는 배선되면 실제 동작을 한다 — HuginnIssue/HuginnRun CR 생성·패치(`@kubernetes/client-node`, `lib/k8s.ts`), 그리고 **외부 postgres + Drizzle** 로 메모리 저장·recall(`lib/db.ts`, 스키마 `lib/schema.ts`. **텍스트 검색**은 `to_tsvector`/`ts_rank_cd`, 임베딩/pgvector 없음 → 아무 postgres/CNPG 이미지나 가능. DB 는 `DATABASE_URL` 로 외부 연결, 권장 프로비저닝 = CloudNativePG, `deploy/quickstart`). 라우트는 `k8sEnabled()`/`dbEnabled()` 로 분기하고, 아니면 `lib/data.ts`(`HM_DATA`) mock 으로 폴백한다 — 마이그레이션 진행 중(약 22개 라우트/컴포넌트가 아직 `lib/data.ts` 를 import). `ensureSchema()` 가 `drizzle/` 폴더에서 Drizzle `migrate()` 를 멱등하게 실행하며, 이 폴더는 런타임에 포함되어야 한다(Dockerfile 에서 복사). CopilotKit 코파일럿은 **서버 도구**(`defineTool`)를 통한 대화형 오케스트레이터(흐름은 `muninn-goal-conversational-delegation.md §0–1`)이고, 내비게이션은 프론트엔드 도구(`useFrontendTool`)다.

## 명령어

**루트 `Makefile`** — `make run-kind` / `images` / `status` / `down` / `help`. 코파일럿/agent 까지 가려면 `CLAUDE_CODE_OAUTH_TOKEN=... make run-kind`. 루트 `run-kind` ≠ operator 의 `run-kind`(이름만 같다): 루트는 operator 까지 helm 으로 클러스터 *안* 배포, operator(huginnOperator/)는 operator 를 host `go run` 으로 클러스터 *밖* 실행.

**huginnOperator/** (Go) — 표준 kubebuilder 타깃은 `make help`. 비자명한 부분:
```bash
make manifests generate    # api/*_types.go 나 +kubebuilder 마커 수정 후 필수
make run                   # 로컬에선 ENABLE_WEBHOOKS=false
go test ./internal/controller/ -run TestBuildJobTemplate -count=1   # 순수 단위 테스트, envtest 불필요
make run-kind CONTAINER_TOOL=podman    # kind + CRD + agent-runtime 이미지 적재 + operator(host 에서) 실행
#   그다음 다른 셸에서 — 인증 Secret + 예제 CR 적용 (ns ns-huginn-e2e):
kubectl -n ns-huginn-e2e create secret generic agent-secrets --from-literal=claude-code-oauth-token="$CLAUDE_CODE_OAUTH_TOKEN"
kubectl apply -f ../huginnAgentRuntime/examples/kind-e2e.yaml
make test-e2e              # 격리된 e2e (별도 클러스터 huginnoperator-test-e2e; CONTAINER_TOOL 무시)
```

**huginnAgentRuntime/** (이미지): `make image`(빌드), `make selftest` / `make test`(오프라인 tool+SDK 배선 점검). CI 는 `.github/workflows/agent-runtime-image.yml` 로 publish(PR=빌드만, main/tag=multi-arch push).

**huginnSelfRuntime/** (Go 이미지): 표준 `go build ./...` / `go vet ./...` / `go test ./...`(`runtimeapi`·`internal/strutil` 테스트). 엔트리 `huginn-self` 바이너리에 `run`/`selftest` 모드(`§2.6`, claude-code selftest 와 출력 동형). ⚠️ 아직 **Makefile/루트 위임/CI 이미지 publish 가 미배선**(빌드 시스템 고아 — 후속 작업). 직접 빌드: `podman build -t ghcr.io/kimsoungryoul/muninn/huginn-self:dev huginnSelfRuntime/`.

**muninnWeb/** (Next.js, 포트 3030): ⚠️ `make dev` 중에 `make build` 금지(`.next` 손상). 코파일럿엔 `CLAUDE_CODE_OAUTH_TOKEN` 또는 `ANTHROPIC_API_KEY` 필요. 선택적 `COPILOT_MODEL`(기본 `claude-haiku-4-5-20251001`), 라우트 `/api/copilotkit`.

**muninnDocs/** (Nextra 4, 포트 3031): `make dev` / `build`(정적 export + pagefind) / `build-pages`(`/muninn` basePath QA). `content/design/` 과 `content/muninn-architecture.png` 는 `scripts/sync-design-docs.mjs` 가 `docs/design/` 과 루트 PNG 에서 생성하는 산출물(gitignore) — **설계 문서 수정은 항상 `docs/design/` 원본에서**. ⚠️ `content/` 하위에 페이지(md/mdx) 없는 폴더를 만들면 Nextra pageMap 검증이 깨져 전 페이지가 500 이 된다. zod 는 `pnpm.overrides` 로 4.1.12 핀(nextra-theme-docs 4.6.1 이 zod 4.4 와 비호환 — 업스트림 수정 시 제거). `@theguild/remark-mermaid` 는 nextra 의 전이 의존성이지만 **직접 의존성으로도 선언**되어 있다 — Next 16 Turbopack 이 mdx 에 주입되는 `@theguild/remark-mermaid/mermaid` import 를 pnpm 엄격 레이아웃에서 resolve 못 하기 때문(제거하면 빌드가 깨진다). main 푸시 시 `.github/workflows/docs-site.yml` 이 GitHub Pages(`https://kimsoungryoul.github.io/muninn/`)로 배포한다.

## 규약

- **하위호환은 필수가 아니다 — 모순/데드필드는 개편을 우선 검토하라.** 프로토타입이므로 "기존에 있다"는 이유로 보존하지 마라. 설계 모순·데드필드(operator 가 안 읽는 `spec.bindings`/`status.inheritedBindings`, mock 자격 폼)·claude-편향 네이밍은 점진 호환보다 **깔끔한 재설계/제거를 기본 선택지**로. (`AgentSpec.Runtime` 은 PR #68 의 pluggable runtime 이후 *활발히 사용*되므로 데드필드가 아니다.) 호환 레이어는 *운영 데이터 유실 위험이 있을 때만* 정당화. 제안 시 "유지 vs 개편" 비용·이득을 명시.
- **operator 타깃은 `CONTAINER_TOOL=docker` 가 기본** — root/web/runtime Makefile 은 podman 이 기본이므로 operator 타깃엔 `CONTAINER_TOOL=podman` 을 명시하라.
- **이미지 레지스트리**는 메인테이너의 GHCR 네임스페이스(`ghcr.io/kimsoungryoul/muninn/*`)로 publish 한다. 중립 placeholder(`acme` 등)는 CR·mock 데이터의 예제 org/repo/host 이름에만 쓴다.
- **kubebuilder 생성 파일은 손대지 마라**(`config/crd/bases/*`, `config/rbac/role.yaml`, `**/zz_generated.*`, `PROJECT`) — `make manifests generate` 로 재생성. 전체 kubebuilder 메커니즘은 `huginnOperator/AGENTS.md` 참고.
