#!/usr/bin/env python3
"""Huginn agent-runtime 런너 — Claude Agent SDK 루프(설계서 §5.1~§5.4).

claude_skill.sh 가 컨텍스트(env)를 준비한 뒤 이 모듈을 exec 한다. 두 모드:

* live(기본): MUNINN_GOAL 을 목표로 Claude Agent SDK `query()` 루프를 돌린다.
  - max_turns ← MUNINN_GUARDRAILS.maxIterations (§5.4)
  - 인증은 env 의 ANTHROPIC_API_KEY 또는 CLAUDE_CODE_OAUTH_TOKEN(claude CLI 가 소비)
  - MUNINN_RESUME_SESSION_ID 가 있으면(같은 Issue 의 재시도 attempt — operator 주입, §5.5)
    직전 attempt 의 Claude 세션을 resume 해 진단 컨텍스트를 이어받는다. 세션 ID 는 메시지
    스트림에서 잡히는 즉시 report API 로 보고해 다음 attempt 가 쓸 수 있게 한다.
* selftest(--selftest / MUNINN_SELFTEST=1 / ANTHROPIC_API_KEY=SELFTEST):
  API 호출 없이 SDK import·옵션 구성·claude CLI 응답만 검증하고 exit 0. kind/CI QA 용.
"""

from __future__ import annotations

import asyncio
import glob
import json
import os
import shutil
import signal
import subprocess
import sys
import time


def log(msg: str) -> None:
    print(f"[runner] {msg}", file=sys.stderr, flush=True)


def _is_selftest() -> bool:
    if "--selftest" in sys.argv[1:]:
        return True
    if os.getenv("MUNINN_SELFTEST", "").lower() in ("1", "true", "yes"):
        return True
    return os.getenv("ANTHROPIC_API_KEY") == "SELFTEST"


def _guardrails() -> dict:
    raw = os.getenv("MUNINN_GUARDRAILS", "")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        log(f"WARN: MUNINN_GUARDRAILS 파싱 실패: {raw!r}")
        return {}


def _pr_mode() -> str:
    # dry-run(기본): 실제 gh pr create 대신 PR 계획(title/요약/diff)을 최종 출력으로 생성(설계 §8).
    return os.getenv("MUNINN_PR_MODE", "dry-run").strip() or "dry-run"


def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


def _require_approval(g: dict | None = None) -> bool:
    """위험 작업 전 사람 승인(HITL)이 필요한지(CONTRACT §3).

    우선순위: env MUNINN_REQUIRE_APPROVAL > guardrails.requireApproval. 둘 다 미설정 시 False.
    """
    if _truthy("MUNINN_REQUIRE_APPROVAL"):
        return True
    g = _guardrails() if g is None else g
    return bool(g.get("requireApproval"))


def _workspace() -> str:
    """워크스페이스(=K8s 네임스페이스, CONTRACT §2). 미설정 시 빈 문자열(페이로드에서 생략)."""
    return _env("MUNINN_WORKSPACE")


def _system_prompt(pr_mode: str = "") -> str:
    # 글로벌/팀/SOUL 프롬프트는 ConfigMap 참조(MUNINN_*_REF)로 전달되며 마운트 후 합성된다(§5.1).
    # MVP 런너는 goal 중심의 최소 system prompt 를 구성한다.
    base = (
        "당신은 Huginn DevOps 에이전트입니다. 주어진 운영 이벤트(goal)를 진단하고, "
        "허용된 도구만 사용하며, 출력 정책에 따라 결과(PR/Issue)를 만듭니다. "
        "안전 한도(guardrails)를 절대 넘지 마세요."
    )
    if (pr_mode or _pr_mode()) == "dry-run":
        base += (
            "\n\n[DRY-RUN 모드] 실제로 `gh pr create` 등으로 PR/Issue 를 만들지 마세요. "
            "대신 진단 근거와 함께 제안하는 변경을 **PR 계획**으로 마지막 메시지에 정리하세요: "
            "1) 제목 한 줄, 2) 변경 요약, 3) 통합 diff(```diff fenced```). "
            "이 계획이 곧 결과(output)로 보고됩니다."
        )
    return base


# ---- Muninn API 보고/메모리(설계 §8) — 표준 라이브러리만 사용(추가 의존성 없음) ----
import http.client  # noqa: E402
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _http_json(
    method: str,
    url: str,
    body: dict | None = None,
    timeout: float = 10.0,
    retries: int = 2,
    deadline: float | None = None,
) -> dict | None:
    """JSON 요청 후 응답(dict)을 반환. 실패해도 에이전트 루프를 막지 않도록 None 반환.

    인증(컴포넌트 간 계약): MUNINN_API_TOKEN 이 설정돼 있으면 `Authorization: Bearer <token>`
    헤더를 붙인다(미설정이면 헤더 없이 dev 모드). muninnWeb 가 동일 토큰으로 검증한다.

    내구성(브리프 HIGH): API 일시 장애로 결과(output/cost)가 영구 유실되지 않도록
    짧은 지수 backoff 재시도를 둔다. `retries` 는 *추가* 재시도 횟수(총 시도 = retries+1).
    최종(final) 보고는 호출부에서 더 큰 retries 를 넘겨 더 끈질기게 재전송한다.

    deadline(절대 monotonic 시각, 브리프 항목3): SIGTERM grace period 안에서 끝나야 하는
    terminal 보고는 이 값을 넘긴다. 매 시도 전 잔여 시간을 계산해 per-attempt timeout 을
    그 이하로 줄이고, 잔여가 없으면 더는 재시도하지 않는다 → 전체 보고가 deadline 내에 끝나
    kubelet 의 SIGKILL(기본 grace 30s) 전에 완료될 가능성을 높인다.
    """
    if not url:
        return None
    data = json.dumps(body or {}, ensure_ascii=False).encode("utf-8") if body is not None else None
    token = _env("MUNINN_API_TOKEN")
    attempts = max(1, retries + 1)
    last_exc: Exception | None = None
    for attempt in range(attempts):
        # deadline 모드: 잔여 예산을 per-attempt timeout 으로 캡(0 이하면 포기).
        attempt_timeout = timeout
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                log(f"WARN: HTTP {method} {url} deadline 초과 — 재시도 중단(시도 {attempt}/{attempts})")
                break
            attempt_timeout = min(timeout, remaining)
        # urllib Request 는 재사용 시 상태가 남을 수 있어 시도마다 새로 만든다.
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("content-type", "application/json")
        if token:
            req.add_header("authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=attempt_timeout) as resp:
                raw = resp.read().decode("utf-8") or "{}"
                return json.loads(raw)
        # http.client.HTTPException(BadStatusLine 등)을 포함시켜 비정상 응답이
        # 호출 루프 전체를 죽이지 않게 한다(브리프 HIGH).
        except (urllib.error.URLError, http.client.HTTPException, ValueError, OSError) as exc:
            last_exc = exc
            if attempt + 1 < attempts:
                backoff = min(8.0, 0.5 * (2 ** attempt))  # 0.5s, 1s, 2s, 4s, … (상한 8s)
                if deadline is not None:
                    # backoff 후에도 시도할 시간이 남아야 의미가 있다 — 잔여를 넘기면 즉시 중단.
                    remaining = deadline - time.monotonic()
                    if remaining - backoff <= 0:
                        log(f"WARN: HTTP {method} {url} 실패(시도 {attempt + 1}/{attempts}): {exc} → deadline 임박, 재시도 중단")
                        break
                log(f"WARN: HTTP {method} {url} 실패(시도 {attempt + 1}/{attempts}): {exc} → {backoff:.1f}s 후 재시도")
                time.sleep(backoff)
    log(f"WARN: HTTP {method} {url} 최종 실패({attempts}회): {last_exc}")
    return None


def _report(patch: dict, deadline: float | None = None) -> dict | None:
    """진행 보고 → POST {MUNINN_API_ENDPOINT}/api/runs/{run}/report (Agent→API 소유 필드).

    중간(step) 보고는 best-effort(짧은 재시도)지만, 최종(`final:true`) 보고는 그 run 의
    유일한 결과물(output/cost)이자 incident 종결의 단일 경로이므로 더 끈질기게(지수 backoff
    다회) 재전송한다(브리프 HIGH). 끝내 실패하면 None 을 반환하므로 호출부가 표면화한다.

    deadline(브리프 항목3): SIGTERM 취소 경로의 terminal 보고는 pod grace period 내에 끝나도록
    절대 monotonic 시각을 넘긴다 — _http_json 이 잔여 예산으로 재시도를 캡한다.
    """
    api = _env("MUNINN_API_ENDPOINT")
    run = _env("MUNINN_RUN_NAME")
    if not api or not run:
        return None
    issue = _env("MUNINN_ISSUE_NAME")
    if issue and "issueName" not in patch:
        patch = {**patch, "issueName": issue}
    # 최종 보고는 결과 유실을 막기 위해 더 많이 재시도(총 5회), 중간 보고는 적게(총 2회).
    retries = 4 if patch.get("final") else 1
    return _http_json(
        "POST", f"{api.rstrip('/')}/api/runs/{run}/report", patch, retries=retries, deadline=deadline
    )


def _recall(query: str, k: int = 6) -> list:
    """위임 직전 회상 → POST {MUNINN_MEMORY_ENDPOINT}/api/memories/recall."""
    mem = _env("MUNINN_MEMORY_ENDPOINT")
    if not mem or not query:
        return []
    app = _env("MUNINN_AGENT_NAME")
    ws = _workspace()
    body = {
        "query": query,
        "k": k,
        **({"app": app} if app else {}),
        **({"workspace": ws} if ws else {}),  # 멀티테넌시 필터(CONTRACT §2)
    }
    res = _http_json("POST", f"{mem.rstrip('/')}/api/memories/recall", body)
    items = (res or {}).get("items") or []
    return items if isinstance(items, list) else []


def _store_memory(fact: str, tags: list | None = None) -> dict | None:
    """결과 기억화 → POST {MUNINN_MEMORY_ENDPOINT}/api/memories."""
    mem = _env("MUNINN_MEMORY_ENDPOINT")
    if not mem or not fact:
        return None
    app = _env("MUNINN_AGENT_NAME")
    ws = _workspace()
    body = {
        "fact": fact,
        "tags": tags or [],
        "sourceRunId": _env("MUNINN_RUN_NAME") or None,
        "changedBy": "agent",
        **({"app": app, "appName": app, "scope": "app"} if app else {"scope": "global"}),
        **({"workspace": ws} if ws else {}),  # 멀티테넌시 격리(CONTRACT §2)
    }
    return _http_json("POST", f"{mem.rstrip('/')}/api/memories", body)


# ---- 사람 승인(HITL) 루프(CONTRACT §3) — 표준 라이브러리만 ----


def _approval_reasons(goal: str, plan: str = "", pr_mode: str = "") -> list[dict]:
    """승인 요청 사유를 goal/계획 요약에서 추출한다(최소 1건, CONTRACT §3).

    plan(에이전트가 산출한 PR 계획/요약)이 있으면 그 첫 줄을, 없으면 goal 요약을 detail 로 쓴다.
    PR 생성/실제 변경 적용은 인프라에 영향을 주므로 type 은 "infra-change" 로 분류한다.

    구조적 한계(브리프 항목5): 게이트는 query 루프 진입 *전* 에 돌아 plan 이 아직 없다(plan="").
    1차 계획 산출 후로 게이트를 옮기는 건 구조 변경이 커 위험하므로, 여기서는 운영자가 무엇을
    승인하는지 가늠하도록 가용 컨텍스트(goal 요약 + 의도된 작업 종류=PR mode)를 detail 에 풍부하게
    담는다. plan 이 전달되면 그 요약을 우선 쓴다.
    """
    src = (plan or goal or "").strip()
    summary = next((ln.strip("# ").strip() for ln in src.splitlines() if ln.strip()), "")
    if not summary:
        summary = "위험 작업(PR 생성/변경 적용) 전 운영자 승인 필요"
    # plan 이 아직 없을 때(게이트가 루프 전): 의도된 작업 종류를 명시해 detail 을 보강한다.
    if not plan:
        mode = (pr_mode or _pr_mode())
        action = (
            "PR 계획(diff)을 산출할 예정(dry-run, 실제 PR 미생성)"
            if mode == "dry-run"
            else "실제 PR 생성/변경 적용을 수행할 예정(live)"
        )
        # 운영자는 아직 구체 diff 를 볼 수 없음을 명시 — 오해(이미 확정된 변경 승인) 방지.
        detail = f"[{mode}] {summary} — {action}. 구체 변경(diff)은 승인 후 산출됩니다."
    else:
        detail = summary
    return [{"type": "infra-change", "detail": detail[:300]}]


def _request_approval(reasons: list[dict]) -> dict | None:
    """승인 요청 보고 → POST .../report (API 가 phase=AwaitingApproval, approval.state=Pending 전이).

    CONTRACT §3: body 는 `{"requestApproval": {"reasons":[...]}}`. report route(app/api/runs/[id]/report)
    는 `body.requestApproval`(truthy) 와 `body.approvalReasons`(top-level)를 읽으므로, 계약 형태와
    라우트 파싱을 둘 다 만족하도록 reasons 를 양쪽에 싣는다(중복이지만 API 가 멱등 처리).
    """
    return _report({
        "requestApproval": {"reasons": reasons},
        "approvalReasons": reasons,
    })


def _parse_approval_state(run_obj: dict | None) -> str | None:
    """GET /api/runs/{id} 응답에서 approval.state 를 안전하게 추출한다.

    응답 형태가 둘 다 가능하므로 방어적으로 파싱한다:
      * RunVM(평탄화): `{"approval": "Pending"|"Approved"|...}` (lib/incidents.ts runView)
      * CR-유사(중첩): `{"status": {"approval": {"state": "..."}}}` 또는 `{"approval": {"state": "..."}}`
    파싱 불가/필드 없음이면 None(→ 계속 폴링).
    """
    if not isinstance(run_obj, dict):
        return None
    approval = run_obj.get("approval")
    if approval is None:
        status = run_obj.get("status")
        if isinstance(status, dict):
            approval = status.get("approval")
    if isinstance(approval, str):
        return approval or None
    if isinstance(approval, dict):
        state = approval.get("state")
        return state if isinstance(state, str) and state else None
    return None


def _approval_detail(run_obj: dict | None) -> str:
    """outcome 표면화용 — decidedBy/reason 이 있으면 합쳐 반환(없으면 빈 문자열). 방어적 파싱."""
    if not isinstance(run_obj, dict):
        return ""
    approval = run_obj.get("approval")
    if not isinstance(approval, dict):
        status = run_obj.get("status")
        approval = status.get("approval") if isinstance(status, dict) else None
    if not isinstance(approval, dict):
        return ""
    parts = [str(approval[k]) for k in ("decidedBy", "reason") if approval.get(k)]
    return " / ".join(parts)


def _poll_approval_once() -> dict | None:
    """GET {MUNINN_API_ENDPOINT}/api/runs/{run} 1회(동기). 실패 시 None(→ 다음 주기 재시도)."""
    api = _env("MUNINN_API_ENDPOINT")
    run = _env("MUNINN_RUN_NAME")
    if not api or not run:
        return None
    return _http_json("GET", f"{api.rstrip('/')}/api/runs/{run}")


def _get_run_deadline(deadline: float | None = None) -> dict | None:
    """GET /api/runs/{run} 1회 — SIGTERM grace 예산(deadline) 내로 캡(브리프 항목1).

    취소(CancelledError) 경로에서 terminal 보고 *전* approval.state 를 확인할 때 쓴다.
    재시도 없이(retries=0) 단일 시도로, deadline 을 _http_json 에 넘겨 per-attempt timeout 을
    잔여 grace 예산 이하로 캡한다 — terminal 보고가 grace 안에 끝날 여지를 남긴다.
    """
    api = _env("MUNINN_API_ENDPOINT")
    run = _env("MUNINN_RUN_NAME")
    if not api or not run:
        return None
    return _http_json(
        "GET", f"{api.rstrip('/')}/api/runs/{run}", retries=0, deadline=deadline
    )


def _approval_poll_seconds() -> float:
    try:
        return max(1.0, float(os.getenv("MUNINN_APPROVAL_POLL_SECONDS", "10") or 10))
    except (TypeError, ValueError):
        return 10.0


def _approval_timeout_seconds() -> float:
    # 단일 소스 규약(브리프 항목3, C-HITL): operator 가 web 의 TTL 권위값
    # (MUNINN_APPROVAL_TTL_MINUTES*60)을 agent Job env 의 MUNINN_APPROVAL_TIMEOUT 으로 주입하면
    # runner 폴링 타임아웃이 web 의 만료 차단과 정합한다 → 단일 소스. runner 는 이미 이 env 를
    # 읽는다(아래). operator 가 주입하지 않는 환경에서는 이 기본 5400s(90m)가 web 의
    # approvalTtlMinutes 기본 90m 과 *우연히* 일치할 뿐인 독립 상수다 — operator 가 web TTL 을
    # 30m 로 낮춰도 미주입이면 runner 는 여전히 90m 폴링하므로, 보안 환경은 operator 주입에 의존하라.
    # (더 짧게 끝내면 운영자가 TTL 내 승인해도 에이전트가 이미 사라져 Run 만 Approved 로 전이되는
    #  모순이 생긴다 — 브리프 항목4.)
    try:
        return max(1.0, float(os.getenv("MUNINN_APPROVAL_TIMEOUT", "5400") or 5400))
    except (TypeError, ValueError):
        return 5400.0


def _sigterm_report_budget_seconds() -> float:
    """SIGTERM(취소) 경로의 terminal 보고에 허용할 총 예산(초). 기본 20s — pod 기본 grace 30s 안에서
    여유를 두고 끝나도록(브리프 항목3). MUNINN_SIGTERM_REPORT_BUDGET 로 조정 가능."""
    try:
        return max(1.0, float(os.getenv("MUNINN_SIGTERM_REPORT_BUDGET", "20") or 20))
    except (TypeError, ValueError):
        return 20.0


def _gate_terminal_kind(gate_outcome: str) -> str:
    """승인 게이트 outcome → web report route 의 terminalKind 화이트리스트 매핑(CONTRACT §C4).

      rejected(…)      → "rejected"
      expired          → "expired"  (※ 현재 web 이 Expired 를 자동 표면화하지 않아 게이트가
                          이 outcome 을 내지 못한다 — gate_approval 의 Expired 분기 주석 참조.
                          매핑은 web 수정 시 살아나도록 유지.)
      approval-timeout → "aborted"  (운영자가 끝내 결정 안 함 = 능동 거절이 아닌 중단)
    그 외(이론상 도달 불가)는 빈 문자열 → terminalKind 미전송(web 은 기존 동작 유지).
    """
    if gate_outcome.startswith("rejected"):
        return "rejected"
    if gate_outcome == "expired":
        return "expired"
    if gate_outcome == "approval-timeout":
        return "aborted"
    return ""


# ---- SPI 보고/회상 페이로드 빌더(설계 §8, conformance 층1) — 순수 함수 ----
# operator-design §2.2a 의 Agent→API 보고 SPI 를 코드로 고정한다. golden_report_payloads.json 이
# 두 *producer*(Python runner ↔ Go huginn-self)를 같은 계약에 묶어 cross-language producer drift 를 막는다
# (codegen 부재 → conformance 가 producer 측 방어선). muninnWeb report route(consumer) 측 골든 검증은
# 후속(report-contract.test.ts) — 그때 producer↔consumer drift 까지 닫힌다.


def build_report_patch(step: int, cost: float, tokens: int, output: str, outcome: str,
                       failed: bool, session_id: str = "", terminal_kind: str = "") -> dict:
    """terminal 보고 patch(final:true)를 조립한다(SPI 계약, conformance 골든 기준). 순수 함수.

    계약 불변식(web report route 와 동일):
      * cost 는 소수 4자리 decimal 문자열(`f"{cost:.4f}"`).
      * output 은 8000자 캡.
      * sessionId 는 비어있지 않을 때만 포함(없으면 키 생략).
      * terminalKind 는 화이트리스트 {rejected,expired,aborted} 외 값은 싣지 않는다(임의 문자열 차단).
    """
    patch: dict = {
        "step": step,
        "cost": f"{cost:.4f}",
        "tokens": tokens,
        "output": (output or "")[:8000],
        "outcome": outcome,
        "final": True,
        "failed": failed,
    }
    if session_id:
        patch["sessionId"] = session_id
    if terminal_kind in ("rejected", "expired", "aborted"):
        patch["terminalKind"] = terminal_kind
    return patch


def build_recall_payload(recalled: list) -> list[dict]:
    """recall 결과를 recalledMemoryIds 페이로드로 변환한다(SPI 계약). 순수 함수.

    계약 불변식(web report route / incidents.ts 와 동일): 각 항목은 {id, score?}. id 없는 항목은 제외,
    score 는 문자열로 직렬화하되 None 이면 키를 생략한다("None" 문자열 유입 방지).
    """
    out: list[dict] = []
    for m in recalled:
        if isinstance(m, dict) and m.get("id"):
            item = {"id": m["id"]}
            if m.get("score") is not None:
                item["score"] = str(m["score"])
            out.append(item)
    return out


def build_options(max_turns: int, max_budget_usd: float | None = None, resume_session_id: str = "",
                  model: str = ""):
    """ClaudeAgentOptions 를 구성(라이브/셀프테스트 공통). SDK 계약 검증 지점.

    guardrails 매핑(§5.4): maxIterations→max_turns, maxCostUsd→max_budget_usd.

    model(§3 게이트웨이): 비면 claude CLI 기본 모델. 설정되면 ClaudeAgentOptions.model 로 명시
    주입해 SDK 가 `--model` 로 그 모델을 쓰게 한다 — operator 가 ANTHROPIC_MODEL 로 전달하는 값
    (예: gemma-4-31B-it)을 CLI 기본값에 의존하지 않고 결정적으로 강제한다. ANTHROPIC_BASE_URL/
    ANTHROPIC_AUTH_TOKEN 과 함께 쓰면 Anthropic 호환 게이트웨이의 비-Claude 모델을 구동한다.

    resume_session_id(§5.5): 직전 attempt 의 Claude 세션 ID(MUNINN_RESUME_SESSION_ID).
    세션 transcript 는 앱별 ~/.claude PVC 에 있고 모든 Run 의 cwd(/workspace)가 동일해
    같은 프로젝트 디렉토리로 resume 된다. attempt 간 pod 겹침은 없으므로(Issue 컨트롤러가
    직전 Run 의 터미널 phase 를 확인한 뒤에만 다음 attempt 를 만든다) 동일 세션 이어쓰기가 안전하다.

    maxTokens 한계(브리프 MEDIUM): SDK 에 직접 옵션이 없다. 토큰/cost 값은 SDK 가 주는 usage 에
    의존하는데, 현재 SDK 버전에서 per-turn usage 가 AssistantMessage 에 실리지 않으면 누적은
    스트림 종료 시 오는 ResultMessage 에서만 정확하다. 따라서 중간 step 보고의 tokens 는 SDK
    동작에 따라 0 일 수 있고, 정확한 합산(cache 토큰 포함, _usage_tokens)은 최종 보고에서 보장된다.
    실시간 '집행(enforce)'은 이 한계 때문에 보장할 수 없으며, 플랫폼은 최종값으로 '사후 추적/기록'한다.
    AssistantMessage.usage 가 제공되는 SDK 버전에서는 중간 보고에도 누적치가 반영된다(run_live 참조).
    """
    from claude_agent_sdk import ClaudeAgentOptions

    # [신뢰경계 / 보안 주의] 기본 permission_mode=bypassPermissions 는 플랫폼 설계상 의도된
    # 동작이다 — dry-run(MUNINN_PR_MODE, 1차 안전장치)이 실제 `gh pr create` 등 부작용을 막고,
    # PR 계획만 출력으로 보고한다. 다만 이 기본값에는 실질 위험이 있다:
    #   1) MUNINN_GOAL/이벤트 페이로드는 webhook(알림 본문 등) 파생 *untrusted* 입력이며,
    #      prompt injection 으로 에이전트에게 임의 도구 실행을 유도할 수 있다.
    #   2) 프로세스 env 에 ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN / GITHUB_PAT 가 있고
    #      이미지에 kubectl/helm/argocd/gh 가 들어 있어, 유출 시 클러스터 조작·자격 탈취 표면이 된다.
    # 도구 allowlist 정책 엔진과 egress 제한(NetworkPolicy)은 범위 밖(후속). 운영 시
    # MUNINN_PERMISSION_MODE 오버라이드 + egress NetworkPolicy 로 표면을 좁히는 것을 권장한다.
    permission_mode = os.getenv("MUNINN_PERMISSION_MODE", "bypassPermissions")
    opts: dict = {
        "system_prompt": _system_prompt(),
        "max_turns": max_turns,
        "permission_mode": permission_mode,
    }
    if max_budget_usd is not None and max_budget_usd > 0:
        opts["max_budget_usd"] = max_budget_usd
    if resume_session_id:
        opts["resume"] = resume_session_id
    if model:
        opts["model"] = model
    return ClaudeAgentOptions(**opts)


def _has_transcript(session_id: str, claude_home: str | None = None) -> bool:
    """resume 대상 세션의 transcript 가 ~/.claude/projects/ 하위에 실재하는지 검사한다(§5.5).

    preflight 인 이유(리뷰 MEDIUM-1): transcript 가 없으면(PVC 재생성, transcript 정리 등)
    claude CLI 가 --resume 단계에서 에러로 죽어 attempt 가 단 한 턴도 못 돌고 Failed 가 된다 —
    retry budget(maxRuns) 1회가 통째로 증발한다. 없으면 호출부가 새 세션으로 폴백한다.
    """
    if not session_id:
        return False
    home = claude_home or os.path.expanduser("~/.claude")
    return bool(glob.glob(os.path.join(home, "projects", "*", f"{session_id}.jsonl")))


def _extract_session_id(message) -> str:
    """SDK 메시지에서 Claude 세션 ID 를 추출한다(없으면 빈 문자열).

    스트림 첫 init SystemMessage 는 data dict 에, ResultMessage 는 session_id 속성에 싣는다 —
    둘 다 duck-typing 으로 읽어 SDK 버전별 메시지 형태 차이에 강건하게 한다(§5.5).
    init 에서 일찍 잡는 것이 중요하다: ResultMessage 만 기다리면 도중 죽은 run(=재시도가
    필요한 바로 그 경우)은 세션 ID 를 보고하지 못해 resume 이 영영 안 된다.
    """
    sid = getattr(message, "session_id", None)
    if not (isinstance(sid, str) and sid):
        data = getattr(message, "data", None)
        sid = data.get("session_id") if isinstance(data, dict) else None
    return sid if isinstance(sid, str) else ""


def selftest() -> int:
    """API 호출 없이 이미지 배선을 검증한다(kind/CI QA)."""
    report: dict = {"mode": "selftest", "ok": True, "checks": {}}

    # 1) SDK import + 버전
    try:
        import claude_agent_sdk  # noqa: F401

        report["checks"]["claude_agent_sdk"] = getattr(
            claude_agent_sdk, "__version__", "imported"
        )
    except Exception as exc:  # pragma: no cover - 이미지 결함 시에만
        report["ok"] = False
        report["checks"]["claude_agent_sdk"] = f"IMPORT FAILED: {exc}"

    # 2) ClaudeAgentOptions 구성(API 시그니처 검증) — max_budget_usd·resume(§5.5) 배선 경로도 커버.
    #    resume 는 SDK 의 ClaudeAgentOptions 필드 계약이므로 여기서 깨지면 이미지 QA 에서 잡힌다.
    try:
        build_options(max_turns=1, max_budget_usd=1.0)
        build_options(max_turns=1, max_budget_usd=1.0, resume_session_id="selftest-session")
        report["checks"]["claude_agent_options"] = "ok (incl. resume)"
    except Exception as exc:
        report["ok"] = False
        report["checks"]["claude_agent_options"] = f"FAILED: {exc}"

    # 2b) live 경로가 의존하는 심볼 import 검증(런너 자체 회귀 방지)
    try:
        from claude_agent_sdk import (  # noqa: F401
            AssistantMessage,
            ResultMessage,
            TextBlock,
            ToolUseBlock,
            query,
        )

        report["checks"]["live_symbols"] = "ok"
    except Exception as exc:
        report["ok"] = False
        report["checks"]["live_symbols"] = f"IMPORT FAILED: {exc}"

    # 3) 플랫폼 CLI 존재 + claude CLI 응답(Node 런타임 동작 확인). curl/python3 도 운영 경로(README 도구표)에 포함.
    for tool in ("claude", "kubectl", "helm", "argocd", "gh", "git", "jq", "yq", "curl", "python3"):
        path = shutil.which(tool)
        report["checks"][tool] = path or "MISSING"
        if path is None:
            report["ok"] = False
    try:
        out = subprocess.run(
            ["claude", "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        report["checks"]["claude_version"] = (out.stdout or out.stderr).strip()
        if out.returncode != 0:
            report["ok"] = False
    except Exception as exc:
        report["ok"] = False
        report["checks"]["claude_version"] = f"FAILED: {exc}"

    # 4) ~/.claude(오퍼레이터 claudeMountPath, PVC fsGroup=1000) 가 현재 uid 로 쓰기 가능한지 검증.
    #    PVC 권한/securityContext 회귀(fsGroup 누락 등)는 live 에서야 터지므로 여기서 미리 잡는다(브리프 LOW).
    claude_home = os.path.expanduser("~/.claude")
    try:
        os.makedirs(claude_home, exist_ok=True)
        probe = os.path.join(claude_home, ".selftest-write-probe")
        with open(probe, "w", encoding="utf-8") as fh:
            fh.write("ok")
        os.remove(probe)
        report["checks"]["claude_home_writable"] = claude_home
    except OSError as exc:
        report["ok"] = False
        report["checks"]["claude_home_writable"] = f"NOT WRITABLE ({claude_home}): {exc}"

    # 5) 보고 경로 배선 점검 — 더미 endpoint 로 _report 코드 경로(URL 조립·JSON 직렬화·헤더)를 실제로 태운다.
    #    네트워크 미도달(connection refused 등)은 정상으로 간주(오프라인 QA). 코드가 예외 없이 None 을 돌려주면 OK.
    try:
        prev_api = os.environ.get("MUNINN_API_ENDPOINT")
        prev_run = os.environ.get("MUNINN_RUN_NAME")
        prev_tok = os.environ.get("MUNINN_API_TOKEN")
        # 127.0.0.1 의 닫힌 포트 → 즉시 connection refused(외부 트래픽 없음). 재시도 0 으로 빠르게 끝낸다.
        os.environ["MUNINN_API_ENDPOINT"] = "http://127.0.0.1:1"
        os.environ["MUNINN_RUN_NAME"] = "selftest-run"
        os.environ["MUNINN_API_TOKEN"] = "selftest-token"
        _http_json(
            "POST",
            "http://127.0.0.1:1/api/runs/selftest-run/report",
            {"step": 0, "final": True, "failed": False},
            timeout=0.5,
            retries=0,
        )
        report["checks"]["report_wiring"] = "ok (code path exercised, network not required)"
        # env 원복(전역 상태 오염 방지)
        for key, val in (("MUNINN_API_ENDPOINT", prev_api), ("MUNINN_RUN_NAME", prev_run), ("MUNINN_API_TOKEN", prev_tok)):
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val
    except Exception as exc:
        report["ok"] = False
        report["checks"]["report_wiring"] = f"FAILED: {exc}"

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


def _usage_tokens(usage: dict) -> int:
    """SDK usage dict 에서 전체 토큰을 합산한다.

    input/output 뿐 아니라 cache_creation_input_tokens / cache_read_input_tokens 도
    포함해 과소집계를 막는다(브리프 MEDIUM). 키가 없으면 0 으로 취급한다.
    """
    keys = (
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    )
    total = 0
    for k in keys:
        try:
            total += int(usage.get(k, 0) or 0)
        except (TypeError, ValueError):
            pass
    return total


async def run_live() -> int:
    """MUNINN_GOAL 을 목표로 Claude Agent SDK 루프 실행.

    내구성(브리프 HIGH): run 루프 본문을 try/finally 로 감싸 예외/SIGTERM/타임아웃 등
    어떤 종료 경로에서도 terminal 보고(`final:true`)가 정확히 한 번은 전송되도록 보장한다 —
    그렇지 않으면 metaDB incident 가 'running' 으로 영구 고착된다. 동기 보고(_report)는
    async 컨텍스트에서 `asyncio.to_thread` 로 오프로드해 이벤트 루프(=SDK stdout 소비) 블로킹을 줄인다.
    """
    from claude_agent_sdk import (
        AssistantMessage,
        ResultMessage,
        TextBlock,
        ToolUseBlock,
        query,
    )

    goal = os.environ["MUNINN_GOAL"]
    pr_mode = _pr_mode()
    g = _guardrails()
    # 주입됐으나 파싱 실패(빈 dict)면 보수적 안전 한도 — 무제한 예산으로 폭주 방지.
    if os.getenv("MUNINN_GUARDRAILS", "") and not g:
        log("WARN: MUNINN_GUARDRAILS 파싱 실패 → 보수적 기본 한도(maxIterations=6, maxCostUsd=2) 적용")
        g = {"maxIterations": 6, "maxCostUsd": 2}
    max_turns = int(g.get("maxIterations", 12) or 12)
    max_cost = g.get("maxCostUsd")
    max_budget = float(max_cost) if max_cost else None  # 0/None=무제한(가드레일이 명시한 경우)
    # 재시도 attempt(같은 Issue)면 operator 가 직전 attempt 의 세션 ID 를 주입한다(§5.5).
    # transcript 미발견 시 새 세션 폴백(리뷰 MEDIUM-1) — 깨진 resume 으로 attempt 를 태우지 않는다.
    resume_id = _env("MUNINN_RESUME_SESSION_ID")
    if resume_id and not _has_transcript(resume_id):
        log(f"WARN: resume 대상 transcript 미발견(session={resume_id}) → 새 세션으로 시작")
        resume_id = ""
    # §3 게이트웨이: operator 가 주입한 ANTHROPIC_MODEL 을 SDK 옵션으로 명시 전달(CLI 기본값 비의존).
    model = _env("ANTHROPIC_MODEL")
    options = build_options(max_turns=max_turns, max_budget_usd=max_budget,
                            resume_session_id=resume_id, model=model)

    # SIGTERM(pod 축출/timeout 시 kubelet 이 보냄) → 현재 task 를 cancel 해 CancelledError 경로로
    # 진입시킨다. 그러면 try/except 가 terminal 보고를 보내고, 미보내면 metaDB incident 가 영구
    # 'running' 으로 고착된다(브리프 HIGH). add_signal_handler 가 불가한 환경(비-메인 스레드 등)은
    # 무시 — main() 의 try/finally 가 최후 방어선이다.
    try:
        loop = asyncio.get_running_loop()
        current = asyncio.current_task()
        if current is not None:
            loop.add_signal_handler(signal.SIGTERM, current.cancel)
    except (NotImplementedError, RuntimeError, ValueError) as exc:
        log(f"WARN: SIGTERM 핸들러 등록 실패(무시): {exc}")

    # 동기 보고를 thread 로 오프로드하는 헬퍼 — async 루프가 HTTP 지연에 블로킹되지 않게 한다(브리프 MEDIUM).
    async def report_async(patch: dict) -> dict | None:
        return await asyncio.to_thread(_report, patch)

    # SIGTERM(취소) 경로의 terminal 보고는 deadline 으로 예산을 제한해 pod grace period(기본 30s) 내에
    # 끝나도록 한다(브리프 항목3). MUNINN_SIGTERM_REPORT_BUDGET(기본 20s)로 조정 가능 — 운영자가
    # expandPodSpec 에 terminationGracePeriodSeconds≥60 을 명시하면 더 여유 있게 늘릴 수 있다.
    async def report_async_deadline(patch: dict, deadline: float) -> dict | None:
        return await asyncio.to_thread(_report, patch, deadline)

    # 1) 회상(recall) — 위임 직전, Muninn 메모리에서 관련 과거 사건/해결을 가져와 컨텍스트로 주입(설계 §3.1).
    #    동기 urllib 호출이므로 thread 로 오프로드(이벤트 루프 블로킹 방지).
    recalled = await asyncio.to_thread(_recall, goal, 6)
    recalled_ids = [m.get("id") for m in recalled if isinstance(m, dict) and m.get("id")]
    prompt = goal
    if recalled:
        facts = "\n".join(f"- {m.get('fact', '')}" for m in recalled[:6])
        prompt = f"{goal}\n\n[회상된 Muninn 메모리(참고)]\n{facts}"
        log(f"recall: {len(recalled)}건 회상 → 컨텍스트 주입")
    # 회상 결과를 status 에 기록(Agent→API 소유). phase 는 operator 가 소유하므로 건드리지 않는다.
    # SPI 계약 빌더로 변환(conformance 골든 기준) — score None 이면 키 생략.
    recalled_payload = build_recall_payload(recalled)
    await report_async({
        "step": 0,
        "recalledMemoryIds": recalled_payload,
    })

    log(f"live 시작: max_turns={max_turns}, max_budget_usd={max_budget}, pr_mode={pr_mode}, "
        f"resume={resume_id or '-'}, model={model or '(default)'}, "
        f"base_url={_env('ANTHROPIC_BASE_URL') or '(default)'}, goal={goal[:120]!r}")
    cost = 0.0
    tokens = 0
    turns = 0
    step = 0
    last_text = ""  # dry-run PR 계획 = 마지막 assistant 텍스트
    session_id = ""  # 이 run 의 Claude 세션 ID(스트림에서 캡처, 다음 attempt 의 resume 용 §5.5)
    is_error = False
    subtype = ""
    final_sent = False  # terminal 보고 중복 방지(정상 종료 경로 ↔ 예외/취소 경로)

    async def send_final(
        failed: bool,
        abort_reason: str = "",
        outcome_override: str = "",
        terminal_kind: str = "",
        report_deadline: float | None = None,
    ) -> bool:
        """terminal 보고(final:true)를 1회 전송한다. 성공 여부(API 도달 여부)를 반환.

        outcome_override 가 주어지면(승인 거절/만료/타임아웃 같은 정상 중단) 그 값을 outcome 으로 쓴다.
        terminal_kind(CONTRACT §C4): 승인 거절/만료/중단 종료의 *종류*를 web report route 에 알린다
        ("rejected"|"expired"|"aborted"). failed 와 별개 필드 — failed=False 라도 terminalKind 가 있으면
        web 은 succeeded 가 아니라 해당 상태(rejected/expired/aborted)로 사건을 기록한다.
        report_deadline(절대 monotonic 시각)이 주어지면 SIGTERM grace period 내에 끝나도록
        보고 전체 예산을 그 시각으로 제한한다(브리프 항목3 — grace 초과 SIGKILL 방지).
        """
        nonlocal final_sent
        if final_sent:
            return True
        final_sent = True
        output = last_text.strip()
        title_line = next((ln.strip("# ").strip() for ln in output.splitlines() if ln.strip()), "")
        ok_local = not failed
        if outcome_override:
            outcome = outcome_override
        else:
            outcome = (
                (f"DRY-RUN PR: {title_line[:80]}" if pr_mode == "dry-run" else title_line[:80])
                if ok_local and output else ""
            )
        if abort_reason:
            # 비정상 종료 표면화: outcome 비어 있으면 사유를 남겨 운영자가 'running 고착' 대신 원인을 본다.
            outcome = outcome or f"aborted: {abort_reason}"
        # terminal 보고 patch 는 SPI 계약 빌더로 조립한다(conformance 골든 기준, §2.2a). 세션 ID(§5.5)는
        # 같은 Issue 의 다음 attempt 가 resume 하도록 동봉하고, terminalKind 화이트리스트도 빌더가 강제한다.
        patch = build_report_patch(
            step=step, cost=cost, tokens=tokens, output=output, outcome=outcome,
            failed=failed, session_id=session_id, terminal_kind=terminal_kind,
        )
        res = await report_async_deadline(patch, report_deadline) if report_deadline is not None \
            else await report_async(patch)
        if res is None:
            # 최종 보고가 끝내 실패 — 결과가 소리 없이 사라지지 않도록 stdout/exit 로 표면화한다(브리프 HIGH).
            log("ERROR: 최종 보고 전송 실패(재시도 소진) — 결과가 API 에 기록되지 않았을 수 있음")
        return res is not None

    async def gate_approval() -> str:
        """위험 작업 직전 사람 승인(HITL) 게이트(CONTRACT §3). 반환 outcome:

          "" (빈)        → 승인됨/승인 불필요 → 작업 계속.
          "rejected: …"  → 거절 → 정상 중단(종료코드 0).
          "expired" / "approval-timeout" → 만료/타임아웃 → 정상 중단(종료코드 0).

        dry-run 에선 PR 계획 확정 직전, live 에선 실제 변경 적용 직전에 호출된다(여기선 query 루프 진입 직전).
        SIGTERM 시 asyncio.sleep 에서 CancelledError 가 올라와 상위 except 가 terminal 보고를 보낸다.
        """
        # plan 은 아직 없음(게이트가 query 루프 전) — 가용 컨텍스트(goal + pr_mode)로 detail 보강(브리프 항목5).
        reasons = _approval_reasons(goal, pr_mode=pr_mode)
        log(f"승인 요청(HITL): reasons={json.dumps(reasons, ensure_ascii=False)}")
        # 요청도 thread 오프로드(동기 urllib). 실패해도 폴링은 시도(이미 Pending 일 수 있음).
        await asyncio.to_thread(_request_approval, reasons)

        poll = _approval_poll_seconds()
        timeout = _approval_timeout_seconds()
        deadline = time.monotonic() + timeout
        log(f"승인 폴링 시작: 간격 {poll:.0f}s, 타임아웃 {timeout:.0f}s")
        while True:
            run_obj = await asyncio.to_thread(_poll_approval_once)
            state = _parse_approval_state(run_obj)
            if state == "Approved":
                log("승인됨(Approved) → 작업 계속")
                return ""
            if state == "Rejected":
                detail = _approval_detail(run_obj)
                log(f"거절됨(Rejected){f': {detail}' if detail else ''} → 정상 중단")
                return f"rejected: {detail}" if detail else "rejected"
            if state == "Expired":
                # Q7 결정(설계 §10-2): web TTL 이 만료의 단일 권위다. web 은 expiresAt 경과를 lazy 하게
                # approval.state="Expired" 로 표면화하고(incidents.ts approvalState), operator 가 주입하는
                # MUNINN_APPROVAL_TIMEOUT = web TTL + grace 라서 이 폴링 타임아웃(아래 wall-clock 백스톱)보다
                # web 의 Expired 가 *먼저* 관측된다 → terminalKind="expired" 가 결정적으로 기록된다. 아래
                # wall-clock "approval-timeout"→"aborted" 는 web 이 끝내 Expired 를 표면화하지 못한 경우의
                # 백스톱일 뿐이다(과거: web 미표면화로 이 분기가 도달 불가했으나 Q7 으로 해소).
                log("승인 만료(Expired) → 정상 중단")
                return "expired"
            # Pending/None(미파싱) → 계속 폴링. 타임아웃 경과 시 정상 중단.
            if time.monotonic() >= deadline:
                log("승인 타임아웃 → 정상 중단")
                return "approval-timeout"
            await asyncio.sleep(poll)

    try:
        # 승인 게이트 — 위험 작업(query 루프) 진입 직전. 거절/만료/타임아웃은 정상 중단(failed=False, exit 0).
        if _require_approval(g):
            gate_outcome = await gate_approval()
            if gate_outcome:
                # CONTRACT §C4: 종료 종류를 terminalKind 로 분리해 web 이 succeeded 로 오기록하지 않게 한다.
                #   rejected→"rejected", expired→"expired", approval-timeout→"aborted".
                #   (terminalKind 없이 failed=False 면 web 은 여전히 succeeded 로 기록한다.)
                terminal_kind = _gate_terminal_kind(gate_outcome)
                await send_final(failed=False, outcome_override=gate_outcome, terminal_kind=terminal_kind)
                log(f"live 종료(승인 게이트): outcome={gate_outcome!r}, terminalKind={terminal_kind!r}")
                print(json.dumps(
                    {"mode": "live", "ok": True, "turns": 0, "cost_usd": cost, "tokens": tokens,
                     "subtype": "approval-stop", "is_error": False, "outcome": gate_outcome,
                     "recalled": recalled_ids, "pr_mode": pr_mode},
                    ensure_ascii=False,
                ))
                return 0
        async for message in query(prompt=prompt, options=options):
            # 세션 ID 캡처(§5.5) — 스트림 첫 init 메시지에서 잡히는 즉시 보고한다. ResultMessage 만
            # 기다리면 도중 죽은 run(재시도가 필요한 바로 그 경우)이 세션을 남기지 못한다.
            if not session_id:
                sid = _extract_session_id(message)
                if sid:
                    session_id = sid
                    log(f"session: {session_id}" + (" (resumed)" if resume_id else ""))
                    await report_async({"step": step, "sessionId": session_id})
            if isinstance(message, AssistantMessage):
                step += 1
                for block in message.content:
                    if isinstance(block, TextBlock):
                        log(f"assistant: {block.text}")
                        if block.text.strip():
                            last_text = block.text
                    elif isinstance(block, ToolUseBlock):
                        log(f"tool_use: {block.name} {json.dumps(block.input, ensure_ascii=False)[:200]}")
                    # AssistantMessage 에 per-turn usage 가 실리면 누적해 중간 보고에 싣는다.
                    # (한계: SDK 버전에 따라 message.usage 가 ResultMessage 에만 올 수 있다 — 그 경우
                    #  중간 tokens 는 0 이고 최종 보고에서만 정확하다. 아래 ResultMessage 분기 참조.)
                msg_usage = getattr(message, "usage", None)
                if isinstance(msg_usage, dict):
                    tokens = max(tokens, _usage_tokens(msg_usage))
                # 진행 보고(스텝 단위) — step/cost/tokens(Agent→API 소유). 베스트에포트(thread 오프로드).
                await report_async({"step": step, "cost": f"{cost:.4f}", "tokens": tokens})
            elif isinstance(message, ResultMessage):
                cost = float(getattr(message, "total_cost_usd", 0.0) or 0.0)
                turns = int(getattr(message, "num_turns", 0) or 0)
                # 에이전트 실패(에러/max_turns 초과 등)를 성공으로 보고하지 않는다.
                is_error = bool(getattr(message, "is_error", False))
                subtype = str(getattr(message, "subtype", "") or "")
                usage = getattr(message, "usage", None)
                if isinstance(usage, dict):
                    # cache 토큰 포함 전체 합산(과소집계 방지). 최종값이므로 max 가 아니라 직접 대입.
                    tokens = _usage_tokens(usage)
    except asyncio.CancelledError:
        # SIGTERM(graceful cancel)/타임아웃 → 비정상 종료지만 terminal 보고는 반드시 보낸다.
        # pod grace period(기본 30s) 내에 끝나도록 deadline 으로 보고 예산을 제한한다(브리프 항목3):
        # 기본 보고는 retries=4 + backoff(~7.5s) + timeout 10s 로 최악 ~57s 라 grace 를 넘겨 SIGKILL
        # 위험이 있다. shield 로 취소 전파를 막아 보고가 중간에 끊기지 않게 한 뒤 deadline 으로 캡한다.
        is_error = True
        log("WARN: 실행이 취소됨(SIGTERM/timeout) — terminal 보고 전송(grace 제한)")
        deadline = time.monotonic() + _sigterm_report_budget_seconds()
        # 거절 선점 해소(브리프 항목1, finalSeverity HIGH): reject 는 operator 가
        # spec.suspend=true→SIGTERM 으로 runner 의 10s 승인 폴링을 거의 항상 선점한다. 그래서
        # 운영자 거절이 여기 CancelledError 경로로 들어와 terminalKind 없이 failed=True 로 보고되면
        # web report route 가 incidentStatus="failed" 로 오기록한다(거절≠실패). 이를 막기 위해
        # terminal 보고 *전* 1회 GET /api/runs/{run} 로 approval.state 를 확인한다:
        #   * "Rejected" → terminalKind="rejected"(failed=False) — 능동 거절로 정확히 기록.
        #   * 그 외/조회 실패 → 기존 aborted(failed=True) 폴백(보고 보장은 유지).
        # GET 은 grace 예산(deadline) 안에서 끝나도록 deadline 을 _http_json 에 넘겨 per-attempt
        # timeout 을 잔여로 캡한다(_poll_approval_once 가 아니라 deadline-aware 경로를 직접 호출).
        terminal_kind = ""
        cancel_failed = True
        cancel_reason = "cancelled"
        cancel_outcome = ""
        try:
            cancel_run_obj = await asyncio.shield(
                asyncio.to_thread(_get_run_deadline, deadline)
            )
            cancel_state = _parse_approval_state(cancel_run_obj)
            if cancel_state == "Rejected":
                detail = _approval_detail(cancel_run_obj)
                terminal_kind = "rejected"
                cancel_failed = False
                cancel_reason = ""
                cancel_outcome = f"rejected: {detail}" if detail else "rejected"
                log(f"취소 직전 조회: approval.state=Rejected → terminalKind=rejected(거절 기록){f': {detail}' if detail else ''}")
            elif cancel_state:
                log(f"취소 직전 조회: approval.state={cancel_state!r} → 거절 아님, aborted 폴백")
            else:
                log("취소 직전 조회: approval.state 미파싱/조회 실패 → aborted 폴백")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # 조회 실패는 보고 보장을 깨지 않게 폴백.
            log(f"WARN: 취소 직전 approval 조회 실패(무시) → aborted 폴백: {exc}")
        await asyncio.shield(
            send_final(
                failed=cancel_failed,
                abort_reason=cancel_reason,
                outcome_override=cancel_outcome,
                terminal_kind=terminal_kind,
                report_deadline=deadline,
            )
        )
        raise
    except Exception as exc:
        # SDK ProcessError 등 예외 — 결과 유실 방지를 위해 terminal 보고를 먼저 보낸다.
        is_error = True
        log(f"ERROR: 실행 중 예외: {exc} — terminal 보고 전송")
        await send_final(failed=True, abort_reason=f"exception: {exc}")
        raise

    ok = not is_error
    # 4) 결과 보고 + outcome(dry-run = PR 계획 요약). output 은 Agent→API 소유, outcome 은 Issue status.
    output = last_text.strip()
    await send_final(failed=is_error)

    # 5) 기억화 — 성공 시 결과를 재사용 가능한 메모리로 저장(요약은 Muninn API/코파일럿이 distill 할 수도 있음).
    if ok and output:
        fact = output if len(output) <= 600 else output[:600] + " …"
        await asyncio.to_thread(
            _store_memory, fact, (["dry-run", "pr-plan"] if pr_mode == "dry-run" else ["result"])
        )

    outcome = ""
    if ok and output:
        title_line = next((ln.strip("# ").strip() for ln in output.splitlines() if ln.strip()), "")
        outcome = f"DRY-RUN PR: {title_line[:80]}" if pr_mode == "dry-run" else title_line[:80]

    log(f"live 완료: turns={turns}, cost_usd={cost}, tokens={tokens}, subtype={subtype!r}, "
        f"is_error={is_error}, session={session_id or '-'}, outcome={outcome!r}")
    print(json.dumps(
        {"mode": "live", "ok": ok, "turns": turns, "cost_usd": cost, "tokens": tokens,
         "subtype": subtype, "is_error": is_error, "outcome": outcome,
         "recalled": recalled_ids, "pr_mode": pr_mode,
         "session_id": session_id, "resumed_from": resume_id},
        ensure_ascii=False,
    ))
    return 0 if ok else 1


def _terminal_report_best_effort(reason: str) -> None:
    """최후 방어선 — run_live 의 try/except 가 보내지 못한 경우(루프 진입 전 예외, asyncio.run
    자체 실패 등)에도 terminal 보고를 1회 시도한다. run_live 가 이미 보냈다면 web 쪽에서
    멱등 처리되거나 단순 중복일 뿐, 'running 영구 고착'보다는 안전하다(브리프 HIGH)."""
    try:
        _report({"final": True, "failed": True, "outcome": f"aborted: {reason}"})
    except Exception as exc:  # pragma: no cover - 보고 자체가 실패해도 종료는 막지 않는다
        log(f"WARN: 최후 terminal 보고 실패(무시): {exc}")


def main() -> int:
    if _is_selftest():
        return selftest()
    try:
        return asyncio.run(run_live())
    except KeyboardInterrupt:  # pragma: no cover
        log("WARN: KeyboardInterrupt — terminal 보고 시도")
        _terminal_report_best_effort("interrupted")
        return 130
    except Exception as exc:
        log(f"ERROR: 에이전트 실행 실패: {exc}")
        _terminal_report_best_effort(f"exception: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
