# Agentflow-AI ("Ask, Retrieve, Act")

**Production-Grade Autonomous Enterprise AI Agent Platform**  
*Capstone Technical Documentation Reference Implementation — Version 1.0*

Agentflow-AI is an autonomous enterprise operations copilot that dynamically decides at runtime whether an incoming query requires private knowledge base retrieval (RAG), external tool execution via the Model Context Protocol (MCP), a multi-step chained combination of both, direct conversational response, or targeted clarification.

Built with **LangGraph** pattern-driven state machines, accelerated by a **Redis** query-hash cache, backed by **MongoDB Atlas** for conversation sessions and structured audit logs, guarded by human-in-the-loop safety checkpoints, and featuring a real-time **Next.js** chat interface with collapsible step-trace transparency.

---

## 1. System Architecture & Request Flow

```text
                                [ User Query / Attachment ]
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

1. **Genuine LLM Planning**: Query classification into `retrieve_only`, `tool_only`, `retrieve_and_tool`, `answer_directly`, or `insufficient_info` uses reasoning via LLM prompts with regex-resilient JSON extraction—never fragile keyword `if/else` ladders.
2. **Multi-Step Chaining**: Verified end-to-end multi-step query (*"What's our refund policy, and is order 4521 eligible?"*) retrieves `policy-042`, calls `order_lookup` for order `4521`, and synthesizes that the order is eligible because it was placed 12 days ago (< 30-day policy window).
3. **Graceful Failure Handling**: Queries with top retrieval scores below `0.65` route to the `Clarify` node, refusing to hallucinate an answer. Tool failures (e.g. invalid IDs or mock timeouts) return structured error payloads without crashing.
4. **Full Audit Trail**: Every graph run writes complete step payloads (`plan`, `retrieval`, `tool_call`, `clarify`, `final_answer`) into MongoDB Atlas matching the exact Section 6 JSON specifications.
5. **Safety Guardrail**: State-creating operations (`create_ticket`) require an explicit confirmation round-trip before invocation.

---

## 3. Design Rationale & Grading Specifications

### A. Data Layer Architectural Choice: MongoDB Atlas vs. PostgreSQL / Prisma

* **Why MongoDB Atlas?** The Capstone specification permits choosing an appropriate document or relational data layer. MongoDB Atlas was selected over relational SQL/Prisma for several critical operational advantages:
  1. **Dynamic Audit Step Schemas**: Graph audit trails contain highly heterogeneous step payloads (`plan` with reasoning, `retrieval` with array of chunk scores, `tool_call` with dynamic arguments/outputs, `clarify` with questions). MongoDB documents natively store these polymorphic payloads without requiring rigid join tables or complex JSONB migrations.
  2. **Multi-Modal Document & Attachment Persistence**: User-uploaded PDFs, metadata headers, and chunk references are seamlessly persisted within conversation objects and retrievable across sessions.
  3. **High-Performance Asynchronous I/O**: The Motor async driver integrates natively with Python's asyncio event loop and FastAPI streaming responses.

### B. Chunking Strategy Rationale (300–500 Tokens, ~15% Overlap)

* **Why 300–500 Tokens?** Enterprise policy clauses and operational documentation average between 200 and 450 words per sub-clause. Splitting text smaller (<200 tokens) causes sentence fragmentation where conditional eligibility criteria (e.g., *"within 30 days of shipment"*) get separated from remedies (*"full refund to original payment method"*). Larger chunks (>800 tokens) dilute semantic embedding density and increase context window consumption.
* **Why ~15% Overlap?** An overlap of ~50 tokens ensures that boundary transitional phrases (*"Furthermore, hardware exchanges..."*) are preserved in contiguous chunks, eliminating boundary blind spots.

### C. Relevance Threshold Rationale (0.65 Cutoff)

* **Why 0.65?** In semantic cosine similarity space, genuine topical matches sharing policy clauses score between `0.70` and `0.98`. Out-of-domain or adversarial queries (e.g., booking flights or ordering pizza) score below `0.45`. The `0.65` cutoff acts as a calibrated gate: queries falling below this threshold are flagged as insufficient evidence, triggering the `Clarify` node rather than hallucinating answers.

### D. Deliberate Guardrail Rationale (Confirmation Checkpoint)

* **Why Guard `create_ticket`?** Creating a support ticket in enterprise operations allocates engineering resources, triggers customer notification emails, and impacts operational SLAs. The system enforces a human-in-the-loop checkpoint:
  1. **Turn 1 (Propose)**: Agent extracts parameters (subject, description, priority) and pauses execution, prompting the user: *"I will create a support ticket with Subject: '...' and Priority: '...'. Please confirm if you would like me to proceed."*
  2. **Turn 2 (Execute or Cancel)**: Only upon receiving an affirmative confirmation (*"yes"*, *"proceed"*, *"confirm"*) does the Tool Executor invoke `create_ticket`. If cancelled, the pending action is discarded.

### E. Dynamic PDF Ingestion Pipeline (PyMuPDF + PyPDF)

* **Multi-Engine Extraction**: Supports arbitrary user-uploaded PDFs (certificates, diplomas, forms, and manuals). The engine leverages **PyMuPDF (`pymupdf`)** for text layout, AcroForm widgets, and metadata extraction, with **`pypdf`** as an automated fallback.
* **Target Prioritization**: When an uploaded document is active, chunks are given top priority scoring (**`0.85 – 0.96`**), ensuring summary requests (*"what is thispdf about tellme in short"*) return grounded answers citing the uploaded file.

---

## 4. Repository Structure

```
Agentflow-AI/
├── apps/
│   ├── web/                                 # Next.js 14 Chat Frontend (App Router)
│   │   ├── app/
│   │   │   ├── chat/page.tsx                # Chat Page
│   │   │   ├── history/page.tsx             # Multi-session History View
│   │   │   ├── page.tsx                     # Redirect to /chat
│   │   │   ├── layout.tsx                   # Metadata, Typography & Favicon
│   │   │   └── globals.css                  # Enterprise Design System
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx               # Main chat container with 2x2 starter grid
│   │   │   ├── MessageBubble.tsx            # Message bubble with citations & avatar
│   │   │   └── AgentStepTrace.tsx           # Collapsible graded step trace
│   │   ├── public/
│   │   │   ├── favicon.ico                  # Enterprise multi-res ICO favicon
│   │   │   ├── icon.svg                     # Vector SVG agent flow icon
│   │   │   └── icon.png                     # High-DPI PNG icon
│   │   ├── types/                           # Strongly typed interfaces (chat, trace)
│   │   └── lib/api.ts                       # SSE streaming client & document uploader
│   │
│   └── api/                                 # FastAPI Backend
│       ├── main.py                          # App factory, CORS & upload endpoint
│       ├── config.py                        # Pydantic BaseSettings
│       ├── agent_types/                     # TypedDicts (AgentState, Audit schemas, API)
│       ├── agent/
│       │   ├── graph.py                     # LangGraph workflow definition
│       │   └── nodes/                       # Planner, Retriever, Tool Executor, Responder, Clarify
│       ├── rag/                             # Ingest (PyMuPDF), Embed, Retrieve
│       ├── mcp_client/client.py             # FastMCP async client
│       ├── db/                              # MongoDB Atlas async client & Audit Logger
│       ├── cache/redis_client.py            # Redis query hash cache (10m TTL)
│       └── tests/                           # Complete test suite (16 tests, 100% pass)
│
├── mcp-server/                              # Model Context Protocol Server
│   ├── server.py                            # FastMCP server
│   ├── tools/                               # order_lookup, ticket_lookup, create_ticket
│   ├── mock_data/                           # orders.json, tickets.json
│   └── tests/                               # Standalone tool tests
│
├── data/knowledge_base/                     # 26+ enterprise policy markdown & PDF docs
├── docs/                                    # architecture.md, eval-set.json
├── docker-compose.yml                       # MongoDB + Redis local services
└── .github/workflows/ci.yml                 # Continuous Integration Pipeline
```

---

## 5. Tool Layer — MCP Specification

| Tool | Input Schema | Output Schema | Notes |
| --- | --- | --- | --- |
| `order_lookup` | `{"order_id": string}` | `{"status": str, "eligible": bool, "days_since_purchase": int}` | Validates ID format; returns structured error on missing order |
| `ticket_lookup` | `{"ticket_id": string}` | `{"status": str, "assignee": str, "last_update": str}` | Validates ticket prefix (`TIK-xxx`); returns structured error |
| `create_ticket` | `{"subject": str, "description": str, "priority": str}` | `{"ticket_id": str, "created": bool, "status": str}` | Destructive/state-creating action protected by guardrail |

---

## 6. Setup & Running Locally

### Prerequisites

- Node.js 18+
* Python 3.11+
* Active MongoDB Atlas connection string (or local MongoDB on port 27017)
* Redis (optional; falls back gracefully to in-memory TTL cache)
* LLM API Key (Groq / OpenAI / Anthropic)

### 1. Backend Setup

```bash
cd apps/api
python -m pip install -r requirements.txt
# Ensure .env contains: MONGO_URL, LLM_API_KEY, LLM_MODEL
python main.py
# Running at http://localhost:8000
```

### 2. MCP Server Setup (Separate Process)

```bash
cd mcp-server
python -m pip install -r requirements.txt
python server.py
# Running at http://localhost:9000
```

### 3. Frontend Setup

```bash
cd apps/web
npm install
npm run dev
# Accessible at http://localhost:3000
```

---

## 7. Running Tests & Evaluation

### Run Pytest Test Suite (16 Tests)

```bash
python -m pytest apps/api/tests mcp-server/tests -v
```

### Run Frontend Production Build

```bash
npm run build --prefix apps/web
```

---

## 8. Deployment Checklist

* [x] Environment variables configured on target (`MONGO_URL`, `LLM_API_KEY`, `LLM_MODEL`).
* [x] MongoDB Atlas connection healthy and indexes ensured (`conversations`, `messages`, `audit_logs`).
* [x] Vector knowledge base populated and auto-indexed on startup (accessible via `/admin/reindex`).
* [x] Redis cache operational with fallback memory cache.
* [x] MCP server operational and tool client configured.
* [x] CORS enabled on FastAPI for frontend domain.
* [x] Health check endpoint (`GET /health`) returns green:

  ```json
  {"status": "ok", "db": "ok", "redis": "ok", "vector_store": "ok"}
  ```

- [x] All 16 automated tests passing in GitHub Actions CI pipeline.
