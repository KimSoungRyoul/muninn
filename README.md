# Muninn DevOps Agent Platform

> 인프라 알림(Grafana/Airflow/ArgoCD)이 Claude 에이전트를 깨워 문제를 진단하고 **PR/Issue 를 여는** 이벤트 기반 플랫폼.

오딘의 두 까마귀에서 이름을 따온 두 평면으로 구성된다.

| 까마귀 | 평면 | 책임 |
|--------|------|------|
| **Huginn** (사고 / thought) | Agent Plane | 이벤트를 받아 Claude Code 에이전트를 실행하고, 진단하고, PR/Issue 를 생성한다. |
| **Muninn** (기억 / memory) | Memory Plane + 콘솔 | 지식 recall/store, 운영자 UI/API, metaDB. |

이 저장소는 **독립적으로 빌드되는 3개 컴포넌트 + 권위 있는 설계서**로 이루어진 모노레포다.

![Muninn Agent Platform 아키텍처](./muninnAgentPlatform_architecture.png)

## 아키텍처 — 이벤트가 PR 이 되기까지

CRD 계층(`muninn.io/v1beta1`)을 따라 제어 흐름이 이어진다.

```
event ─▶ Muninn API (정규화 + dedup) ─▶ HuginnIssue CR
   ─▶ HuginnIssue 컨트롤러가 HuginnRun(attempt N) 생성
   ─▶ HuginnRun 컨트롤러가 K8s Job → Pod (agent-runtime 이미지) 생성
   ─▶ Pod 가 claude_skill.sh → claude-agent-sdk 루프 실행 ─▶ PR / GitHub Issue
                                          │
                                          └─▶ recall(Muninn) · loki/tempo/mimir/github 조사 + 기억 저장
```

- **`HuginnAgent`** = 운영 대상 앱 1개(=에이전트 정의, the "Application").
- **`HuginnIssue`** = 이벤트 1건.
- **`HuginnRun`** = 실행 1회.

Operator 는 **Job 만 생성**한다. 에이전트 프로세스와 Muninn API 가 진행 상황을 `HuginnRun.status` 에 되써 보고한다.

## 저장소 구성

| 경로 | 무엇 | 스택 |
|------|------|------|
| [`huginnOperator/`](./huginnOperator/) | CRD 라이프사이클을 소유하는 K8s operator | Go, kubebuilder / controller-runtime |
| [`huginnAgentRuntime/`](./huginnAgentRuntime/) | 에이전트 실행 1회마다 도는 컨테이너 이미지 | Dockerfile + `claude_skill.sh` + Python (`claude-agent-sdk`) |
| [`muninnWeb/`](./muninnWeb/) | 운영자 콘솔(프로토타입) + CopilotKit 코파일럿 | Next.js (App Router) |
| [`deploy/helm/muninn/`](./deploy/helm/muninn/) | operator + web 배포용 Helm chart (PostgreSQL 외부) | Helm |
| [`docs/design/`](./docs/design/) | **권위 있는 설계서** — 코드 주석이 `§` 섹션을 인용 | Markdown + 예시 CR |

> 설계의 source of truth 는 [`docs/design/muninn-devops-agent-platform.md`](./docs/design/muninn-devops-agent-platform.md)(메인 설계서)와 [`docs/design/operator-design.md`](./docs/design/operator-design.md)(operator 시맨틱)다. operator 동작을 바꾸기 전에 `operator-design.md` 를 먼저 읽어라 — 코드 주석이 `§2.2`, `§5.1` 처럼 섹션 번호로 참조한다.

## Quick start

### huginnOperator (Go)

```bash
cd huginnOperator
make build                 # manager 바이너리 빌드
make test                  # unit + envtest (Ginkgo/Gomega; etcd/kube-apiserver 다운로드)
make manifests generate    # api/*_types.go 또는 +kubebuilder 마커 수정 후 필수
make run                   # 현재 kubeconfig 로 컨트롤러 실행 (로컬은 ENABLE_WEBHOOKS=false)
```

로컬 end-to-end (kind, Podman 권장):

```bash
make run-kind CONTAINER_TOOL=podman   # kind 생성 + CRD 설치 + agent-runtime 이미지 빌드/load + operator 실행
make test-e2e                          # 격리된 kind e2e (별도 클러스터)
make kind-delete CONTAINER_TOOL=podman
```

### huginnAgentRuntime (이미지 — Podman, not Docker)

```bash
cd huginnAgentRuntime
podman build -t ghcr.io/kimsoungryoul/muninn/agent-runtime:dev .
podman run --rm ghcr.io/kimsoungryoul/muninn/agent-runtime:dev selftest   # 오프라인 배선 점검(API 호출 없음)
```

CI 는 `.github/workflows/agent-runtime-image.yml` 로 이미지를 발행한다(PR = 빌드만, main/tag push = 멀티아치 push).

### muninnWeb (Next.js, port 3030 — pnpm)

```bash
cd muninnWeb
pnpm install
pnpm dev           # http://localhost:3030
pnpm build         # production 빌드 = 타입체크 게이트 (tsc 실행)
pnpm lint
```

> 코파일럿(CopilotKit) 동작엔 자격 env 가 필요하다: `CLAUDE_CODE_OAUTH_TOKEN` 또는 `ANTHROPIC_API_KEY`. (선택) `COPILOT_MODEL` 로 모델 override(기본 `claude-haiku-4-5-20251001`).

### 배포 (Helm)

```bash
helm install muninn deploy/helm/muninn -n muninn --create-namespace
```

operator + web 을 설치한다. **PostgreSQL 은 chart 가 설치하지 않는다** — `externalPostgresql.*` 로 외부 인스턴스 연결 정보만 등록한다. webhook(기본 off)을 켜면 [cert-manager](https://cert-manager.io)가 필요하다. 자세한 값/사전 요구는 [chart README](./deploy/helm/muninn/README.md) 참고.

## 기여자가 알아야 할 핵심 계약

- **상태 필드 소유권(`HuginnRunStatus`) — 위반 금지.** 필드가 3명의 writer 로 나뉜다(`operator-design.md §2.2`): Operator 는 `phase`/`startedAt`/`finishedAt`/`jobName`/caps/`conditions`; Agent→API 는 `step`/`cost`/`tokens`/`output`; API 는 `AwaitingApproval` 전이 + `approval`. 그래서 operator 는 full update 가 아니라 `r.Status().Patch(ctx, run, client.MergeFrom(base))` 로 status 를 쓴다 — 다른 writer 필드를 덮어쓰지 않도록.
- **재시도는 pod 레벨이 아니다.** Job 은 `backoffLimit=0` 으로 생성된다. 재시도는 `HuginnIssue` 컨트롤러가 *새 attempt* `HuginnRun` 을 만드는 방식이며 `retryPolicy.maxRuns` 로 제한된다. 에이전트 런은 비멱등이므로 pod restart 를 절대 켜지 마라.
- **`JobTemplate` 은 큐레이트된 slim 서브셋**(full PodSpec 아님). full `corev1.PodSpec` 을 넣으면 CRD OpenAPI 스키마가 client-side-apply 256KB 한도를 넘는다. `buildJobTemplate` 가 slim recipe 를 채우고, `expandPodSpec` 가 고정 필드(restartPolicy=Never, `~/.claude` 볼륨 마운트, non-root securityContext 등)를 더해 실제 PodSpec 을 만든다.
- **agent-runtime 이미지 계약.** **non-root**(`node`, uid 1000)로 돈다 — `claude` CLI 가 root 에서 `--dangerously-skip-permissions` 를 거부하기 때문. `~/.claude` 는 `/home/node/.claude`(operator 의 `claudeMountPath` 와 일치해야 함). 엔트리는 `claude_skill.sh`(모드: `run` / `selftest`), `runner.py` 가 `claude-agent-sdk` 를 구동하고 SDK 가 `PATH` 의 `claude` CLI 를 띄운다 — 따라서 npm CLI 와 Python SDK 둘 다 필요.
- **인증은 env(Secret) 전용.** operator 가 `agent-secrets` Secret 에서 `ANTHROPIC_API_KEY`·`CLAUDE_CODE_OAUTH_TOKEN`(둘 다 optional, 런타임은 최소 하나 필요), 앱의 `source.secretRef` Secret(키 `token`)에서 `GITHUB_PAT` 를 주입한다. 이미지·매니페스트·web mock 에 자격증명을 절대 넣지 마라. `SELFTEST` 센티넬(`ANTHROPIC_API_KEY=SELFTEST` 또는 `MUNINN_SELFTEST=1`)로 실제 키 없이 파이프라인 QA 가능.
- **muninnWeb 은 프로토타입/mock.** 페이지는 `lib/data.ts`(`HM_DATA`)에서 클라이언트 렌더링하고, `app/api/**` 라우트 핸들러는 비영속 mock 이다. 라이브 백엔드가 아니라 UI 프로토타입으로 다뤄라.

## 컨벤션

- **Podman, not Docker** — 전반적으로 컨테이너 런타임은 Podman(kind 는 `KIND_EXPERIMENTAL_PROVIDER=podman`; operator make 타깃엔 `CONTAINER_TOOL=podman`).
- **회사 식별 정보 금지** — org/repo/host 이름은 중립 placeholder(`acme` 등) 사용.
- **kubebuilder 생성 파일은 손대지 말 것** (`config/crd/bases/*`, `config/rbac/role.yaml`, `**/zz_generated.*`, `PROJECT`) — `make manifests generate` 로 재생성. 자세한 kubebuilder 메커니즘은 [`huginnOperator/AGENTS.md`](./huginnOperator/AGENTS.md).
- **네이밍** — 아키텍처 그림의 오타 `huggin`/`hugginSession` 은 **Huginn** 으로 정규화. 이벤트 CR 은 Claude SDK 의 "session" 과 혼동을 피해 `HuginnIssue`. Kinds: `HuginnAgent` / `HuginnIssue` / `HuginnRun`.
- 아키텍처 다이어그램 원본은 `muninn아키텍처.drawio`(원본 설계 + "현재 구현" 2페이지), `muninnAgentPlatform_architecture.png` 는 렌더 스냅샷.

전체 개발 가이드는 [`CLAUDE.md`](./CLAUDE.md), 설계 상세는 [`docs/design/`](./docs/design/) 참고.

## 라이선스

See repository for license details.
