import { NextRequest } from "next/server";
import { ok, notFound, serverError, severityGte, badRequest } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { APPS, EVENTS } from "@/lib/data";
import { delegateIncident, dedupActiveIssue, fingerprintLabelOf, eventFingerprint } from "@/lib/incidents";
import { k8sEnabled } from "@/lib/k8s";

// 허용 source(외부 webhook 발신자). 임의 문자열이 spec.event.source/라벨로 흘러들지 않게 화이트리스트.
const ALLOWED_SOURCES = new Set(["grafana", "airflow", "argocd"]);
const ALLOWED_SEVERITY = new Set(["info", "warning", "error", "critical"]);

// 설계 §4.3 정규화 + §4.4 dedup. POST /api/hooks/:app — 외부 모니터링(grafana 등) webhook 수신.
// 두 트리거 경로 중 webhook 경로(대화형 위임과 1급 동등): 정규화→severity gate→dedup→**실제 HuginnIssue 위임**.
// k8s 미연결(로컬)에서는 시뮬레이션 응답으로 graceful fallback.
export async function POST(req: NextRequest, props: { params: Promise<{ app: string }> }) {
  const params = await props.params;
  const denied = requireAuth(req);
  if (denied) return denied;

  const body: any = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object") return badRequest("invalid JSON body");

  // 입력 정규화 + 검증. fingerprint/title 은 문자열로 강제, source/severity 는 화이트리스트.
  const fingerprint = String(body.fingerprint || body.labels?.alertname || "Unknown").slice(0, 200);
  const rawSeverity = String(body.severity || body.labels?.severity || "warning");
  const severity = (ALLOWED_SEVERITY.has(rawSeverity) ? rawSeverity : "warning") as "info" | "warning" | "error" | "critical";
  const title = String(body.title || body.annotations?.summary || "alert").slice(0, 200);
  const rawSource = String(body.source || "grafana");
  const source: "grafana" | "airflow" | "argocd" = (ALLOWED_SOURCES.has(rawSource) ? rawSource : "grafana") as "grafana" | "airflow" | "argocd";
  const slug = fingerprint.toLowerCase().replace(/[^a-z0-9]+/g, "-");

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

  // dedup(설계 §4.4) — 동일 event-fingerprint 의 활성 HuginnIssue 가 있으면 새 Issue/Run 생성 대신
  // 기존 Issue 의 status.dedupCount 를 +1 한다(중복 처리 폭주 방지). delegateIncident 와 동일한
  // fingerprint 문자열→label-safe 정규화를 거쳐 같은 라벨을 보게 한다.
  const fp = eventFingerprint(source, `${source}:${slug}`, goal);
  const fpLabel = fingerprintLabelOf(fp);
  const dedup = await dedupActiveIssue(params.app, fpLabel);
  if (dedup.hit) {
    return ok({
      accepted: true, reason: "dedup-hit", event,
      issueId: dedup.issueName, dedupCount: dedup.dedupCount ?? 0, persisted: true,
    });
  }

  // 실제 위임 — 대화형 경로와 동일한 delegateIncident(출처만 webhook).
  const res = await delegateIncident({
    app: params.app, goal, source, severity,
    fingerprint: `${source}:${slug}`, title,
  });
  if (!res.ok) {
    // 위임 실패는 외부 발신자(Grafana/Alertmanager 등)가 인지·재시도할 수 있도록 비-2xx 로 응답한다.
    // (k8s-disabled 는 위 !k8sEnabled() 분기에서 이미 200 시뮬레이션으로 처리되므로 여기 도달하지 않는다.)
    if (res.reason === "agent-not-found") {
      return notFound(`application '${params.app}' 에 대응하는 HuginnAgent 가 없습니다`);
    }
    return serverError(`위임 실패: ${res.reason}`, res.error);
  }
  return ok({
    accepted: true, reason: "new", event,
    issueId: res.issueName, namespace: res.namespace, incidentRecorded: res.incidentRecorded, persisted: true,
  });
}
