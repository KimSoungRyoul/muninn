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

export function defaultCredentials(app: Application): CredentialRef[] {
  if (app.credentials) return app.credentials;
  const hasArgo = app.kind !== "airflow";
  return [
    {
      key: "claude-code-oauth-token", label: "Claude Code OAuth Token", kind: "oauth",
      required: true, set: true, updatedAt: "2026-05-09T10:00:00+09:00",
      hint: "Pro/Max/team OAuth (ANTHROPIC_API_KEY 대안, 둘 중 하나 필수)",
    },
    {
      key: "anthropic-api-key", label: "Anthropic API Key", kind: "apikey",
      set: false, updatedAt: null,
      hint: "OAuth 토큰이 등록돼 있으면 생략 가능",
    },
    {
      key: "github-pat", label: "GitHub PAT", kind: "pat",
      required: true, set: true, updatedAt: "2026-05-09T10:00:00+09:00",
      hint: "fine-grained PAT — 해당 repo PR 생성 권한만",
    },
    {
      key: "kubeconfig", label: "kubeconfig", kind: "kubeconfig",
      set: false, updatedAt: null,
      hint: "kubectl 컨텍스트 (YAML 파일 업로드)",
    },
    {
      key: "argocd-auth-token", label: "ArgoCD Token", kind: "token",
      set: hasArgo, updatedAt: hasArgo ? "2026-05-12T09:00:00+09:00" : null,
      hint: "argocd CLI 인증 (ARGOCD_AUTH_TOKEN)",
    },
  ];
}
