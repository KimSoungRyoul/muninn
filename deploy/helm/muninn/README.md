# Muninn Helm Chart

Muninn DevOps Agent Platform 을 Kubernetes 에 배포하는 Helm chart.

설치 대상:

| 컴포넌트 | 종류 | 기본 | 설명 |
|---|---|---|---|
| **Huginn Operator** | Deployment + CRD + RBAC | on | `HuginnAgent`/`HuginnIssue`/`HuginnRun` 컨트롤 플레인. 이벤트로 agent Job 을 만든다. |
| **Muninn Web** | Deployment + Service | on | CopilotKit 콘솔(프로토타입; mock 데이터). |
| **Agent SA/Secret** | ServiceAccount (+ 옵션 Secret) | SA on / Secret off | operator 가 만드는 Job pod 이 쓰는 `huginn-agent` SA 와 인증 배선. |
| **agent-runtime** | (배포 안 함) | — | operator 가 런타임에 Job 으로 실행한다. 이미지는 `HuginnAgent.spec.agent.image`. |

> **PostgreSQL 은 이 chart 가 설치하지 않는다.** 설계(§8)의 metaDB/pgvector 는 외부 인스턴스를 쓴다.
> `externalPostgresql.*` 로 연결 정보만 등록한다. (소비자 `muninn-api`/`muninn-memory` 는 Phase 0 로드맵 — 아직 미구현.)

## 사전 요구

- Kubernetes ≥ 1.27, Helm ≥ 3.x
- operator/web 이미지는 아직 CI 미발행 → 로컬 빌드 후 클러스터에 load 하거나, 발행 후 `*.image.repository/tag` 로 교체.
- webhook(`operator.webhook.enabled=true`) 사용 시 [cert-manager](https://cert-manager.io) 필요 (없으면 설치가 fail-fast 로 막힘).
- ServiceMonitor(`operator.metrics.serviceMonitor.enabled=true`) 사용 시 Prometheus Operator(`monitoring.coreos.com` CRD) 필요.

## 빠른 설치

```bash
# operator 가 Job 에 주입하는 기본 endpoint 가 `muninn` namespace 를 가정한다.
helm install muninn deploy/helm/muninn -n muninn --create-namespace
```

webhook 비활성(기본)에서는 cert-manager 없이 바로 뜬다.

### 로컬 이미지로 kind 설치 (Podman)

```bash
# 1) operator 이미지 빌드 + load
#    주의: huginnOperator/.dockerignore 가 buildah(podman)에서 cmd/main.go 를 누락시키므로
#    ignorefile 우회로 빌드한다(별도 수정 PR 권장).
printf '.git\nbin\n' > /tmp/op.ignore
podman build -t controller:latest --ignorefile /tmp/op.ignore huginnOperator
podman save localhost/controller:latest -o /tmp/op.tar
KIND_EXPERIMENTAL_PROVIDER=podman kind load image-archive /tmp/op.tar --name <cluster>

# 2) (선택) web 이미지 빌드 + load
podman build -t ghcr.io/kimsoungryoul/muninn/muninn-web:dev muninnWeb
podman save ghcr.io/kimsoungryoul/muninn/muninn-web:dev -o /tmp/web.tar
KIND_EXPERIMENTAL_PROVIDER=podman kind load image-archive /tmp/web.tar --name <cluster>

# 3) 설치 (podman 은 로컬 이미지를 localhost/ 로 태그하므로 repository 를 맞춘다)
helm install muninn deploy/helm/muninn -n muninn --create-namespace \
  --set operator.image.repository=localhost/controller \
  --set operator.image.pullPolicy=IfNotPresent
```

> kind 에 load 한 로컬 이미지는 `pullPolicy: IfNotPresent`(기본)면 노드에 있을 때 재pull 하지 않는다.

## 자격(Secret) — 절대 커밋 금지

루트 `CLAUDE.md` 의 "Auth is env(Secret)-only" 원칙에 따라 토큰/키는 chart/values 에 넣지 않는다.

```bash
# agent Job 용
kubectl -n muninn create secret generic agent-secrets \
  --from-literal=claude-code-oauth-token="$CLAUDE_CODE_OAUTH_TOKEN"

# web 콘솔 코파일럿용
kubectl -n muninn create secret generic muninn-web-secrets \
  --from-literal=claude-code-oauth-token="$CLAUDE_CODE_OAUTH_TOKEN"
helm upgrade muninn deploy/helm/muninn -n muninn --set web.auth.existingSecret=muninn-web-secrets
```

## CRD

CRD 는 Helm 의 `crds/` 디렉토리로 관리된다(원본: `huginnOperator/config/crd/bases/`).

- `helm install` 시 자동 적용, `helm uninstall` 시 **보존**(데이터 보호).
- `helm upgrade` 는 CRD 를 **갱신하지 않는다**. CRD 스키마 변경 시:
  ```bash
  make -C huginnOperator manifests        # 원본 재생성
  cp huginnOperator/config/crd/bases/*.yaml deploy/helm/muninn/crds/   # chart 동기화
  kubectl apply -f deploy/helm/muninn/crds/                            # 클러스터 갱신
  ```
- CRD 적용을 건너뛰려면 `helm install --skip-crds`.

## 주요 값

| 키 | 기본 | 설명 |
|---|---|---|
| `operator.enabled` | `true` | operator 설치 |
| `operator.image.repository/tag` | `controller`/`latest` | manager 이미지 |
| `operator.leaderElection.enabled` | `true` | leader election |
| `operator.metrics.enabled` / `.secure` | `true` / `true` | HTTPS metrics(:8443, self-signed) |
| `operator.metrics.serviceMonitor.enabled` | `false` | Prometheus Operator ServiceMonitor |
| `operator.webhook.enabled` | `false` | HuginnAgent admission webhook(cert-manager 필요) |
| `web.enabled` | `true` | 콘솔 설치 |
| `web.image.repository/tag` | `ghcr.io/kimsoungryoul/muninn/muninn-web`/`dev` | 콘솔 이미지 |
| `web.auth.existingSecret` | `""` | CopilotKit 자격 Secret 이름 |
| `web.ingress.enabled` | `false` | 콘솔 Ingress |
| `agent.serviceAccount.create/name` | `true`/`huginn-agent` | Job SA (operator.enabled 시) |
| `externalPostgresql.enabled` | `false` | 외부 DB 연결 Secret 등록 |
| `externalPostgresql.host` | `""` | DB 호스트(enabled 시 필수) |
| `externalPostgresql.existingSecret` | `""` | 비밀번호 Secret(권장) |

전체 목록은 `values.yaml` 참고.

## 제거

```bash
helm uninstall muninn -n muninn
# CRD 는 보존된다. 완전 제거 시:
kubectl delete -f deploy/helm/muninn/crds/
```
