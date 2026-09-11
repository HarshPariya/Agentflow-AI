from flask import Flask, request, jsonify
from tools.order_lookup import run as order_lookup
from tools.ticket_lookup import run as ticket_lookup
from tools.create_ticket import run as create_ticket

app = Flask(__name__)

@app.route('/tools/order_lookup', methods=['POST'])
def handle_order_lookup():
    data = request.json
    return jsonify(order_lookup(data.get('order_id')))

@app.route('/tools/ticket_lookup', methods=['POST'])
def handle_ticket_lookup():
    data = request.json
    return jsonify(ticket_lookup(data.get('ticket_id')))

@app.route('/tools/create_ticket', methods=['POST'])
def handle_create_ticket():
    data = request.json
    return jsonify(create_ticket(data.get('subject'), data.get('description'), data.get('priority', 'medium')))

if __name__ == '__main__':
    app.run(port=9000)
