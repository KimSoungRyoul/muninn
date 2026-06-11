# CRD 버저닝 전략 (muninn.io)

CONTRACT §4 대응. 이 문서는 `muninn.io` CRD 의 버전 전략과, `v1` storage 버전 도입을
**어떻게 conversion webhook 없이(strategy None) 구현했는지**를 기술한다.

## 현재 상태 (v1 도입 완료)

- group: `muninn.io` (영구 불변)
- 버전:
  - `v1` — `served=true, storage=true` (hub / storage 버전)
  - `v1beta1` — `served=true, storage=false, deprecated=true` (마이그레이션 경고)
- kinds: `HuginnAgent`, `HuginnIssue`, `HuginnRun`
- 스키마: v1 와 v1beta1 가 **필드 1:1 동일**(rename/추가 없음). 두 버전의 OpenAPI 스키마는 byte 수준에서 동일.
- conversion: **strategy `None`** — 생성 CRD 에 `spec.conversion` 스탠자가 **없다**. 동일 스키마이므로
  K8s apiserver 가 conversion webhook 없이 apiVersion 만 바꿔(=trivial relabel) 모든 served 버전을 서빙한다.

## 채택 경로: A (conversion 전략 None)

설계 시 두 경로를 검토했다:

- **경로 A (채택): conversion `None`** — 동일 스키마면 webhook 없이 서빙 가능.
- 경로 B: trivial Hub/Spoke conversion webhook — A 가 불가할 때의 폴백.

핵심 확인 사항이었던 "controller-gen 이 multi-version 에 conversion webhook 을 강제하는가?" 를
실제 생성물로 검증했다. **controller-gen v0.20.1 은 Go 타입에 `Hub()`/`Convertible`(ConvertTo/ConvertFrom)
마커가 없으면 `spec.conversion` 을 emit 하지 않는다.** `+kubebuilder:storageversion` /
`+kubebuilder:deprecatedversion` 마커만으로는 conversion webhook 이 생성되지 않는다.

결과적으로 생성된 CRD 는 `spec.conversion` 키가 없고, 이때 apiserver 의 기본값은 `strategy: None` 이다.
None 전략은 서빙 버전 간 스키마가 동일할 때 안전하며(apiVersion 만 다시 라벨링), 본 프로젝트는 그 전제를
충족하므로 conversion webhook / cert-manager / envtest webhook 배선이 **전혀 필요 없다**.

→ A 가 envtest green 이므로 A 로 갔다(단순·안전). B 는 사용하지 않았다.

## 구현 내역

1. `api/v1/` 패키지 신설: v1beta1 의 3개 타입 파일을 동일 필드로 복제(`package v1`),
   `groupversion_info.go`(`Version: "v1"`, `+versionName=v1`). 각 Kind 의 root 마커 블록에
   `+kubebuilder:storageversion` 부여.
2. `api/v1beta1/`: 각 Kind 의 root 마커 블록에
   `+kubebuilder:deprecatedversion:warning="muninn.io/v1beta1 is deprecated; migrate to muninn.io/v1"` 부착.
3. `make generate` → `api/v1/zz_generated.deepcopy.go`.
4. `cmd/main.go`: scheme 에 `muninniov1.AddToScheme` 추가(v1beta1 와 병행 등록).
5. 컨트롤러/웹훅: **v1beta1 타입 유지(최소 변경).** strategy `None` + 동일 스키마이므로 v1beta1 로
   watch/reconcile/patch 해도 apiserver 가 v1-stored 객체를 v1beta1 로 투명하게 서빙한다(아래 "버전 선택 근거").
6. `make manifests generate` → `config/crd/bases/*.yaml` 갱신 → `deploy/helm/muninn/crds/*.yaml` 로
   byte-identical 복사(CI helm drift 가드 충족).
7. `PROJECT` 파일에 v1 resource 3개 추가(kubebuilder convention).

## 컨트롤러/웹훅 버전 선택 근거 (왜 v1beta1 유지인가)

storage=v1 이지만 컨트롤러·admission webhook 은 v1beta1 타입을 그대로 쓴다. 이유:

- **컨트롤러:** strategy `None` 에서 apiserver 는 v1-stored 객체를 클라이언트가 요청한 served 버전으로
  투명 변환(=relabel)해 돌려준다. 스키마가 동일하므로 v1beta1-typed cache/client 가 정상 동작한다.
  전체 컨트롤러·테스트를 v1 로 rename 하는 것은 ~150곳 변경이라 위험만 크고 이득이 없어 보류.
- **admission webhook:** 현재 모든 실제 write 클라이언트가 v1beta1 를 쓴다 — muninnWeb `lib/k8s.ts`
  의 `VERSION = "v1beta1"`, `config/samples/v1beta1_*.yaml`, `huginnAgentRuntime/examples/kind-e2e.yaml`.
  따라서 v1beta1-scoped defaulting/validation webhook 이 모든 write 트래픽을 커버한다. v1 직접 write 가
  도입되는 시점에 v1 webhook 을 추가하면 된다(아래 "후속 작업").

## 검증 결과 (전부 green)

```
make manifests generate     # CRD/deepcopy 재생성 — 변경 없이 idempotent
go build ./...              # OK
go vet ./...                # OK
make lint                   # 0 issues
go test ./internal/... -count=1
#   internal/controller            ok  (~7s, envtest)
#   internal/webhook/v1beta1       ok  (~5.5s, envtest)
# helm CRD drift: config/crd/bases/* 와 deploy/helm/muninn/crds/* byte-identical
```

생성 CRD 의 conversion 확인: `grep -n conversion config/crd/bases/*.yaml` → 매치 없음(=strategy None).
버전 헤더: 각 CRD 의 `versions[]` 에 `v1`(storage:true) 과 `v1beta1`(storage:false, deprecated:true,
deprecationWarning) 이 함께 존재.

## 후속 작업 (이번 범위 밖)

1. **storage 마이그레이션:** 기존 v1beta1 객체를 v1 로 re-write
   (`kubectl get ... -o yaml | kubectl replace -f -` 또는 storage-version-migrator)한 뒤에만
   v1beta1 `served` 를 내린다.
2. **클라이언트 v1 전환:** muninnWeb `lib/k8s.ts` 의 `VERSION` 과 `config/samples/*` 를 v1 로 옮길 때,
   v1 직접 write 에도 defaulting/validation 이 걸리도록 v1 admission webhook 을 추가한다(현재 v1beta1 전용).
3. 스키마가 향후 divergent 해지면(필드 추가/rename) None 전략의 전제가 깨지므로 경로 B(Hub/Spoke
   conversion webhook + cert-manager + envtest cert 배선)로 전환해야 한다.
