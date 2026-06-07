# huginnAgentRuntime — agent-runtime 컨테이너 이미지 빌드/점검.
# 이 레포 규약상 컨테이너 런타임은 Podman(Docker 아님).
#
# 일관 어휘(루트 Makefile 과 동일): build · image · lint · test · help.
# 산출물은 컨테이너 이미지뿐이라 build=image, test=selftest 별칭으로 둔다.

SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

CONTAINER_TOOL ?= podman
IMG ?= ghcr.io/kimsoungryoul/muninn/agent-runtime:dev

.PHONY: all
all: image

.PHONY: help
help: ## 이 도움말 출력.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

.PHONY: image
image: ## agent-runtime 이미지 빌드.
	$(CONTAINER_TOOL) build -t $(IMG) .

.PHONY: build
build: image ## image 별칭(일관 어휘).

.PHONY: selftest
selftest: image ## 오프라인 배선 점검(tool+SDK, API 호출 없음).
	$(CONTAINER_TOOL) run --rm $(IMG) selftest

.PHONY: test
test: selftest ## selftest 별칭(일관 어휘).

.PHONY: lint
lint: ## (있으면) hadolint 로 Dockerfile 린트. 없으면 스킵.
	@if command -v hadolint >/dev/null 2>&1; then \
		hadolint Dockerfile; \
	else \
		echo ">> hadolint 미설치 — Dockerfile 린트 스킵"; \
	fi

.PHONY: push
push: ## 이미지 push(보통 CI 가 수행 — 로컬 수동 push 용).
	$(CONTAINER_TOOL) push $(IMG)
