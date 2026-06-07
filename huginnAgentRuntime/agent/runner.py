#!/usr/bin/env python3
"""Huginn agent-runtime 런너 — Claude Agent SDK 루프(설계서 §5.1~§5.4).

claude_skill.sh 가 컨텍스트(env)를 준비한 뒤 이 모듈을 exec 한다. 두 모드:

* live(기본): MUNINN_GOAL 을 목표로 Claude Agent SDK `query()` 루프를 돌린다.
  - max_turns ← MUNINN_GUARDRAILS.maxIterations (§5.4)
  - 인증은 env 의 ANTHROPIC_API_KEY 또는 CLAUDE_CODE_OAUTH_TOKEN(claude CLI 가 소비)
* selftest(--selftest / MUNINN_SELFTEST=1 / ANTHROPIC_API_KEY=SELFTEST):
  API 호출 없이 SDK import·옵션 구성·claude CLI 응답만 검증하고 exit 0. kind/CI QA 용.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys


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
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _http_json(method: str, url: str, body: dict | None = None, timeout: float = 10.0) -> dict | None:
    """JSON 요청 후 응답(dict)을 반환. 실패해도 에이전트 루프를 막지 않도록 None 반환."""
    if not url:
        return None
    data = json.dumps(body or {}, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8") or "{}"
            return json.loads(raw)
    except (urllib.error.URLError, ValueError, OSError) as exc:
        log(f"WARN: HTTP {method} {url} 실패: {exc}")
        return None


def _report(patch: dict) -> dict | None:
    """진행 보고 → POST {MUNINN_API_ENDPOINT}/api/runs/{run}/report (Agent→API 소유 필드)."""
    api = _env("MUNINN_API_ENDPOINT")
    run = _env("MUNINN_RUN_NAME")
    if not api or not run:
        return None
    issue = _env("MUNINN_ISSUE_NAME")
    if issue and "issueName" not in patch:
        patch = {**patch, "issueName": issue}
    return _http_json("POST", f"{api.rstrip('/')}/api/runs/{run}/report", patch)


def _recall(query: str, k: int = 6) -> list:
    """위임 직전 회상 → POST {MUNINN_MEMORY_ENDPOINT}/api/memories/recall."""
    mem = _env("MUNINN_MEMORY_ENDPOINT")
    if not mem or not query:
        return []
    app = _env("MUNINN_AGENT_NAME")
    body = {"query": query, "k": k, **({"app": app} if app else {})}
    res = _http_json("POST", f"{mem.rstrip('/')}/api/memories/recall", body)
    items = (res or {}).get("items") or []
    return items if isinstance(items, list) else []


def _store_memory(fact: str, tags: list | None = None) -> dict | None:
    """결과 기억화 → POST {MUNINN_MEMORY_ENDPOINT}/api/memories."""
    mem = _env("MUNINN_MEMORY_ENDPOINT")
    if not mem or not fact:
        return None
    app = _env("MUNINN_AGENT_NAME")
    body = {
        "fact": fact,
        "tags": tags or [],
        "sourceRunId": _env("MUNINN_RUN_NAME") or None,
        "changedBy": "agent",
        **({"app": app, "appName": app, "scope": "app"} if app else {"scope": "global"}),
    }
    return _http_json("POST", f"{mem.rstrip('/')}/api/memories", body)


def build_options(max_turns: int, max_budget_usd: float | None = None):
    """ClaudeAgentOptions 를 구성(라이브/셀프테스트 공통). SDK 계약 검증 지점.

    guardrails 매핑(§5.4): maxIterations→max_turns, maxCostUsd→max_budget_usd.
    maxTokens 는 SDK 직접 옵션이 없어 플랫폼(Muninn API)이 step 누적으로 추적/집행한다.
    """
    from claude_agent_sdk import ClaudeAgentOptions

    permission_mode = os.getenv("MUNINN_PERMISSION_MODE", "bypassPermissions")
    opts: dict = {
        "system_prompt": _system_prompt(),
        "max_turns": max_turns,
        "permission_mode": permission_mode,
    }
    if max_budget_usd is not None and max_budget_usd > 0:
        opts["max_budget_usd"] = max_budget_usd
    return ClaudeAgentOptions(**opts)


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

    # 2) ClaudeAgentOptions 구성(API 시그니처 검증) — max_budget_usd 배선 경로도 커버
    try:
        build_options(max_turns=1, max_budget_usd=1.0)
        report["checks"]["claude_agent_options"] = "ok"
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

    # 3) 플랫폼 CLI 존재 + claude CLI 응답(Node 런타임 동작 확인)
    for tool in ("claude", "kubectl", "helm", "argocd", "gh", "git", "jq", "yq"):
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

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


async def run_live() -> int:
    """MUNINN_GOAL 을 목표로 Claude Agent SDK 루프 실행."""
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
    options = build_options(max_turns=max_turns, max_budget_usd=max_budget)

    # 1) 회상(recall) — 위임 직전, Muninn 메모리에서 관련 과거 사건/해결을 가져와 컨텍스트로 주입(설계 §3.1).
    recalled = _recall(goal, k=6)
    recalled_ids = [m.get("id") for m in recalled if isinstance(m, dict) and m.get("id")]
    prompt = goal
    if recalled:
        facts = "\n".join(f"- {m.get('fact', '')}" for m in recalled[:6])
        prompt = f"{goal}\n\n[회상된 Muninn 메모리(참고)]\n{facts}"
        log(f"recall: {len(recalled)}건 회상 → 컨텍스트 주입")
    # 회상 결과를 status 에 기록(Agent→API 소유). phase 는 operator 가 소유하므로 건드리지 않는다.
    # score 가 None 이면 "None" 문자열이 들어가지 않게 생략한다.
    recalled_payload = []
    for m in recalled:
        if isinstance(m, dict) and m.get("id"):
            item = {"id": m["id"]}
            if m.get("score") is not None:
                item["score"] = str(m["score"])
            recalled_payload.append(item)
    _report({
        "step": 0,
        "recalledMemoryIds": recalled_payload,
    })

    log(f"live 시작: max_turns={max_turns}, max_budget_usd={max_budget}, pr_mode={pr_mode}, goal={goal[:120]!r}")
    cost = 0.0
    tokens = 0
    turns = 0
    step = 0
    last_text = ""  # dry-run PR 계획 = 마지막 assistant 텍스트
    is_error = False
    subtype = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            step += 1
            for block in message.content:
                if isinstance(block, TextBlock):
                    log(f"assistant: {block.text}")
                    if block.text.strip():
                        last_text = block.text
                elif isinstance(block, ToolUseBlock):
                    log(f"tool_use: {block.name} {json.dumps(block.input, ensure_ascii=False)[:200]}")
            # 진행 보고(스텝 단위) — step/cost/tokens(Agent→API 소유). 베스트에포트.
            _report({"step": step, "cost": f"{cost:.4f}", "tokens": tokens})
        elif isinstance(message, ResultMessage):
            cost = float(getattr(message, "total_cost_usd", 0.0) or 0.0)
            turns = int(getattr(message, "num_turns", 0) or 0)
            # 에이전트 실패(에러/max_turns 초과 등)를 성공으로 보고하지 않는다.
            is_error = bool(getattr(message, "is_error", False))
            subtype = str(getattr(message, "subtype", "") or "")
            usage = getattr(message, "usage", None)
            if isinstance(usage, dict):
                tokens = int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))

    ok = not is_error
    # 4) 결과 보고 + outcome(dry-run = PR 계획 요약). output 은 Agent→API 소유, outcome 은 Issue status.
    output = last_text.strip()
    title_line = next((ln.strip("# ").strip() for ln in output.splitlines() if ln.strip()), "")
    outcome = (f"DRY-RUN PR: {title_line[:80]}" if pr_mode == "dry-run" else title_line[:80]) if ok and output else ""
    _report({
        "step": step,
        "cost": f"{cost:.4f}",
        "tokens": tokens,
        "output": output[:8000],
        "outcome": outcome,
        "final": True,
        "failed": is_error,
    })

    # 5) 기억화 — 성공 시 결과를 재사용 가능한 메모리로 저장(요약은 Muninn API/코파일럿이 distill 할 수도 있음).
    if ok and output:
        fact = output if len(output) <= 600 else output[:600] + " …"
        _store_memory(fact, tags=(["dry-run", "pr-plan"] if pr_mode == "dry-run" else ["result"]))

    log(f"live 완료: turns={turns}, cost_usd={cost}, tokens={tokens}, subtype={subtype!r}, is_error={is_error}, outcome={outcome!r}")
    print(json.dumps(
        {"mode": "live", "ok": ok, "turns": turns, "cost_usd": cost, "tokens": tokens,
         "subtype": subtype, "is_error": is_error, "outcome": outcome,
         "recalled": recalled_ids, "pr_mode": pr_mode},
        ensure_ascii=False,
    ))
    return 0 if ok else 1


def main() -> int:
    if _is_selftest():
        return selftest()
    try:
        return asyncio.run(run_live())
    except KeyboardInterrupt:  # pragma: no cover
        return 130
    except Exception as exc:
        log(f"ERROR: 에이전트 실행 실패: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
