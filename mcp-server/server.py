from flask import Flask, request, jsonify
from tools.order_lookup import execute_order_lookup
from tools.ticket_lookup import execute_ticket_lookup
from tools.create_ticket import execute_create_ticket

app = Flask(__name__)

SCHEMAS = {
    "order_lookup": {"order_id": str},
    "ticket_lookup": {"ticket_id": str},
    "create_ticket": {"subject": str, "description": str, "priority": str},
}

def dispatch(tool: str, arguments: dict):
    if tool == "order_lookup":
        return execute_order_lookup(arguments)
    if tool == "ticket_lookup":
        return execute_ticket_lookup(arguments)
    if tool == "create_ticket":
        return execute_create_ticket(arguments)
    return {"error": True, "code": "UNKNOWN_TOOL", "message": f"Unknown tool '{tool}'."}

@app.route('/tools/call', methods=['POST'])
def handle_tool_call():
    data = request.get_json(silent=True) or {}
    return jsonify(dispatch(data.get("tool"), data.get("arguments") or {}))

@app.route('/tools/<tool_name>', methods=['POST'])
def handle_legacy_tool(tool_name):
    data = request.get_json(silent=True) or {}
    args = {k: data.get(k) for k in SCHEMAS.get(tool_name, {})}
    return jsonify(dispatch(tool_name, args))

if __name__ == '__main__':
    app.run(port=9000)
