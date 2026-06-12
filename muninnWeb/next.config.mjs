/** @type {import('next').NextConfig} */
const nextConfig = {
  // 프로토타입 effect 이중 실행 방지(검토용)
  reactStrictMode: false,
  // 컨테이너(kind) 배포용 — .next/standalone 자체 실행 서버 생성.
  output: "standalone",
  // DB 드라이버(pg)·K8s 클라이언트는 동적 require(pg-native optional, kubeconfig 등)를 쓰므로
  // Next 의 서버 번들에서 제외하고 런타임 require 로 둔다. (외부 임베딩/onnxruntime 은 제거됨 —
  // 검색은 postgres 텍스트 검색 전용.)
  // Next 15: experimental.serverComponentsExternalPackages → 최상위 serverExternalPackages.
  serverExternalPackages: ["pg", "@kubernetes/client-node"],
  async rewrites() {
    return [
      // A2A 표준 디스커버리 경로(/.well-known/agent-card.json) → 내부 card 라우트.
      // 설계: docs/design/muninn-a2a-integration.md §5. 닷(.)으로 시작하는 App Router 폴더 회피.
      {
        source: "/a2a/agents/:app/.well-known/agent-card.json",
        destination: "/a2a/agents/:app/card",
      },
    ];
  },
};

export default nextConfig;
