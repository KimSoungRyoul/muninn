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
};

export default nextConfig;
