"""
Unit Tests for Standalone MCP Tools
Tests order_lookup, ticket_lookup, and create_ticket independently.
"""
import pytest
import sys
from pathlib import Path

# Add mcp-server root to path
MCP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(MCP_ROOT))

from tools.order_lookup import execute_order_lookup
from tools.ticket_lookup import execute_ticket_lookup
from tools.create_ticket import execute_create_ticket


def test_order_lookup_success():
    res = execute_order_lookup({"order_id": "4521"})
    assert res.get("error") is not True
    assert res.get("eligible") is True
    assert res.get("days_since_purchase") == 12


def test_order_lookup_not_found():
    res = execute_order_lookup({"order_id": "99999999"})
    assert res.get("error") is True
    assert res.get("code") == "ORDER_NOT_FOUND"


def test_order_lookup_invalid_input():
    res = execute_order_lookup({})
    assert res.get("error") is True
    assert res.get("code") == "INVALID_INPUT"


def test_ticket_lookup_success():
    res = execute_ticket_lookup({"ticket_id": "TIK-101"})
    assert res.get("error") is not True
    assert res.get("status") == "in_progress"
    assert "assignee" in res


def test_ticket_lookup_not_found():
    res = execute_ticket_lookup({"ticket_id": "TIK-NONEXISTENT"})
    assert res.get("error") is True
    assert res.get("code") == "TICKET_NOT_FOUND"


def test_create_ticket_success():
    res = execute_create_ticket({
        "subject": "System crash on reboot",
        "description": "Kernel panic occurred during OS startup sequence.",
        "priority": "urgent"
    })
    assert res.get("error") is not True
    assert res.get("created") is True
    assert res.get("ticket_id", "").startswith("TIK-")
    assert res.get("priority") == "urgent"
