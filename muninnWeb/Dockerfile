# muninnWeb 프로덕션 이미지 — Next.js standalone 출력 기반(멀티스테이지).
# 빌드: podman build -t ghcr.io/kimsoungryoul/muninn/muninn-web:dev .
# (이 레포는 Podman 을 컨테이너 런타임으로 쓴다 — Docker 아님.)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV COPILOTKIT_TELEMETRY_DISABLED=true
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV COPILOTKIT_TELEMETRY_DISABLED=true
# kind/컨테이너에서 외부 바인딩 + 포트(프로토타입 dev 포트와 동일하게 3030).
ENV PORT=3030
ENV HOSTNAME=0.0.0.0
# 비root 실행(agent-runtime 와 동일한 보안 원칙).
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# standalone 서버 + 정적 자산(standalone 은 .next/static 을 포함하지 않으므로 별도 복사).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3030
CMD ["node", "server.js"]
