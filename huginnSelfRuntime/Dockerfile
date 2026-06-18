# huginn-self 런타임 이미지(설계 §9). 비-Claude(자체/오픈) 모델을 자체 Go agent loop 로 직접 구동하는
# 슬림 정적 바이너리. claude-code 런타임(huginnAgentRuntime, Node+Python+claude CLI, ~1.3GB)과 대조되는
# 경량 백엔드 — 범용 인터프리터(python/node) 미설치(§6.2-1, 공격 표면 축소).
#
# 비-root(uid 1000=node, operator agentRunAsUser 와 일치) + ca-certificates(HTTPS 게이트웨이 TLS).
# 현 단계는 text-only(도구 루프 미구현) — 운영 CLI(kubectl/helm/argocd/gh/yq) 전체 설치는 read-only→
# mutating tool 단계(후속)에서 추가한다(인터프리터 미설치 원칙은 유지). base 는 레포 컨벤션(Docker Hub,
# 기존 agent-runtime 이미지와 동일 계열)을 따른다 — 사내 배포 시 mona-public p_success base 로 치환.
FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/huginn-self .

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /usr/sbin/nologin node \
    && mkdir -p /home/node/.huginn /workspace \
    && chown -R node:node /home/node /workspace
COPY --from=build /out/huginn-self /usr/local/bin/huginn-self
ENV HOME=/home/node
WORKDIR /workspace
USER node
LABEL org.opencontainers.image.title="huginn-self-runtime" \
      org.opencontainers.image.description="Huginn self runtime: slim Go agent loop for non-Claude/open models (OpenAI-compatible)" \
      org.opencontainers.image.source="https://github.com/KimSoungRyoul/muninn" \
      org.opencontainers.image.licenses="Apache-2.0"
# Job 이 command 로 덮어쓰지만(operator buildJobTemplate), 이미지 단독 실행도 가능하게 ENTRYPOINT 지정.
ENTRYPOINT ["/usr/local/bin/huginn-self"]
