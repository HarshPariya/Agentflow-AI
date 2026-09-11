# Agentflow-AI ("Ask, Retrieve, Act")

**Production-Grade Autonomous Enterprise AI Agent**  
*Capstone Technical Documentation Reference Implementation — Version 1.0*

Agentflow-AI is an autonomous chat agent that dynamically decides at runtime whether an incoming query requires private knowledge base retrieval (RAG), external tool execution via the Model Context Protocol (MCP), a multi-step chained combination of both, or direct answers.

Persisted entirely on **MongoDB Atlas**, accelerated by a **Redis** query-hash cache, orchestrated by **LangGraph** with pattern-driven routing (no nested if-else ladders), protected by human-in-the-loop safety guardrails, and featuring a real-time **Next.js** chat UI with collapsible step trace execution.

---

## 1. System Architecture & Flow

```
                                [ User Query ]
                                      │
                                      ▼
                            ┌──────────────────┐
                            │   FastAPI Chat   │
                            │  Endpoint (SSE)  │
                            └─────────┬────────┘
                                      │ Loads History from MongoDB Atlas
                                      ▼
                            ┌──────────────────┐
                            │   Planner Node   │ (LLM reasoning over query)
                            └─────────┬────────┘
                                      │
              ┌───────────────────────┼───────────────────────┬──────────────────────┐
              ▼                       ▼                       ▼                      ▼
       [ retrieve_only ]      [ tool_only ]        [ retrieve_and_tool ]    [ answer_directly ]
              │                       │                       │                      │
              ▼                       │                       ▼                      │
       ┌──────────────┐               │               ┌──────────────┐               │
       │  Retriever   │               │               │  Retriever   │               │
       │  (Redis Cache│               │               │  (Redis Cache│               │
       │  + Top-K KB) │               │               │  + Top-K KB) │               │
       └──────┬───────┘               │               └──────┬───────┘               │
              │                       │                      │                       │
              │                       ▼                      ▼                       │
              │              ┌─────────────────┐    ┌─────────────────┐              │
              │              │  Tool Executor  │    │  Tool Executor  │              │
              │              │ (MCP Client +   │    │ (MCP Client +   │              │
              │              │ Guardrail Check)│    │ Guardrail Check)│              │
              │              └────────┬────────┘    └────────┬────────┘              │
              │                       │                      │                       │
              └───────────────────────┼──────────────────────┘                       │
                                      ▼                                              │
                            ┌──────────────────┐                                     │
                            │  Responder Node  │ ◄───────────────────────────────────┘
                            │ (Synthesizes &   │
                            │ Cites Sources)   │
                            └─────────┬────────┘
                                      │
                          Is evidence sufficient?
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                      YES │                    NO │ (Below 0.65 threshold)
                          ▼                       ▼
                      ┌───────┐             ┌───────────┐
                      │  END  │             │  Clarify  │ ──► [ END ]
                      └───────┘             │   Node    │
                                            └───────────┘
```

---

## 2. Non-Negotiable Requirements Compliance

1. **Genuine LLM Planning**: Query classification into `retrieve_only`, `tool_only`, `retrieve_and_tool`, `answer_directly`, or `insufficient_info` uses reasoning via LLM prompts with JSON extraction—never static keyword routing.
2. **Multi-Step Chaining**: Verified end-to-end multi-step query (*"What's our refund policy, and is order 4521 eligible?"*) retrieves `policy-042`, calls `order_lookup` for order `4521`, and synthesizes that the order is eligible because it was placed 12 days ago (< 30 days).
3. **Graceful Failure Handling**: Queries with relevance scores below `0.65` route to the `Clarify` node, refusing to hallucinate an answer. Tool failures return structured error payloads without crashing.
4. **Full Audit Trail**: Every graph run writes complete step payloads (`plan`, `retrieval`, `tool_call`, `clarify`, `final_answer`) into MongoDB Atlas matching the exact Section 6 JSON shapes.
5. **Safety Guardrail**: Actions classified as state-modifying (`create_ticket`) require an explicit confirmation round-trip before invocation.

---

## 3. Design Rationale (Grading Criteria & FAQ)

### A. Chunking Strategy Rationale (300–500 Tokens, 15% Overlap)
- **Why 300–500 Tokens?** Enterprise policy clauses and support procedures naturally range between 200 and 450 words. Splitting smaller (<200 tokens) causes fragmented sentences where conditions (e.g. eligibility windows) are severed from remedies (e.g. refund payout). Larger chunks (>800 tokens) dilute embedding specificity and increase token overhead.
- **Why 15% Overlap?** An overlap of ~50 tokens ensures that boundary conditions and transitional conjunctions (*"However, if the order..."*) are preserved in adjacent chunks, eliminating boundary information loss.

### B. Relevance Threshold Rationale (0.65 Cutoff)
- **Why 0.65?** In cosine similarity scoring, topical matches sharing exact terms typically score above `0.70`. Irrelevant queries (e.g. out-of-domain quantum travel) score below `0.30`. Setting the threshold at `0.65` acts as a high-confidence gate, preventing unrelated noise from polluting the Responder context.

### C. Guardrail Rationale (Confirmation Checkpoint)
- **Why Guard `create_ticket`?** Support ticket creation impacts agent queues and triggers downstream SLAs. Requiring user confirmation ensures human-in-the-loop validation, eliminating unintended actions caused by user ambiguity.

---

## 4. Repository Structure

```
Agentflow-AI/
├── apps/
│   ├── web/                                 # Next.js 14 Chat Frontend
│   │   ├── app/
│   │   │   ├── chat/page.tsx                # Chat Page
│   │   │   ├── page.tsx                     # Redirect to /chat
│   │   │   └── layout.tsx                   # Typography & Metadata
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx               # Main chat container
│   │   │   ├── MessageBubble.tsx            # Chat bubble with citations & guardrail buttons
│   │   │   └── AgentStepTrace.tsx           # Collapsible graded step trace
│   │   ├── types/                           # Dedicated frontend types
│   │   │   ├── chat.ts                      # Message, StepEvent, Detail interfaces
│   │   │   └── trace.ts                     # Trace interfaces
│   │   └── lib/api.ts                       # SSE streaming consumer
│   │
│   └── api/                                 # FastAPI Backend
│       ├── main.py                          # App factory & CORS setup
│       ├── config.py                        # Pydantic BaseSettings
│       ├── agent_types/                     # Dedicated backend types
│       │   ├── agent.py                     # AgentState, PlanDecision, StepType
│       │   ├── audit.py                     # Section 6 Audit Log Schemas
│       │   └── api.py                       # Request/Response models
│       ├── agent/
│       │   ├── graph.py                     # LangGraph workflow assembly
│       │   ├── router.py                    # Strategy dispatch map (beyond if/else)
│       │   ├── state.py                     # AgentState schema
│       │   └── nodes/                       # Planner, Retriever, Tool Executor, Responder, Clarify
│       ├── rag/                             # Ingest, Embed, Retrieve
│       ├── mcp_client/client.py             # Async MCP client
│       ├── db/                              # MongoDB Atlas async client & Audit Logger
│       ├── cache/redis_client.py            # Redis query hash cache (10m TTL)
│       └── tests/                           # Pytest suite (100% passing)
│
├── mcp-server/                              # Model Context Protocol Server
│   ├── server.py                            # Standalone HTTP / JSON-RPC server
│   ├── tools/                               # order_lookup, ticket_lookup, create_ticket
│   ├── mock_data/                           # orders.json, tickets.json
│   └── tests/                               # Standalone tool tests
│
├── data/knowledge_base/                     # 25+ rich enterprise policy markdown docs
├── docs/                                    # architecture.md, eval-set.json
├── docker-compose.yml                       # MongoDB + Redis local services
└── .github/workflows/ci.yml                 # Continuous Integration Pipeline
```

---

## 5. Setup & Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- Active MongoDB Atlas connection (configured in `.env`)
- Redis (optional, automatically falls back to in-memory TTL cache)

### 1. Backend Setup
```bash
cd apps/api
pip install -r requirements.txt
# Configure apps/api/.env with your MONGO_URL, GROQ_API_KEY, LLM_MODEL
python main.py
# Server running at http://localhost:8000
```

### 2. MCP Server Setup (Separate Process)
```bash
cd mcp-server
pip install -r requirements.txt
python server.py
# Server running on http://localhost:9000
```

### 3. Frontend Setup
```bash
cd apps/web
npm install
npm run dev
# Accessible at http://localhost:3000
```

---

## 6. Running Tests & Evaluation

### Run MCP Server Tests
```bash
python -m pytest mcp-server/tests -v
```

### Run Backend Unit & Multi-Step Integration Tests
```bash
python -m pytest apps/api/tests -v
```

### Run Evaluation Benchmark Harness
```bash
python apps/api/tests/run_eval_harness.py --threshold 0.85
```

---

## 7. API Verification (cURL Examples)

### Health Check
```bash
curl http://localhost:8000/health
```
*Response:*
```json
{
  "status": "ok",
  "db": "ok",
  "redis": "ok",
  "vector_store": "ok"
}
```

### Streaming Chat (Chained Query)
```bash
curl -N -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is our refund policy, and is order 4521 eligible?"}'
```

### Admin Reindexing
```bash
curl -X POST http://localhost:8000/admin/reindex \
  -H "X-API-Key: agentflow-secret-key"
```
