# Muninn DevOps Agent Platform — 설계 문서

아키텍처 그림(`muninnAgentPlatform_architecture.png`)과 UI 프로토타입(`muninnAgentPlatform디자인/`)을 분석해 구체화한 설계 문서 모음. (현재: **v0.2** — 6개 영역 적대 검증으로 49개 개선점 반영.)

## 문서

- **[muninn-devops-agent-platform.md](./muninn-devops-agent-platform.md)** — 메인 설계서
  (아키텍처 4평면, Issue 생성 경로, CRD 3종+상태 머신, 이벤트→이슈→런 흐름, 에이전트 런타임/SDK 통합, 보안·거버넌스, 기억 시스템, 데이터 모델/집계, 로드맵, Open Questions)
- **[operator-design.md](./operator-design.md)** — Operator 구현 설계(검토·구체화)
  (kubebuilder 선택 정당화, controller↔리소스 watch 토폴로지, 재시도 모델/status 소유권/취소 전파 모순 해소, admission webhook 범위, RBAC, Job→phase 매핑) — 실제 구현은 [`huginnOperator/`](../../huginnOperator/)
- **[review-v0.1.md](./review-v0.1.md)** — v0.1→v0.2 검증 이력(반영/불확실/기각)

## CRD 샘플 (`muninn.io/v1beta1`)

- [examples/huginnagent.yaml](./examples/huginnagent.yaml) — 운영 대상 1개 (그림의 *Huginn Custom Resource*; `kind: HuginnAgent`)
- [examples/huginnissue.yaml](./examples/huginnissue.yaml) — 이벤트 1건 (그림의 *Huginn Issue*)
- [examples/huginnrun.yaml](./examples/huginnrun.yaml) — 에이전트 실행 1회 (그림의 *Huginn Run* + `claude_skill.sh`, K8s Job)

## 핵심 개념 (TL;DR)

```
Grafana alert(webhook) ─▶ Muninn API(정규화·dedup) ─▶ K8s API ─▶ HuginnIssue CR
   ─▶ (Operator watch) ─▶ HuginnRun(Job/Pod, claude_skill.sh + Agent SDK)
   ─▶ recall(Muninn) · loki/tempo/mimir/github 조사 ─▶ PR/Issue + 기억 저장
```

| 까마귀 | 평면 | 책임 |
|--------|------|------|
| **Huginn** (사고) | Agent Plane | 이벤트를 받아 Claude Code 에이전트 실행, 진단, PR/Issue 생성 |
| **Muninn** (기억) | Memory Plane + 콘솔 | 지식 recall/store, 운영자 UI/API/metaDB |

## 네이밍 규칙

- 아키텍처 **그림이 우선**. 그림의 `huggin`/`hugginSession`(오타)은 정식 철자 **Huginn** 으로 교정. 이벤트 CR 은 Claude SDK 의 `session` 과의 혼동을 피해 **`HuginnIssue`** 로 개명(초안 `HuginnSession`).
- CRD `kind`: **`HuginnAgent`**(운영 대상=에이전트 정의) / **`HuginnIssue`**(이벤트 1건) / **`HuginnRun`**(실행 1회).
  - 최상위는 그림의 `kind: huggin` + 'Agent' 용어(그림의 *huggin AgentOperator*)를 반영해 `HuginnAgent` 로 확정(과거 `HuginnApplication` 에서 변경).
  - 디자인 파일 내부의 `hugginAgent` 같은 오타 임시 네이밍은 무시(정식 철자 Huginn 사용).
- API 그룹/버전: `muninn.io/v1beta1` (그림 기준).
