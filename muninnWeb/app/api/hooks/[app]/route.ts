import { NextRequest } from "next/server";
import { ok, notFound, severityGte } from "@/lib/api";
import { APPS, EVENTS } from "@/lib/data";

// 설계 §4.3 정규화 + §4.4 dedup 시뮬레이션
// POST /api/hooks/:app — 외부 모니터링(grafana 등) webhook 수신.
export async function POST(req: NextRequest, { params }: { params: { app: string } }) {
  const app: any = APPS.find((a) => a.name === params.app);
  if (!app) return notFound("application not found");

  const body: any = await req.json().catch(() => ({}));

  const fingerprint = body.fingerprint || body.labels?.alertname || "Unknown";
  const severity = body.severity || body.labels?.severity || "warning";
  const title = body.title || body.annotations?.summary || "alert";

  // 결정적 식별자용 슬러그 (id 는 결정적, 타임스탬프만 런타임)
  const slug = String(fingerprint).toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // §4.3 정규화 이벤트
  const event = {
    id: "e_" + slug,
    source: body.source || "grafana",
    severity,
    fingerprint,
    title,
    receivedAt: new Date().toISOString(),
    payload: body,
  };

  // severity gate: 앱 임계값 mock = "warning"
  if (!severityGte(severity, "warning")) {
    return ok({
      accepted: false,
      reason: "below-threshold",
      event,
      sessionId: null,
      runId: null,
      dedupCount: 0,
    });
  }

  // §4.4 dedup 판정
  const prior: any = EVENTS.find((e) => e.appId === app.id && e.fingerprint === fingerprint);
  const dedupCount = prior ? prior.dedup + 1 : 0;
  const reason = prior ? "recurrence" : "new";

  return ok({
    accepted: true,
    reason,
    event,
    sessionId: "sess-" + slug,
    runId: "run-" + slug,
    dedupCount,
  });
}
