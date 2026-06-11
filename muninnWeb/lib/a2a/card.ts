// HuginnAgent CR → A2A Agent Card(순수 변환).
// 설계: docs/design/muninn-a2a-integration.md §4(V2)/§7. CR shape 은 lib/incidents.ts getApplicationCr 반환과 동일.

import type { A2AAgentCard, A2AAgentSkill } from "./types";

const A2A_PROTOCOL_VERSION = "0.3.0";

/**
 * HuginnAgent CR 을 A2A Agent Card 로 변환한다.
 * @param cr        HuginnAgent CR(any) — metadata.name + spec.{kind,output,source,guardrails,...}
 * @param baseUrl   muninnWeb 의 외부 base URL(예: https://muninn.example.com)
 */
export function huginnAgentToAgentCard(cr: any, baseUrl: string): A2AAgentCard {
  const name: string = cr?.metadata?.name ?? "unknown";
  const s = cr?.spec ?? {};
  const kind: string = s.kind ?? "other";
  const output: string = s.output ?? "pull_request";
  const repo: string = s.source?.repo ?? "";
  const base = baseUrl.replace(/\/+$/, "");

  const isIssue = output === "github_issue";
  const skills: A2AAgentSkill[] = [
    {
      id: "diagnose-incident",
      name: "인시던트 진단",
      description: "알람/이벤트를 조사해 근본원인과 조치 계획을 산출한다.",
      tags: ["k8s", "logs", "metrics", kind],
      examples: [`${name} 장애 조사`],
    },
    {
      id: isIssue ? "open-github-issue" : "open-remediation-pr",
      name: isIssue ? "GitHub 이슈 생성" : "조치 PR 생성",
      description:
        (isIssue ? "조사 결과로 GitHub 이슈를 생성한다." : "수정 사항을 담은 GitHub PR 을 생성한다.") +
        " (HITL 승인 게이트)",
      tags: ["github", output, ...(repo ? [repo] : [])],
      examples: [`${name} 조치안 ${isIssue ? "이슈" : "PR"} 생성`],
    },
  ];

  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: `huginn-${name}`,
    description: `${name} 앱의 Muninn DevOps 인시던트 에이전트 (kind=${kind})`,
    url: `${base}/a2a/agents/${encodeURIComponent(name)}`,
    preferredTransport: "JSONRPC",
    version: "1.0.0",
    capabilities: {
      streaming: true,
      pushNotifications: false, // PoC 미구현 — 설계 §6.1
      stateTransitionHistory: false, // Task.history 미채움 — 구현 전까지 false 로 현실 반영
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    securitySchemes: {
      "muninn-sa": { type: "http", scheme: "bearer", description: "서비스 계정 / OAuth bearer 토큰" },
    },
    security: [{ "muninn-sa": [] }],
    skills,
    provider: { organization: "Muninn", url: base },
  };
}

// 요청에서 외부 base URL 추정(프록시 헤더 우선, 없으면 host).
export function baseUrlFromRequest(req: Request): string {
  const url = new URL(req.url);
  // 다중 프록시 체인은 x-forwarded-* 를 콤마로 누적("https, http")하므로 첫(클라이언트에 가장 가까운) 값만 쓴다.
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const proto = first(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");
  const host = first(req.headers.get("x-forwarded-host")) ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
