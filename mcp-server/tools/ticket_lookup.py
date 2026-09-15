"""
Ticket Lookup MCP Tool
Input Schema: { ticket_id: string }
Output Schema: { status, assignee, last_update }
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field, ValidationError

DATA_PATH = Path(__file__).resolve().parent.parent / "mock_data" / "tickets.json"


class TicketLookupInput(BaseModel):
    ticket_id: str = Field(..., description="The unique support ticket ID (e.g. TIK-101)", min_length=1)


def load_tickets() -> dict[str, dict[str, Any]]:
    if DATA_PATH.exists():
        try:
            with open(DATA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "TIK-101": {"status": "in_progress", "assignee": "Alex Rivera", "last_update": "2026-09-10T11:45:00Z"},
        "TIK-102": {"status": "resolved", "assignee": "Marcus Vance", "last_update": "2026-09-11T09:15:00Z"}
    }


def execute_ticket_lookup(raw_input: dict[str, Any]) -> dict[str, Any]:
    """
    Executes support ticket lookup.
    Returns structured error response on invalid input or non-existent ticket.
    """
    try:
        payload = TicketLookupInput.model_validate(raw_input)
    except ValidationError as err:
        return {
            "error": True,
            "code": "INVALID_INPUT",
            "message": f"Validation failed: {err.errors()}"
        }

    tickets = load_tickets()
    clean_id = str(payload.ticket_id).strip().upper()

    ticket = tickets.get(clean_id)
    if not ticket:
        return {
            "error": True,
            "code": "TICKET_NOT_FOUND",
            "message": f"Ticket {payload.ticket_id} was not found."
        }

    return {
        "status": ticket.get("status", "open"),
        "assignee": ticket.get("assignee", "Unassigned"),
        "last_update": ticket.get("last_update", ""),
        "subject": ticket.get("subject"),
        "priority": ticket.get("priority", "normal")
    }


def run(ticket_id: str):
    return execute_ticket_lookup({"ticket_id": ticket_id})
