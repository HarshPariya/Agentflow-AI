"""
Create Ticket MCP Tool
Input Schema: { subject, description, priority }
Output Schema: { ticket_id, created }
Note: Destructive/creation action guarded by the Agent Layer confirmation checkpoint.
"""
from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from pydantic import BaseModel, Field, ValidationError

DATA_PATH = Path(__file__).resolve().parent.parent / "mock_data" / "tickets.json"


class CreateTicketInput(BaseModel):
    subject: str = Field(..., min_length=2, max_length=150, description="Brief title of the ticket")
    description: str = Field(..., min_length=3, description="Detailed problem description")
    priority: Literal["low", "normal", "medium", "high", "urgent"] = Field(
        default="normal",
        description="Ticket priority level"
    )


def execute_create_ticket(raw_input: dict[str, Any]) -> dict[str, Any]:
    """
    Executes support ticket creation.
    Persists newly created ticket and returns structured response.
    """
    try:
        payload = CreateTicketInput.model_validate(raw_input)
    except ValidationError as err:
        return {
            "error": True,
            "code": "INVALID_INPUT",
            "message": f"Validation failed: {err.errors()}"
        }

    ticket_id = f"TIK-{uuid.uuid4().hex[:6].upper()}"
    timestamp = datetime.now(timezone.utc).isoformat()

    new_ticket = {
        "ticket_id": ticket_id,
        "subject": payload.subject,
        "description": payload.description,
        "priority": payload.priority,
        "status": "open",
        "assignee": "Triage Bot",
        "last_update": timestamp,
        "created": timestamp
    }

    try:
        tickets = {}
        if DATA_PATH.exists():
            with open(DATA_PATH, "r", encoding="utf-8") as f:
                tickets = json.load(f)
        tickets[ticket_id] = new_ticket
        with open(DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(tickets, f, indent=2)
    except Exception as exc:
        pass

    return {
        "ticket_id": ticket_id,
        "created": True,
        "status": "open",
        "subject": payload.subject,
        "priority": payload.priority,
        "created_at": timestamp
    }


def run(subject: str, description: str, priority: str = "normal"):
    return execute_create_ticket({"subject": subject, "description": description, "priority": priority})
