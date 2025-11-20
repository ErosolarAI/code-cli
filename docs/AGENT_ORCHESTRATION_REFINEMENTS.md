# Coding Agent Orchestration Blueprint

This blueprint turns the APT CLI loop into a contract-driven, debuggable coding agent built for reliability and speed. It assumes the agent can plan, gate risky actions, execute tools, and stream results to both humans and downstream LLMs.

## Design Principles
- Contracts over prompts: every phase exchanges structured JSON that guardrails can enforce.
- Prefer determinism: DAG plans, explicit policies, event-sourced state, and typed errors.
- Fast feedback: stream summaries, diffs, and errors; support dry-runs and selective apply.
- Safety by default: risk-aware policies, dry-run mode, and circuit breakers for repeated failures.

## 1) Task Spec as a Contract
- Always normalize an intake spec before planning. Persist it as the first timeline event.
- Contract shape:
  ```json
  {
    "goal": {
      "natural": "Fix failing tests in payments service",
      "machine": { "type": "edit_code", "repo": "workspace", "target_outcome": "tests_pass" }
    },
    "constraints": ["keep API stable", "touch only payments module"],
    "budget": { "max_steps": 10, "max_wall_time_sec": 1200, "cost_ceiling": "ask" },
    "risk_profile": {
      "capability": "write_with_diff", // read_only | write_with_diff | write_and_run_tests | full_shell
      "interaction": { "mode": "ask_before_risky" } // full_autonomy | ask_before_risky | ask_every_step
    },
    "evaluation": {
      "success": ["tests_pass", "lint_clean"],
      "acceptance_hint": "ship if diffs match plan and tests are green"
    }
  }
  ```
- Guardrails reference this spec to enforce permissions, budgets, and termination.

## 2) Context Aggregation as Retrieval Policy
- Define retrieval recipes per task type (e.g., `edit_code` -> failing tests + touched files + related docs; `data_question` -> schemas + sample queries).
- Emit ranked, labeled context items:
  ```json
  {
    "id": "ctx_123",
    "source": "repo",           // repo | mcp | memory | cache
    "path": "src/foo.ts:10-80",
    "kind": "code",             // code | doc | test | schema | memory
    "relevance_score": 0.91,
    "excerpt": "..."
  }
  ```
- If context exceeds budget, run a compression pass (chunk -> summarize -> re-rank) before planning. Persist chosen and discarded items for observability.

## 3) Plans as DAGs
- Encode plans as explicit DAGs to parallelize safe steps and localize replanning.
  ```json
  {
    "nodes": [
      { "id": "step_1", "tool": "fs_read", "args": {"path": "src/main.ts"}, "depends_on": [], "status": "pending" },
      { "id": "step_2", "tool": "tests_run", "args": {"pattern": "test/**"}, "depends_on": ["step_1"], "status": "pending" }
    ],
    "metadata": { "rationale": "...", "version": "v1", "created_at": "..." }
  }
  ```
- Node statuses: pending | running | succeeded | failed | skipped | blocked.
- Partial replanning edits only the affected subgraph; succeeded nodes are immutable.

## 4) Policy & Guardrail Layer
- Insert a policy check between plan creation and execution.
- Static policies: per-tool allowlist/denylist, forbidden arg patterns, capability-level checks (e.g., `rm -rf` blocked unless explicitly allowed).
- Dynamic policies: per-user/tool rate limits, max runtime, max file size, risk scoring (e.g., `git push` to protected branches -> require confirmation).
- Auto-sanitize where possible (e.g., strip `--force`), otherwise block or request approval. Policy decisions become timeline events.

## 5) Execution Robustness
- Standardize per-tool timeouts and typed errors (`tool_timeout`, `tool_permission_denied`, `tool_invalid_args`, `tool_failed`).
- Retries with jittered backoff for flaky tools; per-tool retry ceilings.
- Circuit breakers: if similar failures repeat (same tool/args/exit), halt the subgraph and surface a high-level error instead of looping.
- Dry-run mode for shell and FS edits: generate command/diff artifacts without applying; execute only when policy allows.

## 6) Event-Sourced Timeline
- Every action emits an immutable event; views (plan tracker, dashboards) are derived, never authoritative.
- Event examples: `task_spec_recorded`, `context_item_selected`, `plan_created`, `node_started`, `node_succeeded`, `node_failed`, `guardrail_blocked`, `artifact_stored`.
- Event shape:
  ```json
  {
    "event_id": "evt_456",
    "step_id": "step_2",
    "timestamp": "...",
    "action": "tool_execution",
    "tool": "tests_run",
    "status": "failed",
    "artifacts": ["hash://logs/abc", "hash://diffs/def"],
    "metadata": { "exit_code": 1 }
  }
  ```
- Timelines are replayable for debugging, auditing, and model tuning.

## 7) Feedback Packaging & UX
- Package outcomes for both humans and LLM reflection:
  ```json
  {
    "summary": "Tests failed due to missing import in foo.ts",
    "deltas": [{ "type": "file_diff", "target": "src/foo.ts", "artifact": "hash://diffs/xyz" }],
    "errors": [{ "type": "tests_failed", "details_artifact": "hash://logs/abc" }],
    "timeline_refs": ["evt_123", "evt_456"]
  }
  ```
- Stream updates incrementally; include links to artifacts (diffs, logs, plans).
- Allow users to accept/reject individual deltas; rejected deltas trigger partial replanning.

## 8) Reflection Loop & Termination
- Derive termination from the intake spec: required nodes completed, success criteria met (e.g., tests green), and no unresolved policy blocks.
- Cap reflection iterations; after N identical failures, exit with a diagnosis instead of retrying.
- Optional critic prompt for high-risk tasks (infra, data migration) before execution or apply.

## 9) Completion & Hand-Off
- Emit follow-up suggestions as valid task specs that can be re-submitted:
  ```json
  {
    "title": "Refactor duplicated logic in foo/bar",
    "kind": "code_refactor",
    "inputs": { "paths": ["src/foo.ts", "src/bar.ts"] },
    "origin": { "from_task": "task_123" }
  }
  ```
- Surface these alongside final artifacts so multi-turn workflows can chain without prompt bloat.

## 10) Memory Across Runs
- Short-term memory: the current task's timeline (spec, context set, plan, events, artifacts).
- Long-term memory: summaries of prior tasks per repo/project and known quirks (e.g., "use pnpm here", "tests require docker compose").
- Feed memory into context aggregation so the agent cold-starts with repo-aware priors.
