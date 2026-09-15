"""
Async MCP Client
Communicates with the standalone MCP server over HTTP/JSON-RPC.
Includes an in-process direct fallback to ensure resilience in local/testing environments.
"""
from __future__ import annotations
import logging
import sys
from pathlib import Path
from typing import Any, Dict
import httpx

from config import settings

logger = logging.getLogger("mcp_client")

# Dynamically add mcp-server directory to sys.path for in-process fallback
MCP_DIR = Path(__file__).resolve().parent.parent.parent.parent / "mcp-server"
if str(MCP_DIR) not in sys.path:
    sys.path.insert(0, str(MCP_DIR))

try:
    from tools.order_lookup import execute_order_lookup  # type: ignore
    from tools.ticket_lookup import execute_ticket_lookup  # type: ignore
    from tools.create_ticket import execute_create_ticket  # type: ignore

    IN_PROCESS_TOOLS: Dict[str, Any] = {
        "order_lookup": execute_order_lookup,
        "ticket_lookup": execute_ticket_lookup,
        "create_ticket": execute_create_ticket,
    }
except Exception as exc:
    logger.warning("In-process MCP tool import notice: %s", exc)
    IN_PROCESS_TOOLS = {}


async def call_mcp_tool(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calls an MCP tool via HTTP or falls back to in-process tool registry.
    Returns structured output or structured error without raw exception raising.
    """
    # Try calling via MCP HTTP server first
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{settings.mcp_server_url}/tools/call",
                json={"tool": tool_name, "arguments": arguments}
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as exc:
        logger.debug("MCP HTTP server unreachable (%s), attempting in-process fallback", exc)

    # In-process fallback
    tool_fn = IN_PROCESS_TOOLS.get(tool_name)
    if tool_fn:
        return tool_fn(arguments)

    return {
        "error": True,
        "code": "TOOL_UNAVAILABLE",
        "message": f"MCP tool '{tool_name}' could not be executed."
    }
