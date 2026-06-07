"use client";

// CopilotKit v2 provider 의 client 래퍼.
//
// react-core/v2 index 는 "use client" + `export *` 로 구성돼 있어, 서버 컴포넌트(layout)에서
// 직접 import 하면 Next.js 14 flight loader 가 "export * in a client boundary" 로 거부한다.
// provider 를 이 client 컴포넌트로 감싸 v2 모듈이 client→client import 로만 도달하게 한다.

import { CopilotKit } from "@copilotkit/react-core/v2";

export function CopilotRoot({ children }: { children: React.ReactNode }) {
  return (
    // enableInspector=false — 개발용 "Web Inspector" 버튼 + 상단 프로모 배너 제거(콘솔 UI 정돈).
    <CopilotKit runtimeUrl="/api/copilotkit" enableInspector={false}>
      {children}
    </CopilotKit>
  );
}
