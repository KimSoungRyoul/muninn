// CopilotKit v2 스타일을 먼저 import — Tailwind v4 preflight 는 @layer base 라
// unlayered 인 muninn 의 tokens/styles/hm-theme 가 충돌 시 우선한다(blast radius 최소화).
import "@copilotkit/react-core/v2/styles.css";
import "./tokens.css";
import "./styles.css";
import "./hm-theme.css";
// 반응형 레이어는 마지막에 — 동일 specificity 충돌 시 우선해야 한다.
import "./responsive.css";
import type { Metadata } from "next";
import { CopilotRoot } from "@/components/copilot-root";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Muninn — DevOps Agent Platform",
  description: "Muninn DevOps Agent Platform console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 인라인 스크립트가 페인트 전에 <html> 의 data-theme/.dark 를 칠하므로
    // 서버 마크업과 달라진다 — suppressHydrationWarning 으로 <html> 속성 경고를 억제(next-themes 패턴).
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 테마 pre-hydration: 페인트 전에 <html> data-theme 를 칠해 다크모드 FOUC 를 막는다.
            저장된 선택(muninn-theme) 우선, 없으면 시스템 prefers-color-scheme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=localStorage.getItem('muninn-theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var r=(m==='light'||m==='dark')?m:s;document.documentElement.setAttribute('data-theme',r);document.documentElement.classList.toggle('dark',r==='dark');}catch(e){}})();",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
          rel="stylesheet"
        />
      </head>
      <body>
        <CopilotRoot>
          <WorkspaceProvider>
            <AppShell>{children}</AppShell>
          </WorkspaceProvider>
        </CopilotRoot>
      </body>
    </html>
  );
}
