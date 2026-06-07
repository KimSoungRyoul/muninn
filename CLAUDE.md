# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Muninn DevOps Agent Platform — an event-driven system where infra alerts (Grafana/Airflow/ArgoCD) trigger a Claude agent that diagnoses the problem and opens a PR/Issue. Two "ravens":

- **Huginn** (thought / Agent Plane) — runs the Claude agent per event.
- **Muninn** (memory / control + console) — recall/store knowledge, operator UI/API.

The repo is a **monorepo of three independently-built components** plus the authoritative spec:

| Path | What | Stack |
|------|------|-------|
| `huginnOperator/` | K8s operator owning the CRD lifecycle | Go, kubebuilder/controller-runtime |
| `huginnAgentRuntime/` | The container image each agent run executes | Dockerfile + `claude_skill.sh` + Python (`claude-agent-sdk`) |
| `muninnWeb/` | Operator console (prototype) | Next.js (App Router) |
| `docs/design/` | **Authoritative spec** — code comments cite its `§` sections | Markdown + example CRs |

`docs/design/muninn-devops-agent-platform.md` (main spec) and `docs/design/operator-design.md` (operator semantics) are the source of truth. When changing operator behavior, read `operator-design.md` first — code comments reference it by section (e.g. `§2.2`, `§5.1`).

## Architecture (the parts that span files)

**CRD hierarchy & control flow** (`muninn.io/v1beta1`):

```
event ─▶ Muninn API (normalize + dedup) ─▶ HuginnIssue CR
   ─▶ HuginnIssue controller creates HuginnRun (attempt N)
   ─▶ HuginnRun controller creates K8s Job → Pod (agent-runtime image)
   ─▶ Pod runs claude_skill.sh → claude-agent-sdk loop ─▶ PR / GitHub Issue
```

`HuginnAgent` = one managed app (the "Application"). `HuginnIssue` = one event. `HuginnRun` = one execution. The operator only creates Jobs; the agent process and Muninn API report progress back into `HuginnRun.status`.

**Status field ownership (`HuginnRunStatus`) — do not violate.** Fields are split across three writers (`operator-design.md §2.2`): Operator owns `phase`/`startedAt`/`finishedAt`/`jobName`/caps/`conditions`; the Agent→API owns `step`/`cost`/`tokens`/`output`; the API owns the `AwaitingApproval` transition + `approval`. The operator therefore writes status with `r.Status().Patch(ctx, run, client.MergeFrom(base))` (never a full update) so it can't clobber the other writers' fields. Preserve this when touching reconcilers.

**Retry is not pod-level.** Jobs are created with `backoffLimit=0`. Retries happen by the `HuginnIssue` controller creating a *new attempt* `HuginnRun`, bounded by `retryPolicy.maxRuns` with backoff. Agent runs are non-idempotent, so never re-enable pod restarts.

**`JobTemplate` is a curated slim subset, not a full PodSpec** (`huginnrun_types.go`). Embedding a full `corev1.PodSpec` blows the CRD OpenAPI schema past the 256KB client-side-apply annotation limit. `buildJobTemplate` (helpers.go) fills the slim recipe from Agent+Issue; `expandPodSpec` (huginnrun_controller.go) adds the fixed fields (restartPolicy=Never, container name, `~/.claude` volume mount, non-root securityContext) to produce the real PodSpec.

**agent-runtime image contract** (`huginnAgentRuntime/`): runs **non-root** (`node`, uid 1000) because the `claude` CLI refuses `--dangerously-skip-permissions` as root; `~/.claude` is `/home/node/.claude` (the operator's `claudeMountPath` must match). Entry is `claude_skill.sh` with modes `run` (live) / `selftest` (offline tool+SDK wiring check, no API call). `runner.py` drives `claude-agent-sdk`, which spawns the `claude` CLI found on `PATH` — so both the npm CLI and the Python SDK are required. Guardrail mapping: `maxIterations→max_turns`, `maxCostUsd→max_budget_usd` (`maxTokens` is platform-tracked, no SDK field).

**Auth is env(Secret)-only.** The operator injects `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` from the `agent-secrets` Secret (both `optional` — runtime requires at least one), and `GITHUB_PAT` from the app's `source.secretRef` Secret (key `token`, a *separate* Secret). Never put credentials in images, manifests, or the web mock. The `SELFTEST` sentinel (`ANTHROPIC_API_KEY=SELFTEST` or `MUNINN_SELFTEST=1`) runs the runtime offline for pipeline QA without a real key.

**muninnWeb = Muninn API (gateway + memory + console).** Per `docs/design/muninn-goal-conversational-delegation.md`, muninnWeb's `app/api/**` is the real Muninn API: it creates/patches HuginnIssue/HuginnRun CRs (`@kubernetes/client-node`, `lib/k8s.ts`), stores/recalls memory in **external postgres via Drizzle ORM** (`lib/db.ts`, schema `lib/schema.ts`; **text search** `to_tsvector`/`ts_rank_cd` — no embeddings/pgvector, so any postgres/CNPG image works; DB external via `DATABASE_URL`, recommended provision = CloudNativePG, `deploy/quickstart`), and receives agent reports. The CopilotKit copilot is the operator's conversational orchestrator (recall → delegate → poll → store/summarize) via **server tools** (`defineTool`), with navigation as frontend tools. (Migration in progress — some legacy pages/routes still render from `lib/data.ts` (`HM_DATA`) until each is wired to K8s/DB.)

## Commands

**huginnOperator/** (Go):
```bash
make build                 # build manager binary
make test                  # unit + envtest (Ginkgo/Gomega; downloads etcd/kube-apiserver)
make lint / make lint-fix  # golangci-lint
make manifests generate    # REQUIRED after editing api/*_types.go or +kubebuilder markers
make run                   # run controllers against current kubeconfig (set ENABLE_WEBHOOKS=false for local; webhook needs certs)
# single pure unit test (no envtest):
go test ./internal/controller/ -run TestBuildJobTemplate -count=1
```

**Local end-to-end on kind** (from `huginnOperator/`, podman recommended):
```bash
make run-kind CONTAINER_TOOL=podman   # kind create + install CRDs + build/load agent-runtime image + run operator
# then in another shell:
kubectl -n ns-huginn-e2e create secret generic agent-secrets --from-literal=claude-code-oauth-token="$CLAUDE_CODE_OAUTH_TOKEN"
kubectl apply -f ../huginnAgentRuntime/examples/kind-e2e.yaml
make kind-delete CONTAINER_TOOL=podman
make test-e2e                          # isolated kind e2e (separate cluster: huginnoperator-test-e2e)
```

**huginnAgentRuntime/** (image — Podman, not Docker):
```bash
podman build -t ghcr.io/kimsoungryoul/muninn/agent-runtime:dev .
podman run --rm ghcr.io/kimsoungryoul/muninn/agent-runtime:dev selftest   # offline wiring check
# CI publishes ghcr.io/kimsoungryoul/muninn/agent-runtime via .github/workflows/agent-runtime-image.yml
# (PR = build only; push to main/tag = multi-arch push)
```

**muninnWeb/** (Next.js, port 3030 — **pnpm**, `packageManager` 핀):
```bash
pnpm install
pnpm dev           # http://localhost:3030
pnpm build         # production build = the typecheck gate (tsc runs here)
pnpm lint
# 코파일럿(CopilotKit) 동작엔 자격 env 필요: CLAUDE_CODE_OAUTH_TOKEN 또는 ANTHROPIC_API_KEY
# (선택) COPILOT_MODEL 로 모델 override(기본 claude-haiku-4-5-20251001)
```

## Conventions

- **Podman, not Docker** — the container runtime throughout (kind uses `KIND_EXPERIMENTAL_PROVIDER=podman`; pass `CONTAINER_TOOL=podman` to operator make targets).
- **No company-identifying info** in this repo — use neutral placeholders (`acme`, etc.) for org/repo/host names in examples and mock data.
- **Naming:** the architecture figure's misspelled `huggin`/`hugginSession` are canonicalized to **Huginn**; the event CR is `HuginnIssue` (not `HuginnSession`, to avoid clashing with the Claude SDK "session"). Kinds: `HuginnAgent` / `HuginnIssue` / `HuginnRun`.
- **kubebuilder generated files are off-limits** (`config/crd/bases/*`, `config/rbac/role.yaml`, `**/zz_generated.*`, `PROJECT`) — regenerate via `make manifests generate`; never hand-edit. See `huginnOperator/AGENTS.md` for full kubebuilder mechanics.
- The architecture diagram source is `muninn아키텍처.drawio` (two pages: original design + "현재 구현"); `muninnAgentPlatform_architecture.png` is a rendered snapshot.
