# muninnDocs — Nextra 4 문서 사이트(정적 export → GitHub Pages).
# 패키지 매니저는 pnpm(packageManager 핀). 일관 어휘(루트 Makefile 과 동일): build · help.
# ⚠️ `pnpm dev` 실행 중에는 `make build`(=pnpm build)를 돌리지 말 것 — .next 가 손상된다.

SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

PNPM ?= pnpm
PORT ?= 3031

.PHONY: all
all: build

.PHONY: help
help: ## 이 도움말 출력.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

.PHONY: install
install: ## 의존성 설치(frozen lockfile).
	$(PNPM) install --frozen-lockfile

.PHONY: sync
sync: ## docs/design/ → content/design/ 동기화(빌드/개발 전 자동 실행됨).
	$(PNPM) sync

.PHONY: dev
dev: ## 개발 서버(http://localhost:$(PORT)). 검색(pagefind)은 build 산출물에서만 동작.
	$(PNPM) dev

.PHONY: build
build: ## 정적 export 빌드(out/) + pagefind 검색 인덱스 생성.
	$(PNPM) build

.PHONY: build-pages
build-pages: ## GitHub Pages 와 동일한 basePath(/muninn)로 빌드 — QA 는 serve-pages 로.
	NEXT_PUBLIC_BASE_PATH=/muninn $(PNPM) build

.PHONY: serve
serve: ## `make build`(basePath 없음) 산출물 서빙(http://localhost:$(PORT)). build-pages 산출물엔 serve-pages 사용.
	npx serve@latest out -l $(PORT)

.PHONY: serve-pages
serve-pages: ## `make build-pages` 산출물을 GitHub Pages 처럼 /muninn prefix 로 서빙(http://localhost:$(PORT)/muninn/).
	@rm -rf .pages-root && mkdir .pages-root && ln -s ../out .pages-root/muninn
	npx serve@latest .pages-root -l $(PORT)

.PHONY: test
test: build ## build(타입체크 게이트) 별칭 — 별도 단위 테스트 없음.
