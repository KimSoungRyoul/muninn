# Muninn Helm Chart

Muninn DevOps Agent Platform 을 Kubernetes 에 배포하는 Helm chart.

설치 대상:

| 컴포넌트 | 종류 | 기본 | 설명 |
|---|---|---|---|
| **Huginn Operator** | Deployment + CRD + RBAC | on | `HuginnAgent`/`HuginnIssue`/`HuginnRun` 컨트롤 플레인. 이벤트로 agent Job 을 만든다. |
| **Muninn Web** | Deployment + Service + SA/RBAC | on | CopilotKit 콘솔 + **Muninn API**(HuginnIssue 생성·HuginnRun 보고/승인). huginn* CR 한정 Role. |
| **Agent SA/Secret** | ServiceAccount (+ 옵션 Secret) | SA on / Secret off | operator 가 만드는 Job pod 이 쓰는 `huginn-agent` SA 와 인증 배선. |
| **agent-runtime** | (배포 안 함) | — | operator 가 런타임에 Job 으로 실행한다. 이미지는 `HuginnAgent.spec.agent.image`. |

> **PostgreSQL 은 이 chart 가 설치하지 않는다.** metaDB 는 외부 인스턴스를 쓴다 — 권장 경로는
> CloudNativePG(CNPG)로 provision 후 그 연결 Secret 을 `metaDb.existingSecret` 으로 가리키는 것이다
> (`deploy/quickstart/README.md`). `metaDb.enabled=true` 면 **muninn-web(= Muninn API)** 에
> `DATABASE_URL`(Secret 의 `uriKey`)이 주입된다. 검색은 텍스트(to_tsvector/ts_rank_cd)만 쓰므로
> **pgvector·확장은 불필요**하다. (`externalPostgresql.*` 는 미구현 소비자용 legacy 메타 Secret.)

## 사전 요구

- Kubernetes ≥ 1.27, Helm ≥ 3.x
- operator/web 이미지는 아직 CI 미발행 → 로컬 빌드 후 클러스터에 load 하거나, 발행 후 `*.image.repository/tag` 로 교체.
- webhook(`operator.webhook.enabled=true`) 사용 시 [cert-manager](https://cert-manager.io) 필요 (없으면 설치가 fail-fast 로 막힘).
- ServiceMonitor(`operator.metrics.serviceMonitor.enabled=true`) 사용 시 Prometheus Operator(`monitoring.coreos.com` CRD) 필요.

## 빠른 설치

```bash
helm install muninn deploy/helm/muninn -n muninn --create-namespace
```

webhook 비활성(기본)에서는 cert-manager 없이 바로 뜬다.

> ⚠️ operator/web 이미지는 **CI 미발행**이다 — 기본 이미지 값 그대로면 `ImagePullBackOff` 가 난다.
> 로컬 빌드 후 `kind load` + `--set *.image.*` override 가 필요하다(아래 "로컬 이미지로 kind 설치" 또는
> 루트 `make run-local`). agent Job 의 보고/메모리 endpoint(MUNINN_API_ENDPOINT/MEMORY_ENDPOINT)는
> `web.enabled=true` 일 때 chart 가 이 릴리스의 muninn-web Service 로 배선한다(namespace 무관). `web.enabled=false`
> 면 operator 가 코드 fallback 을 쓰므로 보고가 동작하지 않는다.

### 로컬 이미지로 kind 설치 (Podman)

**권장: 루트 `make run-local`** — kind 생성 + 이미지 3종 빌드/적재 + metaDB + 이 chart 설치를 한 번에 한다.
완전수식 이미지 이름(`ghcr.io/kimsoungryoul/muninn/*`)으로 빌드해 podman 의 `localhost/` 접두 문제를 피하고,
helm 값을 자동 배선한다(아래 수동 절차는 내부에서 일어나는 일을 풀어쓴 것).

```bash
make run-local                      # 루트에서. (자격이 있으면 CLAUDE_CODE_OAUTH_TOKEN=... make run-local)
```

수동으로 하려면:

```bash
# 1) 이미지 빌드 + load (operator/web)
make -C huginnOperator image CONTAINER_TOOL=podman IMG=ghcr.io/kimsoungryoul/muninn/huginn-operator:dev
make -C muninnWeb       image CONTAINER_TOOL=podman IMG=ghcr.io/kimsoungryoul/muninn/muninn-web:dev
for img in huginn-operator muninn-web; do
  podman save ghcr.io/kimsoungryoul/muninn/$img:dev -o /tmp/$img.tar
  KIND_EXPERIMENTAL_PROVIDER=podman kind load image-archive /tmp/$img.tar --name <cluster>
done

# 2) 설치 (완전수식 이름이라 repository override 불필요 — tag/pullPolicy 만 맞춘다)
helm install muninn deploy/helm/muninn -n muninn --create-namespace \
  --set operator.image.repository=ghcr.io/kimsoungryoul/muninn/huginn-operator \
  --set operator.image.tag=dev --set operator.image.pullPolicy=IfNotPresent \
  --set web.image.tag=dev --set web.image.pullPolicy=IfNotPresent
```

> kind 에 load 한 로컬 이미지는 `pullPolicy: IfNotPresent`(기본)면 노드에 있을 때 재pull 하지 않는다.
> (과거 `huginnOperator/.dockerignore` 가 buildah 에서 `cmd/main.go` 를 누락시키던 문제는 명시적 제외
> 패턴으로 수정됨 — 이제 `podman build huginnOperator` 가 우회 없이 동작한다.)

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
| `web.apiToken.existingSecret/key` | `""`(→agent.secrets.name)/`muninn-api-token` | Muninn API Bearer 토큰 소스(에이전트→API 정적 토큰 인증) |
| `web.workspace` | `""`(→릴리스 ns) | `MUNINN_WORKSPACE` 폴백 — 멀티테넌시 워크스페이스=네임스페이스(§2). 헤더 `x-muninn-workspace` 로 override |
| `web.oidc.issuer` | `""` | OIDC 활성화 트리거 — 운영자 콘솔(승인/거절/위임) JWT 검증(§1). 비우면 OIDC off |
| `web.oidc.audience` | `""` | 토큰 `aud` 검증 값(비우면 생략) |
| `web.oidc.jwksUri` | `""` | JWKS 엔드포인트(비우면 issuer 의 `/.well-known/jwks.json` 자동 디스커버리) |
| `web.serviceAccount.automount` | `true` | SA 토큰 마운트(K8s 연동 필수 — create 와 분리) |
| `web.ingress.enabled` | `false` | 콘솔 Ingress |
| `metaDb.enabled` | `false` | true 면 web 에 DATABASE_URL 주입(메모리 영속) |
| `metaDb.existingSecret/uriKey` | `""`/`uri` | connection string Secret/키(CNPG `<cluster>-app`) |
| `agent.serviceAccount.create/name` | `true`/`huginn-agent` | Job SA. **name 은 operator 하드코딩 고정 계약**(변경 시 fail-fast) |
| `agent.secrets.name` | `agent-secrets` | **operator 하드코딩 고정 계약**(변경 시 fail-fast) |
| `externalPostgresql.enabled` | `false` | (legacy) 외부 DB 연결 Secret 등록 — 미구현 소비자용 |
| `externalPostgresql.host` | `""` | DB 호스트(enabled 시 필수) |
| `externalPostgresql.existingSecret` | `""` | 비밀번호 Secret(권장) |

전체 목록은 `values.yaml` 참고.

## 제거

```bash
helm uninstall muninn -n muninn
# CRD 는 보존된다. 완전 제거 시:
kubectl delete -f deploy/helm/muninn/crds/
```
