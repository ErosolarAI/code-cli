Bo Agent Decision + Action Loop

```
┌───────────────────────────────┐
│ 1. Intake & Profile Resolve   │
│ • Normalize user ask + flags  │
│ • Pick profile (bo/general)   │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 2. Context Capture            │
│ • Workspace snapshot (.bo)    │
│ • MCP + skill dirs + env      │
│ • Rulebooks loaded per profile│
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 3. Plan & Guardrails          │
│ • Apply Bo rulebook schema    │
│ • Build task plan + safety    │
│   constraints (policy engine) │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 4. Tool Dispatch              │
│ • Unified UI observer streams │
│ • Sandbox env (.bo/shell-*)   │
│ • MCP + local tool adapters   │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 5. Execute & Stream           │
│ • Run providers + tools       │
│ • Live status + usage meters  │
│ • Capture stdout/diffs/errors │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 6. Persist & Mirror           │
│ • Autosave sessions under     │
│   ~/.bo/sessions              │
│ • Mirror feeds for UI/SSR     │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 7. Feedback & Next Step       │
│ • Summarize evidence          │
│ • Update plan / continue /    │
│   conclude                    │
└───────────────────────────────┘
```

Data Path Notes:
- Control data stays JSON-structured (task spec, plan graph, tool calls, status).
- Artifacts (diffs, logs, tests) are stored separately and referenced in feedback envelopes.
- Guardrails enforce profile rulebooks, policy checks, and sandbox scopes before execution.
