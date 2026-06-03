// Muninn API — Platform Tool 인스턴스 mock (설계 §8 platform_tool).
// admin 이 등록하는 인프라 도구. 회사 식별정보 없음(예시 호스트).

import type { PlatformTool } from "./api";

export const PLATFORM_TOOLS: PlatformTool[] = [
  // --- Deployment ---
  { id: "argocd-prod",    category: "deployment",    kind: "continuous-delivery",   name: "production-argocd", endpoint: "argocd.platform.local",        status: "healthy",  brandColor: "#EF7B4D", usedByApps: 12 },
  { id: "argocd-stg",     category: "deployment",    kind: "continuous-delivery",   name: "staging-argocd",    endpoint: "argocd-stg.platform.local",    status: "healthy",  brandColor: "#EF7B4D", usedByApps: 3 },
  { id: "argocd-dev",     category: "deployment",    kind: "continuous-delivery",   name: "dev-argocd",        endpoint: "argocd-dev.local",             status: "unreach",  brandColor: "#EF7B4D", usedByApps: 0 },
  { id: "airflow-prod",   category: "deployment",    kind: "workflow-orchestration", name: "platform-airflow", endpoint: "airflow.platform.local",       status: "healthy",  brandColor: "#017CEE", usedByApps: 8 },

  // --- Observability ---
  { id: "grafana-prod",   category: "observability", kind: "dashboard",             name: "platform-grafana",  endpoint: "grafana.platform:3000",        status: "healthy",  brandColor: "#F46800", usedByApps: 6 },
  { id: "mimir-query",      category: "observability", kind: "time-series",           name: "prod-mimir",           endpoint: "mimir-query.observability:8481", status: "healthy",  brandColor: "#E74C3C", usedByApps: 9 },
  { id: "mimir-ingest",      category: "observability", kind: "time-series",           name: "prod-mimir-ingest",    endpoint: "mimir-ingest.observability:8480", status: "healthy",  brandColor: "#E74C3C", usedByApps: 9 },
  { id: "loki-prod",      category: "observability", kind: "log-aggregation",       name: "prod-loki",         endpoint: "loki.observability:3100",      status: "healthy",  brandColor: "#4D9BB8", usedByApps: 9 },
  { id: "loki-dev",       category: "observability", kind: "log-aggregation",       name: "dev-loki",          endpoint: "loki-dev:3100",                status: "healthy",  brandColor: "#4D9BB8", usedByApps: 2 },
  { id: "tempo-prod",     category: "observability", kind: "distributed-tracing",   name: "prod-tempo",        endpoint: "tempo.observability:3200",     status: "healthy",  brandColor: "#A88AED", usedByApps: 4 },
  { id: "pyroscope-prod", category: "observability", kind: "continuous-profiling",  name: "pyroscope-prod",    endpoint: "pyroscope.observability:4040", status: "healthy",  brandColor: "#E8772E", usedByApps: 6 },
  { id: "pyroscope-sdk",  category: "observability", kind: "continuous-profiling",  name: "pyroscope-py-sdk",  endpoint: "pyroscope.observability:4040", status: "degraded", brandColor: "#E8772E", usedByApps: 2 },

  // --- Registry ---
  { id: "harbor-prod",    category: "registry",      kind: "container-registry",    name: "harbor-prod",       endpoint: "harbor.platform.local",        status: "healthy",  brandColor: "#60B932", usedByApps: 11 },
  { id: "harbor-stg",     category: "registry",      kind: "container-registry",    name: "harbor-staging",    endpoint: "harbor-stg.platform.local",    status: "healthy",  brandColor: "#60B932", usedByApps: 4 },
];
