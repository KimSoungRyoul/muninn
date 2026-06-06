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


def _system_prompt() -> str:
    # 글로벌/팀/SOUL 프롬프트는 ConfigMap 참조(MUNINN_*_REF)로 전달되며 마운트 후 합성된다(§5.1).
    # MVP 런너는 goal 중심의 최소 system prompt 를 구성한다.
    return (
        "당신은 Huginn DevOps 에이전트입니다. 주어진 운영 이벤트(goal)를 진단하고, "
        "허용된 도구만 사용하며, 출력 정책에 따라 결과(PR/Issue)를 만듭니다. "
        "안전 한도(guardrails)를 절대 넘지 마세요."
    )


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
    g = _guardrails()
    max_turns = int(g.get("maxIterations", 12) or 12)
    max_cost = g.get("maxCostUsd")
    max_budget = float(max_cost) if max_cost else None  # 0/None=무제한
    options = build_options(max_turns=max_turns, max_budget_usd=max_budget)

    log(f"live 시작: max_turns={max_turns}, max_budget_usd={max_budget}, goal={goal[:120]!r}")
    cost = 0.0
    tokens = 0
    turns = 0
    is_error = False
    subtype = ""
    async for message in query(prompt=goal, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    log(f"assistant: {block.text}")
                elif isinstance(block, ToolUseBlock):
                    log(f"tool_use: {block.name} {json.dumps(block.input, ensure_ascii=False)[:200]}")
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
    log(f"live 완료: turns={turns}, cost_usd={cost}, tokens={tokens}, subtype={subtype!r}, is_error={is_error}")
    print(json.dumps(
        {"mode": "live", "ok": ok, "turns": turns, "cost_usd": cost, "tokens": tokens,
         "subtype": subtype, "is_error": is_error},
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
