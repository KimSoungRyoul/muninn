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
# kubectl 은 비우면 dl.k8s.io/release/stable.txt 의 최신 stable 을 사용(항상 유효한 태그 보장).
ARG KUBECTL_VERSION=""
ARG HELM_VERSION="v3.16.4"
ARG ARGOCD_VERSION="v2.13.3"
ARG GH_VERSION="2.63.2"
ARG YQ_VERSION="v4.44.6"
ARG CLAUDE_CODE_VERSION="latest"
# buildx 가 주입(미지정 시 dpkg 로 폴백)
ARG TARGETARCH=""

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/opt/agent-venv/bin:${PATH}"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# 1) OS 패키지: 다운로드/git/JSON·YAML 처리/Python venv
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl git jq tar gzip unzip bash less openssh-client \
      python3 python3-venv; \
    rm -rf /var/lib/apt/lists/*

# 2) kubectl — 비우면 최신 stable 태그를 조회
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    ver="${KUBECTL_VERSION:-$(curl -fsSL https://dl.k8s.io/release/stable.txt)}"; \
    curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${ver}/bin/linux/${arch}/kubectl"; \
    chmod +x /usr/local/bin/kubectl; \
    kubectl version --client

# 3) helm
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${arch}.tar.gz" | tar -xz -C /tmp; \
    mv "/tmp/linux-${arch}/helm" /usr/local/bin/helm; \
    rm -rf "/tmp/linux-${arch}"; \
    helm version

# 4) argocd CLI
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    curl -fsSLo /usr/local/bin/argocd \
      "https://github.com/argoproj/argo-cd/releases/download/${ARGOCD_VERSION}/argocd-linux-${arch}"; \
    chmod +x /usr/local/bin/argocd; \
    argocd version --client

# 5) GitHub CLI(gh) — PR/Issue 출력 보조
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${arch}.tar.gz" \
      | tar -xz -C /tmp; \
    mv "/tmp/gh_${GH_VERSION}_linux_${arch}/bin/gh" /usr/local/bin/gh; \
    rm -rf "/tmp/gh_${GH_VERSION}_linux_${arch}"; \
    gh --version

# 6) yq(mikefarah) — YAML 매니페스트 처리
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    curl -fsSLo /usr/local/bin/yq \
      "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${arch}"; \
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
