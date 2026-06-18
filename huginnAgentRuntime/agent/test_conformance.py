#!/usr/bin/env python3
"""SPI conformance 층1 — 골든 계약 테스트(설계 §8, operator-design §2.2a).

runner 의 Agent→API 보고/회상 페이로드 빌더(build_report_patch / build_recall_payload)가
conformance/golden_report_payloads.json 의 기대 출력과 정확히 일치하는지 검증한다. 같은 골든을
같은 골든을 huginn-self Go producer(runtimeapi)도 통과한다 → 두 *producer* 가 같은 계약에 묶인다(한쪽이
계약을 바꾸면 Python/Go 양쪽 테스트가 동시에 실패). muninnWeb report route(consumer) 측 골든 검증은 후속
(report-contract.test.ts) — 그때 producer↔consumer drift 까지 닫힌다(codegen 부재 → conformance 가 방어선, §4.5).

표준 라이브러리(unittest)만 사용(새 의존성 금지). 네트워크/SDK 불필요(빌더는 순수 함수).
실행: `python3 agent/test_conformance.py` (또는 pytest agent/).
"""

from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import runner  # noqa: E402

_GOLDEN = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "conformance", "golden_report_payloads.json"
)


def _load_golden() -> dict:
    with open(_GOLDEN, encoding="utf-8") as fh:
        return json.load(fh)


class ReportContractGoldenTest(unittest.TestCase):
    """build_report_patch(producer) 가 골든 report 케이스와 정확히 일치하는지."""

    def test_report_cases_match_golden(self):
        golden = _load_golden()
        cases = golden.get("report", [])
        self.assertTrue(cases, "golden 에 report 케이스가 없다 — fixture 누락?")
        for case in cases:
            with self.subTest(case=case["name"]):
                got = runner.build_report_patch(**case["args"])
                self.assertEqual(
                    got, case["expect"],
                    f"report 계약 불일치 [{case['name']}]: got={got} want={case['expect']}",
                )


class RecallContractGoldenTest(unittest.TestCase):
    """build_recall_payload(producer) 가 골든 recall 케이스와 정확히 일치하는지."""

    def test_recall_cases_match_golden(self):
        golden = _load_golden()
        cases = golden.get("recall", [])
        self.assertTrue(cases, "golden 에 recall 케이스가 없다 — fixture 누락?")
        for case in cases:
            with self.subTest(case=case["name"]):
                got = runner.build_recall_payload(case["input"])
                self.assertEqual(
                    got, case["expect"],
                    f"recall 계약 불일치 [{case['name']}]: got={got} want={case['expect']}",
                )


class ReportContractInvariantTest(unittest.TestCase):
    """골든에 싣기 번거로운 불변식(긴 출력 캡 등)을 직접 단언한다."""

    def test_output_capped_at_8000(self):
        patch = runner.build_report_patch(
            step=0, cost=0.0, tokens=0, output="x" * 9000, outcome="", failed=False,
        )
        self.assertEqual(len(patch["output"]), 8000, "output 은 8000자로 캡되어야 한다")

    def test_cost_is_decimal_string_4dp(self):
        patch = runner.build_report_patch(
            step=0, cost=1.23456, tokens=0, output="", outcome="", failed=False,
        )
        self.assertEqual(patch["cost"], "1.2346", "cost 는 소수 4자리 decimal 문자열이어야 한다")

    def test_none_output_safe(self):
        # output=None 이 들어와도 빈 문자열로 안전 처리(타입 방어).
        patch = runner.build_report_patch(
            step=0, cost=0.0, tokens=0, output=None, outcome="", failed=False,
        )
        self.assertEqual(patch["output"], "")


if __name__ == "__main__":
    unittest.main()
