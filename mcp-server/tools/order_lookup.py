"""
Order Lookup MCP Tool
Input Schema: { order_id: string }
Output Schema: { status, eligible, days_since_purchase }
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict
from pydantic import BaseModel, Field, ValidationError

DATA_PATH = Path(__file__).resolve().parent.parent / "mock_data" / "orders.json"


class OrderLookupInput(BaseModel):
    order_id: str = Field(..., description="The unique order identifier", min_length=1)


def load_orders() -> dict[str, dict[str, Any]]:
    if DATA_PATH.exists():
        try:
            with open(DATA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "4521": {"status": "eligible", "eligible": True, "days_since_purchase": 12},
        "1002": {"status": "ineligible", "eligible": False, "days_since_purchase": 45}
    }


def execute_order_lookup(raw_input: dict[str, Any]) -> dict[str, Any]:
    """
    Executes order lookup without nested if-else ladders.
    Uses Pydantic validation and dictionary retrieval with structured fallback.
    """
    try:
        payload = OrderLookupInput.model_validate(raw_input)
    except ValidationError as err:
        return {
            "error": True,
            "code": "INVALID_INPUT",
            "message": f"Validation failed: {err.errors()}"
        }

    orders = load_orders()
    clean_id = str(payload.order_id).strip().lstrip("#")
    
    order = orders.get(clean_id)
    if not order:
        return {
            "error": True,
            "code": "ORDER_NOT_FOUND",
            "message": f"Order #{payload.order_id} could not be found in our records."
        }

    return {
        "status": order.get("status", "unknown"),
        "eligible": bool(order.get("eligible", False)),
        "days_since_purchase": int(order.get("days_since_purchase", 0)),
        "customer_id": order.get("customer_id"),
        "customer_name": order.get("customer_name"),
        "items": order.get("items", [])
    }


def run(order_id: str):
    return execute_order_lookup({"order_id": order_id})
