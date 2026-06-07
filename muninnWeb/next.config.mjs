/** @type {import('next').NextConfig} */
const nextConfig = {
  // 프로토타입 effect 이중 실행 방지(검토용)
  reactStrictMode: false,
  // 컨테이너(kind) 배포용 — .next/standalone 자체 실행 서버 생성.
  output: "standalone",
};

export default nextConfig;
