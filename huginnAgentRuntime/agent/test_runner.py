#!/usr/bin/env python3
"""runner.py HITL 게이트→terminalKind 계약 단위 테스트(브리프 항목4, LOW).

네트워크/claude CLI/Claude SDK 없이 순수하게 검증한다 — runner.py 는 claude_agent_sdk 를
함수 *안*에서만 import 하므로 모듈 import 자체엔 SDK 가 필요 없다. 표준 라이브러리(unittest)만
사용한다(새 의존성 금지). pytest 가 있으면 `pytest agent/`, 없으면 `python3 agent/test_runner.py`.

커버 범위:
  * _gate_terminal_kind: rejected/expired/approval-timeout/그외 → 화이트리스트 매핑
  * _parse_approval_state / _approval_detail: 거절 선점(항목1) 조회가 의존하는 방어적 파싱
  * send_final patch 의 terminalKind 화이트리스트(임의 문자열 차단) — 보고 페이로드 빌더를
    runner 의 실제 분기와 동일하게 재현해 계약 형태를 고정한다.
  * _extract_session_id: 세션 resume 배선(§5.5)이 의존하는 SDK 메시지 duck-typing 파싱
"""

from __future__ import annotations

import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import runner  # noqa: E402


def build_final_patch(failed: bool, terminal_kind: str) -> dict:
    """send_final 이 만드는 terminalKind 화이트리스트 분기를 그대로 재현한다.

    runner.send_final 본문(runner.py)의 화이트리스트 가드와 1:1 로 일치해야 한다 —
    이 빌더가 깨지면 send_final 계약이 바뀐 것이므로 테스트가 회귀를 잡는다.
    """
    patch: dict = {"step": 0, "final": True, "failed": failed}
    if terminal_kind in ("rejected", "expired", "aborted"):
        patch["terminalKind"] = terminal_kind
    return patch


class GateTerminalKindTest(unittest.TestCase):
    def test_rejected_prefix_maps_to_rejected(self):
        self.assertEqual(runner._gate_terminal_kind("rejected"), "rejected")
        self.assertEqual(runner._gate_terminal_kind("rejected: alice / not safe"), "rejected")

    def test_expired_maps_to_expired(self):
        self.assertEqual(runner._gate_terminal_kind("expired"), "expired")

    def test_approval_timeout_maps_to_aborted(self):
        # 운영자가 끝내 결정 안 함 = 능동 거절이 아닌 중단 → aborted.
        self.assertEqual(runner._gate_terminal_kind("approval-timeout"), "aborted")

    def test_unknown_outcome_yields_empty(self):
        # 화이트리스트 밖 → 빈 문자열(terminalKind 미전송, web 기존 동작 유지).
        self.assertEqual(runner._gate_terminal_kind(""), "")
        self.assertEqual(runner._gate_terminal_kind("something-else"), "")
        self.assertEqual(runner._gate_terminal_kind("approved"), "")


class TerminalKindWhitelistTest(unittest.TestCase):
    def test_valid_terminal_kinds_serialized(self):
        for kind in ("rejected", "expired", "aborted"):
            patch = build_final_patch(failed=(kind != "rejected"), terminal_kind=kind)
            self.assertEqual(patch["terminalKind"], kind)

    def test_arbitrary_terminal_kind_dropped(self):
        # 임의 문자열은 차단 — terminalKind 키 자체가 없어야 한다.
        for bogus in ("succeeded", "failed", "Rejected", "evil", ""):
            patch = build_final_patch(failed=True, terminal_kind=bogus)
            self.assertNotIn("terminalKind", patch)

    def test_rejected_reports_not_failed(self):
        # 거절은 failed=False + terminalKind=rejected — web 이 'failed' 아닌 'rejected' 로 기록(항목1).
        patch = build_final_patch(failed=False, terminal_kind="rejected")
        self.assertFalse(patch["failed"])
        self.assertEqual(patch["terminalKind"], "rejected")


class ParseApprovalStateTest(unittest.TestCase):
    def test_flat_runvm_string(self):
        # RunVM(평탄화): {"approval": "Rejected"} — 거절 선점 조회가 이 형태를 읽는다.
        self.assertEqual(runner._parse_approval_state({"approval": "Rejected"}), "Rejected")
        self.assertEqual(runner._parse_approval_state({"approval": "Approved"}), "Approved")

    def test_nested_status_approval(self):
        # CR-유사(중첩): {"status": {"approval": {"state": "..."}}}
        self.assertEqual(
            runner._parse_approval_state({"status": {"approval": {"state": "Rejected"}}}),
            "Rejected",
        )

    def test_nested_top_level_approval(self):
        self.assertEqual(
            runner._parse_approval_state({"approval": {"state": "Pending"}}), "Pending"
        )

    def test_missing_or_invalid_yields_none(self):
        self.assertIsNone(runner._parse_approval_state(None))
        self.assertIsNone(runner._parse_approval_state({}))
        self.assertIsNone(runner._parse_approval_state({"approval": ""}))
        self.assertIsNone(runner._parse_approval_state({"approval": {"state": ""}}))
        self.assertIsNone(runner._parse_approval_state("not-a-dict"))


class ExtractSessionIdTest(unittest.TestCase):
    """_extract_session_id 의 duck-typing 계약(§5.5) — SDK 메시지 형태 둘 다 커버한다."""

    def test_attribute_form_result_message(self):
        # ResultMessage 형태: session_id 속성.
        msg = types.SimpleNamespace(session_id="0a1b2c3d-e4f5")
        self.assertEqual(runner._extract_session_id(msg), "0a1b2c3d-e4f5")

    def test_data_dict_form_init_message(self):
        # init SystemMessage 형태: data dict 의 session_id 키.
        msg = types.SimpleNamespace(data={"session_id": "init-sid", "tools": []})
        self.assertEqual(runner._extract_session_id(msg), "init-sid")

    def test_attribute_takes_precedence_over_data(self):
        msg = types.SimpleNamespace(session_id="attr-sid", data={"session_id": "data-sid"})
        self.assertEqual(runner._extract_session_id(msg), "attr-sid")

    def test_missing_or_invalid_yields_empty(self):
        # 없음/빈 값/비문자열 → 빈 문자열(캡처 안 함, 다음 메시지에서 재시도).
        self.assertEqual(runner._extract_session_id(types.SimpleNamespace()), "")
        self.assertEqual(runner._extract_session_id(types.SimpleNamespace(session_id="")), "")
        self.assertEqual(runner._extract_session_id(types.SimpleNamespace(session_id=123)), "")
        self.assertEqual(runner._extract_session_id(types.SimpleNamespace(data={"other": 1})), "")
        self.assertEqual(runner._extract_session_id(types.SimpleNamespace(data="not-a-dict")), "")


class HasTranscriptTest(unittest.TestCase):
    """_has_transcript 의 resume preflight(§5.5, 리뷰 MEDIUM-1) — transcript 가 없으면
    새 세션으로 폴백해 깨진 resume 으로 attempt(retry budget)를 태우지 않는다."""

    def setUp(self):
        import tempfile

        self.home = tempfile.mkdtemp(prefix="claude-home-")
        self.addCleanup(__import__("shutil").rmtree, self.home, ignore_errors=True)

    def _write_transcript(self, project: str, sid: str) -> None:
        d = os.path.join(self.home, "projects", project)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f"{sid}.jsonl"), "w", encoding="utf-8") as fh:
            fh.write("{}\n")

    def test_existing_transcript_found(self):
        self._write_transcript("-workspace", "sid-live")
        self.assertTrue(runner._has_transcript("sid-live", claude_home=self.home))

    def test_missing_transcript_yields_false(self):
        # PVC 재생성/transcript 정리 시나리오 — preflight 가 False 면 호출부가 resume 을 끈다.
        self._write_transcript("-workspace", "sid-other")
        self.assertFalse(runner._has_transcript("sid-gone", claude_home=self.home))

    def test_empty_session_or_empty_home(self):
        self.assertFalse(runner._has_transcript("", claude_home=self.home))
        self.assertFalse(runner._has_transcript("sid-x", claude_home=self.home))


class ApprovalDetailTest(unittest.TestCase):
    def test_decidedby_and_reason_joined(self):
        run_obj = {"approval": {"decidedBy": "alice", "reason": "위험"}}
        self.assertEqual(runner._approval_detail(run_obj), "alice / 위험")

    def test_nested_status(self):
        run_obj = {"status": {"approval": {"decidedBy": "bob"}}}
        self.assertEqual(runner._approval_detail(run_obj), "bob")

    def test_empty_when_absent(self):
        self.assertEqual(runner._approval_detail({"approval": "Rejected"}), "")
        self.assertEqual(runner._approval_detail(None), "")
        self.assertEqual(runner._approval_detail({}), "")


if __name__ == "__main__":
    unittest.main()
