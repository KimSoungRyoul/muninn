# 설계 검증 이력 — v0.1 → v0.2

v0.1 초안을 6개 영역으로 병렬 검토하고, 각 발견을 적대적으로 검증(SDK·K8s·pgvector 사실 주장은 외부 문서/Context7 로 확인)한 결과를 v0.2 에 반영했다.

**집계**: 전체 60건 · 확정(real) **49** · 불확실 7 · 기각 4 · (검토 에이전트 66, 도구 호출 1,203회)

## 반영된 주요 개선 (확정 49건 중 high)

| # | 영역 | 개선 | v0.2 반영 위치 |
|---|------|------|----------------|
| 1 | 정합성 | Run 상태 enum 표기 통일(CRD PascalCase ↔ UI/SQL 소문자, API 변환) | §3.4 표 |
| 2 | 정합성 | `Queued` 상태 누락 보완 + 수명주기 state machine | §3.4 |
| 3 | 정합성 | `huggin` 프로즈 오타 → 정식 `HuginnApplication` 등 | §1.1 |
| 4 | SDK | 메시지→Step 변환(AssistantMessage/ToolUseBlock/ResultMessage) | §5.3 |
| 5 | SDK | guardrail = `max_turns`/`max_budget_usd`, cost 는 예상치 | §5.4 |
| 6 | SDK | MCP 도구명 규칙 `mcp__<ns>__<fn>` + `allowedTools` | §5.2 |
| 7 | SDK | `~/.claude` 역할 정정(설정/세션), 인증은 env(Secret) | §5.1 |
| 8 | SDK | `permission_mode`(plan/dontAsk)와 승인 흐름 연결 | §5.4 |
| 9 | K8s | Session/Run `status.conditions[]` K8s 표준 | §3.x, YAML |
| 10 | K8s | Run = **Job** 기반(backoffLimit/activeDeadlineSeconds/ttl) | §3.3, huginnrun.yaml |
| 11 | K8s | PVC `~/.claude` 동시쓰기 충돌 → 격리 전략(A/B/C) | §5.5 |
| 12 | K8s | Session 생성 경로 명확화(API→K8s API→Operator watch) | §2.2, §4 |
| 13 | 기억 | hybrid 점수 정규화/결합(RRF 또는 가중합) | §7.1 |
| 14 | 기억 | global/app scope 병합·랭킹 | §7.2 |
| 15 | 기억 | 자동 distill 파이프라인(트리거/품질/중복) | §7.5 |
| 16 | 기억 | BM25 구현(ts_rank vs 확장) 트레이드오프 | §7.1 |
| 17 | 보안 | GitHub PAT 최소권한(PR 생성만)·로테이션·감사 | §6.2 |
| 18 | 보안 | MCP 도구 read-only 강제 + 감사 칼럼 | §5.2, §6.3 |
| 19 | 보안 | 멀티테넌시 격리(namespace/RLS/PVC/NetworkPolicy) | §6.1 |
| 20 | 보안 | prompt injection 방어(sanitize/데이터-지시 분리) | §6.5 |
| 21 | 보안 | 승인 규칙 정책화·만료·거절·RBAC | §6.4 |
| 22 | 도메인 | 집계 필드/KPI(materialized view + stats API) | §8.1 |
| 23 | 도메인 | `spec.workspaceId` 1급 필드 + admission webhook | §3.1 |
| 24 | 도메인 | approval CRD 스키마(Run 단위) | §3.3, §6.4 |
| 25 | 도메인 | `recalledMemoryIds` 보고 경로(API recall-report) | §5.6 |
| 26 | 도메인 | event 정규화 스키마(alertmanager→표준형) | §4.3 |
| 27 | 도메인 | webhook 생성/등록 흐름 | §4.5 |
| 28 | 도메인 | dedup 영속/TTL/재발 조건(`dedup:{app}:{fp}`) | §4.4 |
| 29 | 도메인 | platform_tool name→tool_id 매핑, enum CHECK | §8.5, §8 |
| 30 | 도메인 | Event↔Run 역방향 FK 명확화, soul_ref 동기화, duration/finishedAt, activeSessions, goal | §8.2~8.6 |

(medium 다수 — 임베딩 전략 §7.4, recall 감사 §7.6, step/maxStep 의미 §3.4, bindings 상속 §3.2, 관측 백엔드 권한 §6.3 등 — 도 함께 반영)

## 불확실(uncertain) — 향후 팀 결정 (Open Questions 로 이관)

- finalizer/graceful shutdown 필요 여부 → §11-7
- 임베딩 차원 contract 고정 → §11-2
- 비용 모델/rate card/월 한도 집행 위치 → §11-8
- Run guardrail caps 상속 경로(일부 §3.3 반영) · goal SQL 저장 여부(§8.6) · phase case(반영됨)

## 기각(refuted) 4건
검증에서 근거 부족/이미 반영됨으로 판정되어 미반영(예: 일부 중복 지적, 과한 일반화).
