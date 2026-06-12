# Muninn 플랫폼 루트 Makefile.
#
# 두 가지 역할:
#  1) 하위 프로젝트(huginnOperator/ · huginnAgentRuntime/ · muninnWeb/)로 위임하는
#     일관된 어휘(build · image · lint · test · help)를 한곳에서 노출한다.
#  2) `make run-local` — kind 클러스터를 만들고, 세 이미지를 로컬 빌드해서 적재한 뒤,
#     Helm 으로 플랫폼 전체를 클러스터 *안* 에 띄운다(operator + web + metaDB).
#
# 컨테이너 런타임은 Podman 기본(이 레포 규약 — Docker 아님). kind 는 podman provider 를 쓴다.
# operator 의 `make run-kind` 와의 차이: run-kind 는 operator 를 클러스터 *밖*(host `go run`)으로
# 띄우는 빠른 개발 루프이고, run-local 은 helm 으로 operator 까지 클러스터 *안* 에 배포한다.

SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

# ── 전역 도구/런타임 ──────────────────────────────────────────────────────────
CONTAINER_TOOL ?= podman
KIND     ?= kind
KUBECTL  ?= kubectl
HELM     ?= helm

# podman 으로 kind 를 쓸 때 provider 를 지정한다(kind 기본은 docker).
ifeq ($(CONTAINER_TOOL),podman)
export KIND_EXPERIMENTAL_PROVIDER = podman
endif

# ── run-local 설정 ───────────────────────────────────────────────────────────
CLUSTER   ?= muninn-local
NAMESPACE ?= muninn
RELEASE   ?= muninn
CHART     ?= deploy/helm/muninn

# 이미지 좌표(로컬 빌드 → kind load). 완전수식 이름이라 podman 도 localhost/ 접두 없이 보존한다.
REGISTRY ?= ghcr.io/kimsoungryoul/muninn
TAG      ?= dev
OPERATOR_REPO ?= $(REGISTRY)/huginn-operator
WEB_REPO      ?= $(REGISTRY)/muninn-web
RUNTIME_REPO  ?= $(REGISTRY)/agent-runtime
OPERATOR_IMG  ?= $(OPERATOR_REPO):$(TAG)
WEB_IMG       ?= $(WEB_REPO):$(TAG)
RUNTIME_IMG   ?= $(RUNTIME_REPO):$(TAG)
ALL_IMAGES    ?= $(OPERATOR_IMG) $(WEB_IMG) $(RUNTIME_IMG)

# helm 추가 인자(예: HELM_EXTRA_ARGS='--set operator.webhook.enabled=true').
HELM_EXTRA_ARGS ?=

.PHONY: all
all: help

##@ General

.PHONY: help
help: ## 이 도움말 출력.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ 하위 프로젝트 위임 (일관 어휘)

.PHONY: run-docs
run-docs: ## 문서 사이트 dev 서버(http://localhost:3031). 의존성 없으면 설치 후 기동.
	@test -d muninnDocs/node_modules || $(MAKE) -C muninnDocs install
	$(MAKE) -C muninnDocs dev

.PHONY: build
build: ## operator 바이너리 + web(next build) 빌드.
	$(MAKE) -C huginnOperator build
	$(MAKE) -C muninnWeb build

.PHONY: lint
lint: ## 세 프로젝트 린트.
	$(MAKE) -C huginnOperator lint
	$(MAKE) -C muninnWeb lint
	$(MAKE) -C huginnAgentRuntime lint

.PHONY: test
test: ## operator 단위/envtest + runtime selftest(오프라인). (envtest 는 바이너리 다운로드 — 무거움)
	$(MAKE) -C huginnOperator test
	$(MAKE) -C huginnAgentRuntime selftest

.PHONY: images
images: ## 세 컨테이너 이미지 로컬 빌드(Podman 기본).
	$(MAKE) -C huginnOperator     image CONTAINER_TOOL=$(CONTAINER_TOOL) IMG=$(OPERATOR_IMG)
	$(MAKE) -C muninnWeb          image CONTAINER_TOOL=$(CONTAINER_TOOL) IMG=$(WEB_IMG)
	$(MAKE) -C huginnAgentRuntime image CONTAINER_TOOL=$(CONTAINER_TOOL) IMG=$(RUNTIME_IMG)

##@ 로컬 풀스택 (kind + helm)

.PHONY: run-local
run-local: kind-create images kind-load metadb-up secrets helm-install ## kind 생성 → 이미지 3종 빌드/적재 → metaDB → helm install(클러스터 안 전체 기동).
	@echo ""
	@echo ">> Muninn 풀스택 기동 완료 (cluster=$(CLUSTER), ns=$(NAMESPACE), release=$(RELEASE))."
	@echo ">> 콘솔 접속:"
	@echo ">>   $(KUBECTL) -n $(NAMESPACE) port-forward svc/$(RELEASE)-web 3030:3030"
	@echo ">>   open http://localhost:3030"
	@echo ">> 상태 확인:  make status"
	@echo ">> 정리:       make down"

.PHONY: kind-create
kind-create: ## kind 클러스터 생성(있으면 스킵) + kubectl 컨텍스트 전환.
	@$(KIND) get clusters 2>/dev/null | grep -qx $(CLUSTER) \
		&& echo ">> kind '$(CLUSTER)' 이미 존재" \
		|| $(KIND) create cluster --name $(CLUSTER) --wait 120s
	@$(KUBECTL) config use-context kind-$(CLUSTER) >/dev/null

.PHONY: kind-delete down
kind-delete down: ## kind 클러스터 삭제(로컬 풀스택 정리).
	-$(KIND) delete cluster --name $(CLUSTER)

.PHONY: kind-load
kind-load: ## 빌드된 이미지 3종을 kind 노드에 적재.
ifeq ($(CONTAINER_TOOL),podman)
	@set -e; for img in $(ALL_IMAGES); do \
		echo ">> load(podman) $$img"; \
		tar="$$(mktemp "$${TMPDIR:-/tmp}/muninn-img.XXXXXX")"; \
		$(CONTAINER_TOOL) save "$$img" -o "$$tar"; \
		$(KIND) load image-archive "$$tar" --name $(CLUSTER); \
		rm -f "$$tar"; \
	done
else
	@set -e; for img in $(ALL_IMAGES); do \
		echo ">> load(docker) $$img"; \
		$(KIND) load docker-image "$$img" --name $(CLUSTER); \
	done
endif

.PHONY: namespace
namespace: ## 릴리스 namespace 보장(idempotent).
	@$(KUBECTL) get ns $(NAMESPACE) >/dev/null 2>&1 \
		|| $(KUBECTL) create namespace $(NAMESPACE)

.PHONY: metadb-up
metadb-up: namespace ## 로컬 metaDB(postgres) + 연결 Secret(muninn-metadb, key=uri) 배포.
	$(KUBECTL) -n $(NAMESPACE) apply -f deploy/local/metadb-postgres.yaml
	@$(KUBECTL) -n $(NAMESPACE) create secret generic muninn-metadb \
		--from-literal=uri="postgres://muninn:muninn@muninn-metadb.$(NAMESPACE).svc:5432/muninn" \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(KUBECTL) -n $(NAMESPACE) rollout status deploy/muninn-metadb --timeout=120s

.PHONY: secrets
secrets: namespace ## (옵션) CLAUDE_CODE_OAUTH_TOKEN 있으면 agent/web 자격 Secret 생성.
	@if [ -n "$$CLAUDE_CODE_OAUTH_TOKEN" ]; then \
		for s in agent-secrets muninn-web-secrets; do \
			$(KUBECTL) -n $(NAMESPACE) create secret generic $$s \
				--from-literal=claude-code-oauth-token="$$CLAUDE_CODE_OAUTH_TOKEN" \
				--dry-run=client -o yaml | $(KUBECTL) apply -f - >/dev/null; \
		done; \
		echo ">> 자격 Secret 생성(agent-secrets, muninn-web-secrets)."; \
	else \
		echo ">> CLAUDE_CODE_OAUTH_TOKEN 미설정 — 자격 없이 설치(코파일럿/agent 비활성)."; \
		echo ">>   나중에: kubectl -n $(NAMESPACE) create secret generic muninn-web-secrets --from-literal=claude-code-oauth-token=\$$CLAUDE_CODE_OAUTH_TOKEN"; \
		echo ">>          kubectl -n $(NAMESPACE) create secret generic agent-secrets   --from-literal=claude-code-oauth-token=\$$CLAUDE_CODE_OAUTH_TOKEN"; \
		echo ">>          helm upgrade $(RELEASE) $(CHART) -n $(NAMESPACE) --reuse-values --set web.auth.existingSecret=muninn-web-secrets"; \
	fi

.PHONY: helm-install
helm-install: ## chart 설치/업그레이드(로컬 이미지 + metaDB 배선).
	$(HELM) upgrade --install $(RELEASE) $(CHART) -n $(NAMESPACE) --create-namespace \
		--set operator.image.repository=$(OPERATOR_REPO) \
		--set operator.image.tag=$(TAG) \
		--set operator.image.pullPolicy=IfNotPresent \
		--set web.image.repository=$(WEB_REPO) \
		--set web.image.tag=$(TAG) \
		--set web.image.pullPolicy=IfNotPresent \
		--set agent.image.repository=$(RUNTIME_REPO) \
		--set agent.image.tag=$(TAG) \
		--set metaDb.enabled=true \
		--set metaDb.existingSecret=muninn-metadb \
		--set web.auth.existingSecret=muninn-web-secrets \
		$(HELM_EXTRA_ARGS)

.PHONY: helm-uninstall
helm-uninstall: ## chart 만 제거(클러스터는 유지, CRD 는 보존).
	-$(HELM) uninstall $(RELEASE) -n $(NAMESPACE)

.PHONY: status
status: ## 로컬 풀스택 리소스 상태.
	@$(KUBECTL) -n $(NAMESPACE) get deploy,svc,pod,huginnagent,huginnissue,huginnrun 2>/dev/null \
		|| $(KUBECTL) -n $(NAMESPACE) get deploy,svc,pod
