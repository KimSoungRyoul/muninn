# muninnWeb — Next.js 콘솔 + Muninn API. 패키지 매니저는 pnpm(packageManager 핀).
# 컨테이너 런타임은 Podman(Docker 아님).
#
# 일관 어휘(루트 Makefile 과 동일): build · image · lint · test · help.
# ⚠️ `pnpm dev` 실행 중에는 `make build`(=pnpm build)를 돌리지 말 것 — .next 가 손상된다.

SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

CONTAINER_TOOL ?= podman
PNPM ?= pnpm
IMG ?= ghcr.io/kimsoungryoul/muninn/muninn-web:dev
PORT ?= 3030

.PHONY: all
all: build

.PHONY: help
help: ## 이 도움말 출력.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

.PHONY: install
install: ## 의존성 설치(frozen lockfile).
	$(PNPM) install --frozen-lockfile

.PHONY: dev
dev: ## 개발 서버(http://localhost:$(PORT)).
	$(PNPM) dev

.PHONY: build
build: ## 프로덕션 빌드(= tsc 타입체크 게이트).
	$(PNPM) build

.PHONY: lint
lint: ## next lint.
	$(PNPM) lint

.PHONY: test
test: build ## build(타입체크 게이트) 별칭 — 별도 단위 테스트 없음.

.PHONY: image
image: ## muninn-web 이미지 빌드(Next.js standalone).
	$(CONTAINER_TOOL) build -t $(IMG) .
