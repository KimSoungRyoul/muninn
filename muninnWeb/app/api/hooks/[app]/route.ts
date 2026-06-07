import { NextRequest } from "next/server";
import { ok, notFound, severityGte } from "@/lib/api";
import { APPS, EVENTS } from "@/lib/data";
import { delegateIncident } from "@/lib/incidents";
import { k8sEnabled } from "@/lib/k8s";

// 설계 §4.3 정규화 + §4.4 dedup. POST /api/hooks/:app — 외부 모니터링(grafana 등) webhook 수신.
// 두 트리거 경로 중 webhook 경로(대화형 위임과 1급 동등): 정규화→severity gate→**실제 HuginnIssue 위임**.
// k8s 미연결(로컬)에서는 시뮬레이션 응답으로 graceful fallback.
export async function POST(req: NextRequest, { params }: { params: { app: string } }) {
  const body: any = await req.json().catch(() => ({}));

  const fingerprint = body.fingerprint || body.labels?.alertname || "Unknown";
  const severity = body.severity || body.labels?.severity || "warning";
  const title = body.title || body.annotations?.summary || "alert";
  const source: "grafana" | "airflow" | "argocd" = body.source || "grafana";
  const slug = String(fingerprint).toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const event = {
    id: "e_" + slug,
    source,
    severity,
    fingerprint,
    title,
    receivedAt: new Date().toISOString(),
    payload: body,
  };

  // severity gate(앱 임계값 MVP="warning").
  if (!severityGte(severity, "warning")) {
    return ok({ accepted: false, reason: "below-threshold", event, issueId: null, dedupCount: 0 });
  }

  // 진단 목표(webhook 은 운영자 프롬프트가 없으므로 이벤트에서 파생).
  const goal = `${fingerprint} 이벤트를 진단하고 output 정책에 따라 처리한다.`;

  if (!k8sEnabled()) {
    // 로컬: 실제 CR 생성 불가 → 정규화/dedup 시뮬레이션(콘솔 프로토타입 유지).
    const app: any = APPS.find((a) => a.name === params.app);
    if (!app) return notFound("application not found");
    const prior: any = EVENTS.find((e) => e.appId === app.id && e.fingerprint === fingerprint);
    return ok({
      accepted: true, reason: prior ? "recurrence" : "new", event,
      issueId: "issue-" + slug, dedupCount: prior ? prior.dedup + 1 : 0, persisted: false,
    });
  }

  // 실제 위임 — 대화형 경로와 동일한 delegateIncident(출처만 webhook).
  const res = await delegateIncident({
    app: params.app, goal, source, severity,
    fingerprint: `${source}:${slug}`, title,
  });
  if (!res.ok) {
    return ok({ accepted: false, reason: res.reason, event, issueId: null, error: res.error ?? null });
  }
  return ok({
    accepted: true, reason: "new", event,
    issueId: res.issueName, namespace: res.namespace, incidentRecorded: res.incidentRecorded, persisted: true,
  });
}
