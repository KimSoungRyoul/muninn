// muninnWeb = Muninn API — Kubernetes CR(muninn.io/v1beta1) 게이트웨이 (서버 전용).
//
// 코파일럿/라우트가 이 모듈로 HuginnIssue 를 생성(위임)하고, HuginnRun 을 조회/패치(승인·보고)한다.
// 인증: KubeConfig.loadFromDefault() — kind Pod 안에선 ServiceAccount(in-cluster),
//       로컬 `pnpm dev` 에선 kubeconfig(현재 컨텍스트). RBAC 로 huginn* 권한 부여 필요.
//
// 설계: §2.1/§4.2 Muninn API 가 K8s CR 생성자. status 필드 소유권(operator-design §2.2):
//   Operator=phase/시간/caps, Agent→API=step/cost/output, API=approval. → 우리는 status/spec 의
//   "우리 소유 필드만" merge-patch 한다(operator 의 MergeFrom 부분패치와 충돌 안 함).

import * as k8s from "@kubernetes/client-node";

export const GROUP = "muninn.io";
export const VERSION = "v1beta1";
export const PLURAL = {
  agents: "huginnagents",
  issues: "huginnissues",
  runs: "huginnruns",
} as const;

// 이슈/런이 사는 기본 네임스페이스. HuginnAgent.identity.k8sNamespace 와 일치해야 한다.
export const DEFAULT_NAMESPACE = process.env.MUNINN_NAMESPACE || "ns-huginn";

let _api: k8s.CustomObjectsApi | null = null;
let _kc: k8s.KubeConfig | null = null;

function kubeConfig(): k8s.KubeConfig {
  if (_kc) return _kc;
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault(); // in-cluster(SA) 또는 ~/.kube/config
  _kc = kc;
  return kc;
}

export function k8sApi(): k8s.CustomObjectsApi {
  if (!_api) _api = kubeConfig().makeApiClient(k8s.CustomObjectsApi);
  return _api;
}

// 클러스터 접근 가능 여부 — 로컬에서 자격 없으면 false(도구가 graceful 하게 안내).
export function k8sEnabled(): boolean {
  try {
    return kubeConfig().getCurrentCluster() != null;
  } catch {
    return false;
  }
}

const mergePatch = k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch);

type Obj = Record<string, unknown>;

// ---- create (위임) ----
export async function createHuginnIssue(namespace: string, body: Obj): Promise<any> {
  return k8sApi().createNamespacedCustomObject({
    group: GROUP, version: VERSION, namespace, plural: PLURAL.issues, body,
  });
}

// ---- get ----
export async function getHuginnAgent(namespace: string, name: string): Promise<any> {
  return k8sApi().getNamespacedCustomObject({ group: GROUP, version: VERSION, namespace, plural: PLURAL.agents, name });
}
export async function getHuginnIssue(namespace: string, name: string): Promise<any> {
  return k8sApi().getNamespacedCustomObject({ group: GROUP, version: VERSION, namespace, plural: PLURAL.issues, name });
}
export async function getHuginnRun(namespace: string, name: string): Promise<any> {
  return k8sApi().getNamespacedCustomObject({ group: GROUP, version: VERSION, namespace, plural: PLURAL.runs, name });
}

// ---- list (조회) ----
async function listCr(namespace: string, plural: string, labelSelector?: string): Promise<any[]> {
  const r: any = await k8sApi().listNamespacedCustomObject({ group: GROUP, version: VERSION, namespace, plural, labelSelector });
  return (r?.items ?? []) as any[];
}
export const listHuginnAgents = (ns: string, sel?: string) => listCr(ns, PLURAL.agents, sel);
export const listHuginnIssues = (ns: string, sel?: string) => listCr(ns, PLURAL.issues, sel);
export const listHuginnRuns = (ns: string, sel?: string) => listCr(ns, PLURAL.runs, sel);

// ---- patch (승인/보고/취소) — 우리 소유 필드만 merge-patch ----
export async function patchRunStatus(namespace: string, name: string, status: Obj): Promise<any> {
  return k8sApi().patchNamespacedCustomObjectStatus(
    { group: GROUP, version: VERSION, namespace, plural: PLURAL.runs, name, body: { status } },
    mergePatch,
  );
}
export async function patchRunSpec(namespace: string, name: string, spec: Obj): Promise<any> {
  return k8sApi().patchNamespacedCustomObject(
    { group: GROUP, version: VERSION, namespace, plural: PLURAL.runs, name, body: { spec } },
    mergePatch,
  );
}
export async function patchIssueStatus(namespace: string, name: string, status: Obj): Promise<any> {
  return k8sApi().patchNamespacedCustomObjectStatus(
    { group: GROUP, version: VERSION, namespace, plural: PLURAL.issues, name, body: { status } },
    mergePatch,
  );
}
