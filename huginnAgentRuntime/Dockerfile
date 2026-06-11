# Huginn agent-runtime — HuginnRun(Job/Pod)이 실행하는 에이전트 컨테이너.
# 아키텍처 그림의 "Huginn Run" + "claude_skill.sh" 박스(설계서 §5).
# claude code CLI + Claude Agent SDK(Python) + 플랫폼 운영 CLI(kubectl/helm/argocd/gh/yq)를 한 이미지에 담는다.
#
# 멀티아치(amd64/arm64): buildx 가 TARGETARCH 를 주입한다. 로컬 `podman build`(buildx 없음)에서는
# TARGETARCH 가 비어 dpkg --print-architecture 로 폴백한다.

# Claude Code CLI 는 Node 패키지(@anthropic-ai/claude-code)이고 Python SDK 는 이 CLI 를
# subprocess 로 띄우므로 Node 런타임이 항상 필요하다 → Node 베이스에 Python 을 더한다.
# Node 24 = 현재 LTS(최신 안정 라인).
FROM node:24-bookworm-slim

# --- 도구 버전(빌드 ARG 로 오버라이드 가능) ---
# 재현성·공급망 안전을 위해 모든 도구를 구체 버전으로 핀한다(브리프 MEDIUM).
# kubectl 은 과거 빈 값="최신 stable"이었으나, GHA 레이어 캐시(cache-from=gha)와 결합 시
# RUN 문자열이 안 바뀌면 옛 캐시 레이어가 재사용돼 '항상 최신' 의도와 어긋났다 → 기본 핀.
# '최신 stable 자동 추적'이 필요하면 CI 에서 조회해 --build-arg KUBECTL_VERSION=... 로 주입하라.
ARG KUBECTL_VERSION="v1.31.4"
ARG HELM_VERSION="v3.16.4"
ARG ARGOCD_VERSION="v2.13.3"
ARG GH_VERSION="2.63.2"
ARG YQ_VERSION="v4.44.6"
# claude code CLI 는 SDK 가 subprocess 로 의존하는 핵심 컴포넌트 → 재현성 위해 구체 버전 핀.
ARG CLAUDE_CODE_VERSION="2.1.167"
# buildx 가 주입(미지정 시 dpkg 로 폴백)
ARG TARGETARCH=""

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/opt/agent-venv/bin:${PATH}"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# 1) OS 패키지: 다운로드/git/JSON·YAML 처리/Python venv
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl git jq tar gzip bash less openssh-client \
      python3 python3-venv; \
    rm -rf /var/lib/apt/lists/*

# 2) kubectl — 핀된 버전 + 공식 .sha256 검증(공급망 안전, 브리프 MEDIUM)
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    ver="${KUBECTL_VERSION:-$(curl -fsSL https://dl.k8s.io/release/stable.txt)}"; \
    base="https://dl.k8s.io/release/${ver}/bin/linux/${arch}"; \
    curl -fsSLo /usr/local/bin/kubectl "${base}/kubectl"; \
    curl -fsSLo /tmp/kubectl.sha256 "${base}/kubectl.sha256"; \
    echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum -c -; \
    rm -f /tmp/kubectl.sha256; \
    chmod +x /usr/local/bin/kubectl; \
    kubectl version --client

# 3) helm — 공식 .sha256sum 검증 후 압축 해제
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    tgz="helm-${HELM_VERSION}-linux-${arch}.tar.gz"; \
    curl -fsSLo "/tmp/${tgz}" "https://get.helm.sh/${tgz}"; \
    curl -fsSLo "/tmp/${tgz}.sha256sum" "https://get.helm.sh/${tgz}.sha256sum"; \
    expected="$(awk '{print $1}' "/tmp/${tgz}.sha256sum")"; \
    echo "${expected}  /tmp/${tgz}" | sha256sum -c -; \
    tar -xz -C /tmp -f "/tmp/${tgz}"; \
    mv "/tmp/linux-${arch}/helm" /usr/local/bin/helm; \
    rm -rf "/tmp/linux-${arch}" "/tmp/${tgz}" "/tmp/${tgz}.sha256sum"; \
    helm version

# 4) argocd CLI — 릴리스 cli_checksums.txt 로 sha256 검증
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    rel="https://github.com/argoproj/argo-cd/releases/download/${ARGOCD_VERSION}"; \
    curl -fsSLo /usr/local/bin/argocd "${rel}/argocd-linux-${arch}"; \
    curl -fsSLo /tmp/argocd_checksums.txt "${rel}/cli_checksums.txt"; \
    expected="$(grep " argocd-linux-${arch}\$" /tmp/argocd_checksums.txt | awk '{print $1}')"; \
    test -n "${expected}"; \
    echo "${expected}  /usr/local/bin/argocd" | sha256sum -c -; \
    rm -f /tmp/argocd_checksums.txt; \
    chmod +x /usr/local/bin/argocd; \
    argocd version --client

# 5) GitHub CLI(gh) — 릴리스 checksums.txt 로 sha256 검증 후 압축 해제
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    rel="https://github.com/cli/cli/releases/download/v${GH_VERSION}"; \
    tgz="gh_${GH_VERSION}_linux_${arch}.tar.gz"; \
    curl -fsSLo "/tmp/${tgz}" "${rel}/${tgz}"; \
    curl -fsSLo /tmp/gh_checksums.txt "${rel}/gh_${GH_VERSION}_checksums.txt"; \
    expected="$(grep " ${tgz}\$" /tmp/gh_checksums.txt | awk '{print $1}')"; \
    test -n "${expected}"; \
    echo "${expected}  /tmp/${tgz}" | sha256sum -c -; \
    tar -xz -C /tmp -f "/tmp/${tgz}"; \
    mv "/tmp/gh_${GH_VERSION}_linux_${arch}/bin/gh" /usr/local/bin/gh; \
    rm -rf "/tmp/gh_${GH_VERSION}_linux_${arch}" "/tmp/${tgz}" /tmp/gh_checksums.txt; \
    gh --version

# 6) yq(mikefarah) — YAML 매니페스트 처리.
#    yq 의 checksums 파일은 다중 해시 컬럼 포맷이라(파일명 + 알고리즘별 컬럼) SHA-256 컬럼 위치를
#    checksums_hashes_order 에서 동적으로 찾아 검증한다(컬럼 순서 변경에 강건). 둘 다 받을 수 없는
#    환경이면 빌드를 실패시켜(test -n) unverified 바이너리가 섞이지 않게 한다(브리프 MEDIUM).
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    rel="https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}"; \
    curl -fsSLo /usr/local/bin/yq "${rel}/yq_linux_${arch}"; \
    curl -fsSLo /tmp/yq_order "${rel}/checksums_hashes_order"; \
    curl -fsSLo /tmp/yq_checksums "${rel}/checksums"; \
    sha_idx="$(grep -nx 'SHA-256' /tmp/yq_order | cut -d: -f1)"; \
    test -n "${sha_idx}"; \
    col="$((sha_idx + 1))"; \
    expected="$(grep "^yq_linux_${arch} " /tmp/yq_checksums | awk -v c="${col}" '{print $c}')"; \
    test -n "${expected}"; \
    echo "${expected}  /usr/local/bin/yq" | sha256sum -c -; \
    rm -f /tmp/yq_order /tmp/yq_checksums; \
    chmod +x /usr/local/bin/yq; \
    yq --version

# 7) Claude Code CLI(Node 전역). Python SDK 가 이 바이너리를 subprocess 로 호출한다.
RUN set -eux; \
    npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"; \
    npm cache clean --force; \
    claude --version

# 8) Claude Agent SDK(Python) + 런타임 의존성을 격리 venv 에 설치(PEP668 회피)
COPY agent/requirements.txt /opt/agent/requirements.txt
RUN set -eux; \
    python3 -m venv /opt/agent-venv; \
    /opt/agent-venv/bin/pip install --no-cache-dir --upgrade pip; \
    /opt/agent-venv/bin/pip install --no-cache-dir -r /opt/agent/requirements.txt; \
    python3 -c "import claude_agent_sdk; print('claude_agent_sdk', getattr(claude_agent_sdk, '__version__', 'ok'))"

# 9) 엔트리포인트 + 런너
COPY agent/runner.py /opt/agent/runner.py
COPY claude_skill.sh /usr/local/bin/claude_skill.sh
RUN set -eux; \
    chmod +x /usr/local/bin/claude_skill.sh; \
    mkdir -p /home/node/.claude /workspace; \
    chown -R node:node /home/node /workspace

# OCI 라벨 — ghcr 패키지를 repo 에 연결(org.opencontainers.image.source)
LABEL org.opencontainers.image.title="huginn-agent-runtime" \
      org.opencontainers.image.description="Huginn agent runtime: Claude Code + Claude Agent SDK + platform CLIs (kubectl/helm/argocd/gh/yq)" \
      org.opencontainers.image.source="https://github.com/KimSoungRyoul/muninn" \
      org.opencontainers.image.licenses="Apache-2.0"

# 비-root(node 사용자, uid 1000)로 실행한다. claude CLI 는 root 에서
# --dangerously-skip-permissions(permission_mode=bypassPermissions)를 거부하기 때문 + 보안.
ENV HOME=/home/node
WORKDIR /workspace
USER node

# Job 이 command:["/usr/local/bin/claude_skill.sh"] 로 덮어쓰지만 이미지 단독 실행도 가능하게 ENTRYPOINT 지정.
ENTRYPOINT ["/usr/local/bin/claude_skill.sh"]
