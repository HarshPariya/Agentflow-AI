# Agentflow-AI: System Architecture Documentation

## 1. System Overview

**Agentflow-AI** ("Ask, Retrieve, Act") is an autonomous AI agent architecture designed to answer queries from a private corporate knowledge base and perform operations through standardized tools via the Model Context Protocol (MCP).

The agent makes runtime determinations conditioned on the user query rather than static keyword matching, orchestrates multi-step retrieval and tool call chains, guarantees full auditability through MongoDB Atlas, enforces a strict safety guardrail on state-modifying actions, and streams real-time execution steps to a Next.js chat interface.

---

## 2. Request Flow & LangGraph State Machine

```text
                              [ User Query ]
                                    │
                                    ▼
                          ┌──────────────────┐
                          │   FastAPI Chat   │
                          │     Endpoint     │
                          └─────────┬────────┘
                                    │ Loads Conversation History from MongoDB
                                    ▼
                          ┌──────────────────┐
                          │   Planner Node   │ (LLM reasoning over query)
                          └─────────┬────────┘
                                    │
             ┌──────────────────────┼──────────────────────┬──────────────────────┐
             ▼                      ▼                      ▼                      ▼
      [ retrieve_only ]     [ tool_only ]       [ retrieve_and_tool ]    [ answer_directly ]
             │                      │                      │                      │
             ▼                      │                      ▼                      │
      ┌──────────────┐              │              ┌──────────────┐               │
      │  Retriever   │              │              │  Retriever   │               │
      │     Node     │              │              │     Node     │               │
      └──────┬───────┘              │              └──────┬───────┘               │
             │                      │                     │                       │
             │                      ▼                     ▼                       │
             │             ┌─────────────────┐   ┌─────────────────┐              │
             │             │  Tool Executor  │   │  Tool Executor  │              │
             │             │     Node        │   │     Node        │              │
             │             └────────┬────────┘   └────────┬────────┘              │
             │                      │                     │                       │
             └──────────────────────┼─────────────────────┘                       │
                                    ▼                                             │
                          ┌──────────────────┐                                    │
                          │  Responder Node  │ ◄──────────────────────────────────┘
                          └─────────┬────────┘
                                    │
                         Is context sufficient?
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                     YES │                  NO │
                         ▼                     ▼
                     ┌───────┐           ┌───────────┐
                     │  END  │           │  Clarify  │ ──► [ END ]
                     └───────┘           │   Node    │
                                         └───────────┘
```

---

## 3. Beyond `if/else`: Pattern-Driven Dispatch Architecture

To uphold clean code, maintainability, and avoid nested `if/elif/else` spaghetti, Agentflow-AI employs:

- **Strategy & Dispatch Map Pattern**: Nodes and edge transitions are registered in immutable lookup tables keyed by typed enums (`PlanDecision`, `StepType`).
- **LangGraph Native Conditional Edges**: Declarative routing dictionaries bind classification states to downstream graph nodes directly.
- **Structural Pattern Matching**: Python `match / case` constructs are used for complex compound states (e.g., pending confirmation + user affirmative vs cancel).
- **Pydantic Type Validation**: All input contracts, tool arguments, and SSE payloads are strongly typed and validated without manual conditional parsing.

---

## 4. Component Map

| Component | Technology | Role |
| --- | --- | --- |
| **Frontend UI** | Next.js 14 (App Router), TypeScript, Tailwind CSS | Streams response tokens, renders collapsible `AgentStepTrace`, provides interactive guardrail confirmation controls |
| **API Gateway** | FastAPI, Uvicorn, Python asyncio | Orchestrates SSE event streaming, handles HTTP lifecycle, verifies `/health` and admin reindexing |
| **Agent Orchestrator** | LangGraph, LangChain Core | State machine orchestrating Planner, Retriever, Tool Executor, Responder, and Clarify nodes |
| **Data Layer** | MongoDB Atlas, Motor async driver | Stores `conversations`, `messages`, and structured `audit_logs` |
| **Cache Layer** | Redis, Async Redis client | Caches normalized vector retrieval results with 10-minute TTL |
| **Tool Layer** | MCP (Model Context Protocol) Server | Exposes `order_lookup`, `ticket_lookup`, and `create_ticket` tools with structured schema validation |
| **Knowledge Base & Ingestion** | PyMuPDF, pypdf, Vector Store (Normalized TF-IDF & Cosine Similarity Engine) | 26+ markdown/PDF enterprise documents (300-500 tokens, 15% overlap) + dynamic multi-mode PDF extractor (forms, metadata, layout) |

---

## 5. Deliberate Safety Guardrail Architecture

State-creating or modifying operations (`create_ticket`) are designated as **destructive actions**.

1. **Turn 1 (Request)**: When the user requests a ticket creation (e.g., *"Create an urgent ticket for server outage"*), the Planner recognizes the intent.
2. **Checkpoint**: Instead of calling `create_ticket` immediately, the Responder pauses and returns a structured confirmation question:

   > *"I will create a support ticket with Subject: '...' and Priority: '...'. Please confirm if you would like me to proceed."*

   The state marks `pending_action = {"tool": "create_ticket", "arguments": {...}}`.

3. **Turn 2 (Affirmation)**:
   - If the user confirms (*"Yes, please proceed"*), the Tool Executor runs `create_ticket` with the pending arguments.
   - If the user cancels (*"No, cancel that"*), the pending action is discarded and cancellation is acknowledged.

---

## 6. Audit Trail Compliance

Every graph execution records step-by-step audit entries in MongoDB matching the exact required shapes:

- `plan`: `{"decision": "retrieve_and_tool_call", "reasoning": "..."}`
- `retrieval`: `{"query": "...", "chunks": [{"docId": "policy-042", "text": "...", "score": 0.83}]}`
- `tool_call`: `{"tool": "order_lookup", "input": {"order_id": "4521"}, "output": {"status": "eligible", "days_since_purchase": 12}}`
- `clarify`: `{"reason": "no matching order found", "question_asked": "..."}`
- `final_answer`: `{"sources_used": ["policy-042"], "tools_used": ["order_lookup"]}`
