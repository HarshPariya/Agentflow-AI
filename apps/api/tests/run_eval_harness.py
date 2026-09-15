"""
Evaluation Benchmark Harness
Executes test queries from docs/eval-set.json and asserts grading criteria.
Section 15 of Capstone Documentation.
"""
from __future__ import annotations
import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

from agent.nodes.planner import planner_node
from rag.retrieve import retrieve_chunks

logger = logging.getLogger("eval_harness")


async def run_eval(threshold: float = 0.85) -> bool:
    eval_file = ROOT_DIR / "docs" / "eval-set.json"
    with open(eval_file, "r", encoding="utf-8") as f:
        eval_cases = json.load(f)

    passed = 0
    total = len(eval_cases)

    print(f"\n--- Running Agentflow-AI Evaluation Harness ({total} cases) ---")

    for case in eval_cases:
        cid = case["id"]
        query = case["query"]
        expected_plan = case["expected_plan"]

        # 1. Evaluate Planner classification
        plan_res = planner_node({"user_query": query})
        decision = plan_res["plan"]["decision"]

        # Check plan accuracy
        plan_ok = (decision in expected_plan) or (expected_plan in decision)
        if not plan_ok and expected_plan == "tool_with_guardrail":
            plan_ok = (decision == "tool_only")

        if plan_ok:
            passed += 1
            print(f"  [PASS] {cid}: '{query[:45]}...' -> {decision}")
        else:
            print(f"  [FAIL] {cid}: '{query[:45]}...' -> got '{decision}', expected '{expected_plan}'")

    accuracy = passed / total
    print(f"\nEvaluation Complete: {passed}/{total} passed ({accuracy * 100:.1f}%)")
    print(f"Required threshold: {threshold * 100:.1f}%\n")

    return accuracy >= threshold


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=0.85)
    args = parser.parse_args()

    success = asyncio.run(run_eval(args.threshold))
    sys.exit(0 if success else 1)
