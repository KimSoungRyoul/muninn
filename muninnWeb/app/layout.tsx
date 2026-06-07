// CopilotKit v2 스타일을 먼저 import — Tailwind v4 preflight 는 @layer base 라
// unlayered 인 muninn 의 tokens/styles/hm-theme 가 충돌 시 우선한다(blast radius 최소화).
import "@copilotkit/react-core/v2/styles.css";
import "./tokens.css";
import "./styles.css";
import "./hm-theme.css";
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
    <html lang="ko">
      <head>
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
