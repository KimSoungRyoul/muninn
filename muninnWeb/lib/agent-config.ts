// HuginnAgent 런타임 설정/자격의 표현 계층 헬퍼.
// Application 에 agent/credentials 가 없을 때 조회용 기본값을 seed 한다(데모 mock).
// 실제 값은 K8s Secret 으로만 보관되며, 이 모듈은 메타데이터(등록 여부/갱신시각)만 다룬다.

import type { AgentRuntimeConfig, Application, CredentialRef } from "./types";

// agent-runtime 이미지(huginnAgentRuntime/, GitHub Packages). HuginnRun 이 이 이미지로 SDK 를 실행한다.
export const DEFAULT_RUNTIME_IMAGE = "ghcr.io/kimsoungryoul/muninn/agent-runtime:0.1.0";

// 인증/자격이 저장되는 K8s Secret 이름(§5.1, §6.2).
export const AGENT_SECRET_NAME = "agent-secrets";

export function defaultAgentConfig(app: Application): AgentRuntimeConfig {
  if (app.agent) return app.agent;
  return {
    image: DEFAULT_RUNTIME_IMAGE,
    runtime: "claude-code",
    soulRef: `soul-${app.name}`,
    argocdServer: app.kind === "airflow" ? "" : "argocd.platform.local",
  };
}

// GitHub PAT 는 agent-secrets 가 아니라 별도 source.secretRef Secret(키 'token')에 보관된다(operator helpers.go).
export function ghPatSecretName(app: Application): string {
  return `gh-${app.workspaceId.replace(/^ws[_-]?/, "") || app.name}-pat`;
}

export function defaultCredentials(app: Application): CredentialRef[] {
  if (app.credentials) return app.credentials;
  const hasArgo = app.kind !== "airflow";
  return [
    {
      // OAuth/API Key 는 '둘 중 하나' 필수 — 개별 required 로 표시하지 않는다(오해 방지).
      key: "claude-code-oauth-token", label: "Claude Code OAuth Token", kind: "oauth",
      secretName: AGENT_SECRET_NAME, set: true, updatedAt: "2026-05-09T10:00:00+09:00",
      hint: "Pro/Max/team OAuth · ANTHROPIC_API_KEY 와 둘 중 하나 필수",
    },
    {
      key: "anthropic-api-key", label: "Anthropic API Key", kind: "apikey",
      secretName: AGENT_SECRET_NAME, set: false, updatedAt: null,
      hint: "OAuth 토큰과 둘 중 하나 필수",
    },
    {
      // operator 는 GITHUB_PAT 를 source.secretRef Secret(키 'token')에서 주입한다.
      key: "token", label: "GitHub PAT", kind: "pat",
      secretName: ghPatSecretName(app), required: true, set: true, updatedAt: "2026-05-09T10:00:00+09:00",
      hint: "fine-grained PAT — 해당 repo PR 생성 권한만 (source.secretRef)",
    },
    {
      key: "kubeconfig", label: "kubeconfig", kind: "kubeconfig",
      secretName: AGENT_SECRET_NAME, set: false, updatedAt: null,
      hint: "kubectl 컨텍스트 (YAML 업로드) · 런타임이 KUBECONFIG 로 사용",
    },
    {
      key: "argocd-auth-token", label: "ArgoCD Token", kind: "token",
      secretName: AGENT_SECRET_NAME, set: hasArgo, updatedAt: hasArgo ? "2026-05-12T09:00:00+09:00" : null,
      hint: "argocd CLI 인증 (ARGOCD_AUTH_TOKEN)",
    },
  ];
}
