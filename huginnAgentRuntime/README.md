# huginn-agent-runtime

`HuginnRun`(K8s Job/Pod)이 실행하는 **에이전트 런타임 컨테이너 이미지**. 아키텍처 그림의
"Huginn Run" + `claude_skill.sh` 박스에 해당하며, 설계서 §5(에이전트 런타임)를 구현한다.

`HuginnAgent.spec.agent.image` 에 이 이미지를 지정하면, Operator 가 이벤트마다
`HuginnIssue → HuginnRun → Job` 을 만들고 이 이미지로 Claude Agent SDK 루프를 실행한다.

## 포함된 도구

| 분류 | 도구 |
|------|------|
| 에이전트 | `claude`(Claude Code CLI), `claude-agent-sdk`(Python) |
| 쿠버네티스 | `kubectl`, `helm` |
| 배포 | `argocd` |
| GitHub | `gh`, `git` |
| 처리 | `jq`, `yq`, `curl` |
| 런타임 | Node 24(LTS), Python 3 |

Python SDK 는 내부적으로 Claude Code CLI 를 subprocess 로 호출하므로 두 가지가 모두 필요하다.

## 이미지 좌표(GitHub Packages)

```
ghcr.io/kimsoungryoul/muninn/agent-runtime:<tag>
```

태그 규칙(`.github/workflows/agent-runtime-image.yml`):

- `main` 푸시 → `latest`, `sha-<shortsha>`
- `v*` 태그 푸시 → `1.2.3`, `1.2`, `latest`
- PR → 빌드만(푸시 안 함)

멀티아치(`linux/amd64`, `linux/arm64`)로 빌드된다.

## 엔트리포인트 계약 (`claude_skill.sh`)

```
claude_skill.sh [run|selftest|<cmd>]
```

| 모드 | 동작 |
|------|------|
| `run`(기본) | 컨텍스트/인증 준비 후 `runner.py` live 실행 |
| `selftest` | API 호출 없이 툴·SDK 배선만 검증하고 `exit 0`(kind/CI QA) |
| 그 외 | 인자를 그대로 `exec`(디버깅) |

### 주입 컨텍스트(env, 설계서 §5.1)

| env | 의미 |
|-----|------|
| `MUNINN_GOAL` | 처리할 목표(필수) |
| `MUNINN_GUARDRAILS` | `{"maxIterations","maxCostUsd","maxTokens"}` → SDK `max_turns` 등 |
| `MUNINN_GLOBAL_SYSTEM_PROMPT_REF` / `MUNINN_TEAM_SETTINGS_REF` / `MUNINN_SOUL_REF` | 프롬프트/정책 ConfigMap 참조 |
| `MUNINN_EVENT_PAYLOAD_REF` | 정규화 이벤트 Secret 참조 |
| `MUNINN_MEMORY_ENDPOINT` / `MUNINN_API_ENDPOINT` | recall/보고 엔드포인트 |
| `ANTHROPIC_API_KEY` **또는** `CLAUDE_CODE_OAUTH_TOKEN` | 인증(둘 중 하나, env=Secret 으로만) |
| `GITHUB_PAT` | GitHub 자격(git/gh) |
| `MUNINN_PERMISSION_MODE` | SDK permission_mode(기본 `bypassPermissions`) |

> 인증 키는 **PVC 가 아니라 env(K8s Secret)로만** 주입한다(§5.1, §6.2).

### selftest 센티넬

오프라인 검증은 다음 중 하나로 활성화된다:

- `selftest` 인자
- `MUNINN_SELFTEST=1`
- `ANTHROPIC_API_KEY=SELFTEST` (CRD env 가 고정이라 Operator 경로에서 API 키 없이 파이프라인 QA 할 때)

## 로컬 빌드 / 실행 (Podman)

```bash
cd huginnAgentRuntime
podman build -t huginn-agent-runtime:dev .

# 오프라인 배선 검증
podman run --rm huginn-agent-runtime:dev selftest

# 라이브 실행(OAuth 토큰 사용 예시 — 토큰은 절대 이미지/커밋에 넣지 말 것)
podman run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  -e MUNINN_GOAL="Reply with HUGINN_OK" \
  -e MUNINN_GUARDRAILS='{"maxIterations":2}' \
  huginn-agent-runtime:dev
```

## kind E2E (로컬)

operator 레포에서 한 번에 클러스터·CRD·이미지 적재 후 operator 를 실행한다:

```bash
cd ../huginnOperator
make run-kind CONTAINER_TOOL=podman      # kind 생성 + CRD 설치 + 이미지 load + operator(webhook off) 실행
```

다른 셸에서 인증 Secret 생성(커밋 금지) 후 E2E 매니페스트 적용:

```bash
kubectl -n ns-huginn-e2e create secret generic agent-secrets \
  --from-literal=claude-code-oauth-token="$CLAUDE_CODE_OAUTH_TOKEN"
kubectl apply -f examples/kind-e2e.yaml
kubectl -n ns-huginn-e2e get hissue,hrun,job,pod -w
```

> 컨테이너는 비-root(node, uid 1000)로 동작하며 Operator 가 `runAsNonRoot`/`fsGroup`/capability 드롭을 부여한다.

## 버전 핀

도구 버전은 Dockerfile `ARG` 로 핀되어 있고 빌드 시 오버라이드 가능하다
(`--build-arg HELM_VERSION=...`). `kubectl` 은 비우면 `dl.k8s.io/release/stable.txt`
최신 stable 을 사용한다.
