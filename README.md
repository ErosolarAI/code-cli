# bo-cli (minimal)
> A focused, diff-aware CLI for shipping code with only the essentials: local file work, fast search, and sandboxed shell execution. No fluff, no hidden network calls.

# first edit!

![IMG_8625](https://github.com/user-attachments/assets/6af5efc0-ed72-409d-8521-e61113d83baa)

![IMG_8626](https://github.com/user-attachments/assets/bea939a7-8b23-4e6a-94b6-27e500644307)


## Contents
- [At a Glance](#at-a-glance)
- [Quickstart](#quickstart)
- [Core Surface](#core-surface)
- [Minimal-First Design](#minimal-first-design)
- [Layout](#layout)
- [NSA-Secure Local LLM Runbook](#nsa-secure-local-llm-runbook)
- [Operations Cadence](#operations-cadence)
- [License](#license)

## At a Glance
- Conversation loop with Anthropic, OpenAI, or Google providers, plus tool calling.
- Filesystem helpers for reading, writing (with diffs), and patch editing.
- Search suite: ripgrep-backed code search and globbing.
- Sandboxed shell execution via bash with awareness of the current sandbox mode.
- Outputs show diffs on writes/edits so you know exactly what changed.

## Quickstart
| Step | Command | Notes |
| --- | --- | --- |
| Install deps | `npm install` | Uses the workspace `package-lock.json`. |
| Build | `npm run build` | Emits compiled CLI into `dist/`. |
| Run locally | `npm start` | Or `node dist/bin/bo.js`. |
| Optional global | `npm i -g .` | Then run `bo` from any repo. |

## Core Surface
| Area | What you get | Notes |
| --- | --- | --- |
| Conversation | Tool-calling chat loop using configured providers. | Providers live in your agent config. |
| Filesystem | `read_file`, `write_file`, patch `edit_file`, directory listing. | Writes show diff previews before commit. |
| Search | Ripgrep-backed code search plus globbing. | Optimized for large repos. |
| Shell | Bash execution with sandbox awareness. | Designed for local, predictable commands. |

## Minimal-First Design
- Removed: web fetch/search, pentest suites, dependency/security scanners, MCP connectors, mission agents, telemetry/observability, and other experimental stacks.
- Tool manifest exposes only filesystem, edit, search, glob, and bash plugins.
- `write_file` accepts missing `content` by creating an empty file and warning instead of failing.
- See `MINIMAL_FEATURE_SET.md` for the exact tool list and pruned items.

## Layout
```
src/
  tools/           Core tools: filesystem, edit, search, glob, bash
  capabilities/    Capability wrappers exposing the tool suites
  plugins/tools/   Minimal plugin registration (nodeDefaults.ts)
  contracts/       Shared tool manifest (tools.schema.json)
docs/              Additional guides and summaries
examples/          Sample agent configurations
dist/              Built CLI artifacts after `npm run build`
```

## NSA-Secure Local LLM Runbook
How to run open-weight models locally inside an air-gapped NSA environment and pair them with this CLI.

**Objectives and guardrails**
- Zero egress: inference hosts and gateways stay on NSA networks with no outbound connectivity.
- Verified supply chain: pin packages, verify checksums/signatures for weights, and build from source inside the enclave.
- Least privilege: per-model service accounts with frequent rotation.
- Auditability: immutable logs for access, model versions, prompts, and tool calls.
- Data hygiene: classify inputs/outputs; strip PII/operational identifiers; encrypt at rest and in transit.

**Reference architecture (air-gapped, OpenAI-compatible)**
- Model hosts (GPU or CPU) running containerized inference (vLLM/llama.cpp) exposing an OpenAI-compatible `/v1` API.
- Gateway: internal load balancer with mTLS, RBAC, size limits, and per-tenant rate controls.
- Feature services: retrieval/vector stores and policy filters that run pre-prompt.
- Observability: centralized logging with redaction, metrics, and traces for tool calls.
- Secrets: internal KMS/HSM; no tokens baked into images; short-lived credentials only.

**Model intake and evaluation**
- Choose models with licenses/export controls that fit mission needs (Llama 3, Mistral, Granite, Qwen, Phi).
- Pull weights via a controlled path; verify checksums and signatures; store in an internal registry.
- Run baseline evals (MMLU, GSM8K, code evals, toxicity, hallucination) on classified-safe benchmarks.
- Approve per classification level with a model card that documents provenance and limitations.

**Deployment steps (fully local)**
1. Build an inference image inside the secure network with pinned versions and SBOM generation.
2. Mount weights from the internal registry; disable any auto-download code paths.
3. Expose only an OpenAI-compatible endpoint on the internal subnet with mTLS and RBAC.
4. Enforce budgets: context length, rate limits, max tool calls, and output length.
5. Add runtime filters: prompt sanitization plus regex/ML filters for sensitive strings and policy stoplists.
6. Register the service in discovery with health checks and per-tenant auth.
7. Run chaos/resiliency drills (CPU/GPU pressure, cold starts) and capture SLOs.

**Operational controls**
- Classification tagging on every request/response; block downgrades without approval.
- Minimal retention with short-lived caches; redact logs; disable cross-session state.
- Tenant isolation for vector/file stores; per-tenant auth scopes.
- Human-in-the-loop for high-risk actions; approval gates before mission writes.
- Periodic red-teaming and jailbreak tests; feed findings into filters and blocklists.

**Using the CLI with a local OpenAI-compatible model**
- A built-in `nsa-local` provider targets any OpenAI-compatible gateway using the Responses API path.
- Required env vars: `NSA_LLM_BASE_URL` (e.g., `https://llm-gateway.int.nsa/v1`) and `NSA_LLM_API_KEY`. Missing values fail fast.
- Rebuild and run inside the enclave:
  ```bash
  npm run build
  NSA_LLM_BASE_URL=https://llm-gateway.int.nsa/v1 \
  NSA_LLM_API_KEY=*** \
  node dist/bin/bo.js
  ```
- Use `examples/my-agents.json` as a template: set `defaultProvider` to `nsa-local` and list your internal models (e.g., `llama-3-70b-instruct`).
- Optional smoke test from inside the enclave:
  ```bash
  curl -k https://llm-gateway.int.nsa/v1/responses \
    -H "Authorization: Bearer $NSA_LLM_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"llama-3-70b-instruct","input":[{"role":"user","content":"ping"}]}'
  ```

**Mission-task usage patterns**
- Code: secure review, static analysis, refactoring drafts, and test generation for internal repositories.
- Docs: summarize RFIs, operator guides, and change logs from diffs.
- Retrieval: pair with an internal vector store for policy/procedure Q&A; keep embeddings local.
- Translation/normalization: convert between formats (JSON/YAML/XML) and standardize templates.
- Planning: generate runbooks, checklists, or remediation steps with approvals before execution.

## Operations Cadence
- Daily: rotate tokens, review auth logs, verify no egress, and check SLO dashboards.
- Weekly: refresh SBOM comparisons, scan images against baseline signatures, run red-team prompt suites.
- Monthly/quarterly: re-evaluate models, retrain filters, patch dependencies, and re-certify controls.

## License
MIT License. See `LICENSE` for details. Third-party components retain their original licenses.
