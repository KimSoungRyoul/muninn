# CRD 버저닝 전략 (muninn.io)

CONTRACT §4 대응. 이 문서는 `muninn.io` CRD 의 버전 전략과, `v1` storage 버전 도입을
**왜 이번 PR 에서 보류했는지**, 그리고 도입 시 정확히 무엇을 해야 green 을 유지할 수 있는지를 기술한다.

## 현재 상태

- group: `muninn.io` (영구 불변)
- 버전: `v1beta1` — 유일한 `served=true, storage=true`
- kinds: `HuginnAgent`, `HuginnIssue`, `HuginnRun`
- conversion: 단일 버전이므로 conversion webhook 없음(`strategy` 미선언 = `None`)

## 목표 (v1 도입 시)

- `v1` 을 신규 storage 버전으로 추가. **스키마는 v1beta1 와 필드 1:1 동일(rename 없음)** —
  conversion 을 trivial 하게 유지하기 위함.
- `v1beta1`: `served=true`, `deprecated=true` 로 표시(클라이언트에 마이그레이션 경고).
- `v1`: `served=true`, `storage=true`(hub).
- 컨트롤러/웹훅은 동일 스키마라 내부적으로는 한 버전 타입만 다뤄도 무방(spoke 가 hub 로 변환됨).

## 왜 이번 PR 에서 보류했나 (green 유지 절대 제약)

full `v1` + conversion 은 operator-only 범위에서 CI green 을 깨뜨린다. 근거(`.github/workflows/operator-ci.yml`):

1. **envtest 스위트 깨짐.** CI 의 `make test` 는 unit + envtest(etcd/kube-apiserver 자동 다운로드)를
   돌린다. controller-gen 은 multi-version(한쪽 `+kubebuilder:storageversion`) CRD 에 대해 기본으로
   `spec.conversion.strategy: Webhook` 를 emit 한다. 이 CRD 를 로드한 envtest API server 는 모든
   쓰기에서 conversion webhook 을 호출하려 하지만, 현재 `internal/controller/suite_test.go` 와
   `internal/webhook/v1beta1/webhook_suite_test.go` 는 conversion webhook 서버(+TLS cert)를 띄우지
   않는다. 결과적으로 CRD 쓰기가 전부 실패 → 두 envtest 스위트가 red.
   - 지정된 순수 단위 테스트(`TestBuildJobTemplate|TestExpandPodSpec|TestBackoffReady`,
     `internal/webhook` 의 `TestValidateAgent*`)는 envtest 불필요라 green 으로 남지만, CONTRACT 가
     요구하는 "envtest/빌드 green 유지"는 깨진다.

2. **helm CRD drift 가드 깨짐.** CI `helm` job 은 `deploy/helm/muninn/crds/*` 가
   `huginnOperator/config/crd/bases/*` 와 byte-identical 인지 `diff` 로 검증한다. multi-version CRD 는
   bases 를 바꾸므로 helm 복사본도 갱신해야 하고, conversion webhook 을 쓰는 CRD 는 helm 차트에
   conversion `Service` + `caBundle`(cert-manager `Certificate`/injection) 배선이 필요하다 —
   이는 deploy 컴포넌트 범위의 변경으로, operator-only 작업으로는 닫을 수 없다.

따라서 CONTRACT §4 의 명시적 폴백("깨지면 v1 추가를 보류하고 준비 작업만")에 따라 **준비 작업만** 수행했다.

## 이번 PR 에서 한 준비 작업

- `api/v1beta1/groupversion_info.go` 에 버저닝/deprecation 정책 주석(비-마커 doc comment — 생성물
  불변) 추가. v1 추가 시 부착할 `+kubebuilder:deprecatedversion` 마커 위치를 명시.
- 본 전략 문서(`docs/crd-versioning.md`) 작성.

## v1 을 실제로 도입할 때 체크리스트 (green 유지 조건)

1. `api/v1/` 패키지 신설: v1beta1 와 동일 타입 + `groupversion_info.go`(`Version: "v1"`),
   타입 패키지 주석에 `+kubebuilder:storageversion` 부여. `make generate` 로 `zz_generated.deepcopy.go`.
2. conversion 선택:
   - **권장(동일 스키마):** trivial Hub/Spoke — `v1` 에 `Hub()`, `v1beta1` 에 `ConvertTo/ConvertFrom`
     (필드 1:1 복사). controller-gen 은 `conversion.strategy: Webhook` CRD 를 emit.
3. **envtest 하니스 보강(필수):** `suite_test.go` 두 곳에 conversion webhook 을 SetupWebhookWithManager
   로 등록하고, `envtest.WebhookInstallOptions` 로 cert 를 주입. 그러지 않으면 envtest 가 red.
4. `cmd/main.go`: v1 을 scheme 에 등록하고 각 kind 에 conversion 포함 webhook 등록.
5. `make manifests generate` 후 `config/crd/bases/*` 갱신 → `deploy/helm/muninn/crds/*` 로 복사.
6. helm 차트: conversion `Service` + caBundle(cert-manager) 배선, values 로 토글 노출.
7. storage 마이그레이션: 기존 v1beta1 객체를 v1 로 re-write(`kubectl get ... -o yaml | kubectl replace`
   또는 storage-version-migrator) 후에만 v1beta1 `served` 를 내린다.

위 1–6 이 한 PR 안에서 모두 green 으로 맞물려야 하며, 특히 3·6 은 operator+deploy 협업이 필요하다.
