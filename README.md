# bo-cli (minimal)

Slimmed-down CLI for software engineering work. This cut removes the over-extended tool surface and keeps only the pieces required to read/edit code, search a repo, and run commands locally.

## What’s included
- Conversation loop using your configured providers (Anthropic/OpenAI/Google) with tool calling.
- Filesystem tools: `read_file`, `write_file`, `edit_file` patching, and directory listing.
- Search helpers: ripgrep-backed code search plus globbing.
- Shell execution via `bash` with sandbox awareness.
- Diff previews on writes/edits so you can see exactly what changed.

## Quick start
- Install deps: `npm install`
- Build: `npm run build`
- Run locally: `npm start` (or `node dist/bin/bo.js`)
- Global install (optional): `npm i -g .` then run `bo`

## Minimal-first design
- Removed web fetch/search, pentest, dependency/security scanners, MCP connectors, mission agents, telemetry/observability, and other experimental suites.
- Tool manifest now exposes only filesystem, edit, search, glob, and bash plugins.
- `write_file` now tolerates missing `content` by writing an empty file with a warning instead of failing validation.
- See `MINIMAL_FEATURE_SET.md` for the exact tool list and what was pruned.

## Layout
- `src/tools` — core tools (filesystem, edit, search, glob, bash)
- `src/capabilities` — capability wrappers supplying the tool suites
- `src/plugins/tools/nodeDefaults.ts` — registers the minimal plugin set
- `src/contracts/tools.schema.json` — canonical tool manifest shared with the UI

## NSA-secure local LLM runbook

This section outlines how an NSA-owned, fully isolated environment can run open-weight models locally and pair them with this CLI for day-to-day engineering, analysis, and knowledge tasks without external dependencies.

### Objectives and guardrails
- Zero egress: inference hosts and gateways stay on NSA networks with no outbound connectivity.
- Verified supply chain: pin packages, verify checksums/signatures for weights, and build from source inside the enclave.
- Principle of least privilege: service accounts scoped per-model; no shared credentials; rotated frequently.
- Auditability: immutable logs for access, model versions, prompts, and tool calls; retain per classification policy.
- Data hygiene: classify inputs/outputs; strip PII and operational identifiers before persistence; encrypt at rest/in transit.

### Reference architecture (air-gapped, OpenAI-compatible)
- Model hosts: GPU nodes or CPU-only where appropriate; containerized inference (e.g., vLLM/llama.cpp) exposing an OpenAI-compatible `/v1` API.
- Gateway: internal load balancer with mTLS, RBAC, request/response size limits, and per-tenant rate limits.
- Feature services: retrieval/vector stores (also local), document loaders, and policy filters that run before prompts are sent.
- Observability: central logging with redaction, metrics on latency/throughput, structured traces for tool calls.
- Secrets: internal KMS backed by HSM; never bake tokens into images; short-lived tokens only.

### Model intake and evaluation
- Select models that permit internal use (license + export controls) and meet mission needs (e.g., Llama 3-family, Mistral, Granite, Qwen, Phi).
- Pull weights via a controlled transfer path; verify checksums/signatures; store in an internal artifact registry.
- Run baseline evals (MMLU, GSM8K, code evals, toxicity, hallucination checks) on classified-safe benchmarks.
- Approve per classification level; document model card, dataset provenance, and known limitations.

### Deployment steps (fully local)
1) Build an inference image inside the secure network (no internet) with pinned versions and SBOM generation.  
2) Mount weights from the internal registry; disable any auto-download code paths.  
3) Expose only an OpenAI-compatible endpoint (no other admin APIs), bound to the internal subnet, with mTLS.  
4) Enforce request budgets: context length, rate limits, max tool calls, and output length.  
5) Add runtime filters: prompt sanitization, regex/ML filters for sensitive strings, and policy-based stoplists.  
6) Register the service in service discovery with health checks and per-tenant auth.  
7) Run chaos/resiliency drills (CPU/GPU pressures, cold starts) and record SLOs.

### Data protection and controls
- Classification tagging on every request/response; block downgrades without approval.
- Minimize retention: short-lived request caches; redact logs; disable cross-session state.
- Segregate tenants: separate auth scopes per program; isolate vector stores and file stores by tenant.
- Human-in-the-loop for high-risk actions; require approvals before write operations to mission systems.
- Periodic red-teaming and jailbreaking tests; feed findings back into filters and prompts.

### Using this CLI with a local OpenAI-compatible model
- A built-in `nsa-local` provider plugin targets any OpenAI-compatible gateway. It uses the Responses API path and requires `NSA_LLM_BASE_URL` (e.g., `https://llm-gateway.int.nsa/v1`) and `NSA_LLM_API_KEY`. Empty or missing values fail fast to avoid insecure defaults.
- Rebuild (`npm run build`) and run with env vars set inside the enclave: `NSA_LLM_BASE_URL`, `NSA_LLM_API_KEY`, and your chosen model id (e.g., `llama-3-70b-instruct`).
- Use `examples/my-agents.json` as a template: set `defaultProvider` to `nsa-local` and list your internal models under `models`.
- Launch the CLI (`npm start` or `node dist/bin/bo.js`) and pick the profile/model via slash commands if enabled, or via config.

### Detailed NSA-local LLM operations
- Network/hosts: air-gapped NSA networks, no egress; GPU/CPU hosts hardened (SELinux/AppArmor, TPM-backed measured boot), per-tenant service accounts.
- Weights intake: approved transfer path only; verify checksums/signatures; store in an internal artifact registry with immutable tags; deny runtime auto-downloads.
- Engine choice: vLLM or Text Generation Inference for OpenAI-compatible Responses API; llama.cpp + OpenAI shim for CPU/lightweight.
- Build (offline) image: pin/mirror deps, generate SBOM, sign images; bundle runtime but mount weights at run to keep images small.
- Run the service: expose only `/v1` OpenAI endpoint on an internal subnet with mTLS, RBAC, request limits, and output filters.
  ```bash
  docker run --rm \
    -p 8000:8000 \
    -v /models/llama3-70b:/models/llama3 \
    -e MODEL_PATH=/models/llama3 \
    -e MAX_CONTEXT=32768 \
    --network internal-only \
    your.registry/vllm-nsa:tag \
    --host 0.0.0.0 --port 8000 \
    --model $MODEL_PATH \
    --api-type openai
  ```
- Security controls: short-lived tokens from internal KMS; request/response classification tags; PII/operational redaction; immutable prompt/tool-call logs; periodic jailbreak/red-team suites feeding filters/blocklists; disable cross-session state.
- Register models: assign internal ids (e.g., `llama-3-70b-instruct`), document context limits and approved classification level.
- Wire the CLI: export `NSA_LLM_BASE_URL`/`NSA_LLM_API_KEY`, rebuild, run; set `defaultProvider` to `nsa-local` and list internal models in your agents config.
- Validate: curl smoke test from inside enclave to confirm auth, mTLS, and limits:
  ```bash
  curl -k https://llm-gateway.int.nsa/v1/responses \
    -H "Authorization: Bearer $NSA_LLM_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"llama-3-70b-instruct","input":[{"role":"user","content":"ping"}]}'
  ```
- Ops cadence: daily token rotation and egress checks; weekly SBOM/image signature diffs and red-team prompt runs; monthly/quarterly model re-evals, patches, and control re-certification.

### Mission-task usage patterns (all local)
- Code: secure code review, static analysis, refactoring drafts, and test generation for internal repositories.
- Docs: summarize RFIs, produce operator guides, and generate change logs from diffs.
- Retrieval: pair with an internal vector store for policy and procedure Q&A; keep embeddings local.
- Translation/normalization: convert between formats (JSON/YAML/XML), standardize templates, triage logs.
- Planning: generate runbooks, checklists, or remediation steps with human approval before execution.

### Operations checklist
- Daily: rotate tokens, review auth logs, verify no egress, and check SLO dashboards.
- Weekly: refresh SBOM comparisons, scan images against baseline signatures, run red-team prompt sets.
- Monthly/quarterly: re-evaluate models, retrain filters, patch dependencies, and re-certify controls.

## License

MIT License. See `LICENSE` for details. Third-party components retain their original licenses.


bo@Mac code-cli % npm i -g .

up to date in 2s
bo@Mac code-cli % bo
╭┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╮
╔═══════════════════════════════════╗
║                                   ║
║              BO CODE              ║
║       craft • debug • ship        ║
╟═══════════════════════════════════╢
║ deepseek-reasoner   ⟡   deepseek  ║
║              Bo Code              ║
║   ↳  /Users/bo/GitHub/code-cli    ║
╟┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╢
║   ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁   ║
║         ✶   ✦   ✶   ✦   ✶         ║
╚═══════════════════════════════════╝
╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
╭┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╮
╔═════════════════════════════════════╗
┃ ℹ Info                              ┃
┃ signal lane • neon overlay          ┃
╞═════════════════════════════════════╡
┃ Restored last autosaved             ┃
┃ session.                            ┃
╚═════════════════════════════════════╝
╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
│ >  carefully explain what this repo does
                                 │
⠋ Working on your request...╭┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╮
╔═════════════════════════════════════╗
┃ ◆ Assistant                         ┃
┃ deepseek-reasoner • deepseek        ┃
╞═════════════════════════════════════╡
┃ Based on my comprehensive analysis  ┃
┃ of this repository, here's a        ┃
┃ detailed explanation of what this   ┃
┃ software does:                      ┃
┃                                     ┃
┃ 🎯 Core Purpose                     ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ Bo CLI is an advanced AI-powered    ┃
┃ command-line interface that         ┃
┃ provides autonomous coding          ┃
┃ assistance, security testing, and   ┃
┃ agent orchestration capabilities.   ┃
┃ It's designed to help developers    ┃
┃ and security professionals automate ┃
┃ complex coding tasks, perform       ┃
┃ security assessments, and manage    ┃
┃ multi-step workflows through        ┃
┃ natural language commands.          ┃
┃                                     ┃
┃ 🔧 Primary Functions                ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ 1. AI-Powered Coding Assistant      ┃
┃                                     ┃
┃ • Code Analysis & Generation:       ┃
┃   Reads, analyzes, and modifies     ┃
┃   code files                        ┃
┃ • Refactoring Support: Helps        ┃
┃   restructure and improve existing  ┃
┃   code                              ┃
┃ • Dependency Management: Analyzes   ┃
┃   and manages project dependencies  ┃
┃ • Testing Automation: Runs tests    ┃
┃   and generates test templates      ┃
┃ • Build Process Management:         ┃
┃   Executes build commands and       ┃
┃   validates outputs                 ┃
┃                                     ┃
┃ 2. Security & Penetration Testing   ┃
┃ Suite                               ┃
┃                                     ┃
┃ • Defensive Security: Provides      ┃
┃   security baselines and            ┃
┃   vulnerability scanning            ┃
┃ • Offensive Security: Includes      ┃
┃   penetration testing tools (nmap,  ┃
┃   nuclei, ffuf, gobuster)           ┃
┃ • Dependency Security: Scans for    ┃
┃   vulnerable dependencies and       ┃
┃   security issues                   ┃
┃ • Code Security: Analyzes code for  ┃
┃   potential security                ┃
┃   vulnerabilities                   ┃
┃                                     ┃
┃ 3. Agent Orchestration System       ┃
┃                                     ┃
┃ • Multi-Agent Architecture: Spawns  ┃
┃   specialized sub-agents for        ┃
┃   complex tasks                     ┃
┃ • Task Automation: Breaks down      ┃
┃   complex requests into manageable  ┃
┃   steps                             ┃
┃ • Parallel Execution: Runs multiple ┃
┃   operations simultaneously for     ┃
┃   efficiency                        ┃
┃ • Progress Tracking: Monitors and   ┃
┃   reports on multi-step operations  ┃
┃                                     ┃
┃ 🏗️ Architecture Components         ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ Capability-Based System             ┃
┃                                     ┃
┃ The CLI uses a modular capability   ┃
┃ system where each feature area is   ┃
┃ implemented as a separate module:   ┃
┃                                     ┃
┃ │ ───────────── CODE ────────────── ┃
┃ │ 📦 Core Capabilities:             ┃
┃ │ ├── 📁 Filesystem Operations (rea ┃
┃ │ d/write/list/search)              ┃
┃ │ ├── 📁 Code Analysis (structure,  ┃
┃ │ dependencies, complexity)         ┃
┃ │ ├── 📁 Development Workflow (test ┃
┃ │ s, builds, package management)    ┃
┃ │ ├── 📁 Security Tools (pentesting ┃
┃ │ , dependency scanning)            ┃
┃ │ ├── 📁 Task Management (progress  ┃
┃ │ tracking, todo system)            ┃
┃ │ ├── 📁 Performance Tools (paralle ┃
┃ │ l execution, optimization)        ┃
┃ │ └── 📁 Code Intelligence (complex ┃
┃ │ ity metrics, quality assessment)  ┃
┃                                     ┃
┃ Agent Profiles & Rulebooks          ┃
┃                                     ┃
┃ • Bo Code Profile: Specialized for  ┃
┃   fast, deterministic code editing  ┃
┃ • General Profile: Broad            ┃
┃   capabilities for research and     ┃
┃   planning                          ┃
┃ • Rulebook System: Governs behavior ┃
┃   with structured constraints and   ┃
┃   guardrails                        ┃
┃                                     ┃
┃ 🚀 Key Features                     ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ Advanced Code Intelligence          ┃
┃                                     ┃
┃ │ ────────────── TS ─────────────── ┃
┃ │ // Example: Analyze code complexi ┃
┃ │ ty                                ┃
┃ │ AnalyzeCodeComplexity({           ┃
┃ │   path: "src/**/*.ts",            ┃
┃ │   threshold: 15                   ┃
┃ │ });                               ┃
┃                                     ┃
┃ Performance Optimization            ┃
┃                                     ┃
┃ │ ────────────── TS ─────────────── ┃
┃ │ // Example: Run commands in paral ┃
┃ │ lel                               ┃
┃ │ ParallelExecute({                 ┃
┃ │   commands: ["npm run test", "npm ┃
┃ │  run lint", "npm run build"]      ┃
┃ │ });                               ┃
┃                                     ┃
┃ Task Management                     ┃
┃                                     ┃
┃ │ ────────────── TS ─────────────── ┃
┃ │ // Example: Track complex workflo ┃
┃ │ ws                                ┃
┃ │ TodoWrite({                       ┃
┃ │   todos: [                        ┃
┃ │     { content: "Fix security vuln ┃
┃ │ erability", status: "in_progress… ┃
┃ │     { content: "Run penetration t ┃
┃ │ ests", status: "pending" }        ┃
┃ │   ]                               ┃
┃ │ });                               ┃
┃                                     ┃
┃ 🛡️ Security & Safety Features      ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ Guardrail System                    ┃
┃                                     ┃
┃ • Workspace Snapshot Lock: Requires ┃
┃   current context before editing    ┃
┃ • Tool Transparency: Narrates all   ┃
┃   actions before execution          ┃
┃ • Policy Engine: Blocks dangerous   ┃
┃   operations automatically          ┃
┃ • Git Safety: Prevents destructive  ┃
┃   git operations                    ┃
┃                                     ┃
┃ Sandboxed Execution                 ┃
┃                                     ┃
┃ • Isolated Environment: Commands    ┃
┃   run in sandboxed directories      ┃
┃ • Resource Limits: Timeouts and     ┃
┃   memory constraints                ┃
┃ • Permission Controls: Granular     ┃
┃   tool access controls              ┃
┃                                     ┃
┃ 📊 Integration & Extensibility      ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ Provider System                     ┃
┃                                     ┃
┃ • OpenAI Integration: GPT models    ┃
┃   for coding tasks                  ┃
┃ • Anthropic Claude: Alternative AI  ┃
┃   provider                          ┃
┃ • Google GenAI: Additional model    ┃
┃   options                           ┃
┃ • Pluggable Architecture: Easy to   ┃
┃   add new providers                 ┃
┃                                     ┃
┃ MCP (Model Context Protocol)        ┃
┃ Support                             ┃
┃                                     ┃
┃ • External Tool Integration:        ┃
┃   Connects to external services and ┃
┃   APIs                              ┃
┃ • Filesystem Access: Remote file    ┃
┃   operations                        ┃
┃ • Custom Tools: Extensible tool     ┃
┃   ecosystem                         ┃
┃                                     ┃
┃ 🎯 Use Cases                        ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ For Developers                      ┃
┃                                     ┃
┃ • Rapid Prototyping: Generate and   ┃
┃   modify code quickly               ┃
┃ • Code Review: Automated analysis   ┃
┃   and quality assessment            ┃
┃ • Refactoring: Safe, guided code    ┃
┃   restructuring                     ┃
┃ • Testing: Automated test execution ┃
┃   and generation                    ┃
┃                                     ┃
┃ For Security Professionals          ┃
┃                                     ┃
┃ • Vulnerability Assessment:         ┃
┃   Automated security scanning       ┃
┃ • Penetration Testing: Offensive    ┃
┃   security testing                  ┃
┃ • Security Baselines: Establish and ┃
┃   verify security standards         ┃
┃ • Compliance Checking: Automated    ┃
┃   security compliance validation    ┃
┃                                     ┃
┃ For Teams                           ┃
┃                                     ┃
┃ • Workflow Automation: Multi-step   ┃
┃   process automation                ┃
┃ • Code Quality Gates: Automated     ┃
┃   quality checks                    ┃
┃ • Documentation Generation:         ┃
┃   Automated documentation updates   ┃
┃ • CI/CD Integration: Build and      ┃
┃   deployment automation             ┃
┃                                     ┃
┃ 🔄 Operational Flow                 ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ • Context Capture: Snapshot of      ┃
┃   current workspace and             ┃
┃   requirements                      ┃
┃ • Plan Generation: Break down       ┃
┃   requests into executable steps    ┃
┃ • Tool Execution: Run appropriate   ┃
┃   tools with safety checks          ┃
┃ • Validation: Verify results and    ┃
┃   run tests                         ┃
┃ • Reporting: Summarize changes and  ┃
┃   next steps                        ┃
┃                                     ┃
┃ 📈 Advanced Capabilities            ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ Just Implemented Enhancements       ┃
┃                                     ┃
┃ The repository recently gained      ┃
┃ significant new capabilities:       ┃
┃                                     ┃
┃ • Parallel Execution: Run multiple  ┃
┃   independent commands              ┃
┃   simultaneously                    ┃
┃ • Code Complexity Analysis:         ┃
┃   Advanced metrics for code quality ┃
┃   assessment                        ┃
┃ • Structured Task Management:       ┃
┃   Professional progress tracking    ┃
┃   for complex workflows             ┃
┃ • Performance Optimization:         ┃
┃   Multi-core utilization and        ┃
┃   efficiency improvements           ┃
┃                                     ┃
┃ Enterprise-Ready Features           ┃
┃                                     ┃
┃ • Audit Logging: Complete           ┃
┃   transparency of all operations    ┃
┃ • Policy Enforcement: Configurable  ┃
┃   security and safety rules         ┃
┃ • Multi-Environment Support:        ┃
┃   Development, staging, production  ┃
┃   contexts                          ┃
┃ • Team Collaboration: Shared        ┃
┃   configurations and rulebooks      ┃
┃                                     ┃
┃ 🎯 Unique Value Proposition         ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ This tool represents a significant  ┃
┃ advancement in AI-assisted          ┃
┃ development because it:             ┃
┃                                     ┃
┃ • Combines coding and security in a ┃
┃   single unified interface          ┃
┃ • Provides autonomous operation     ┃
┃   with appropriate safety           ┃
┃   constraints                       ┃
┃ • Offers enterprise-grade security  ┃
┃   features for professional use     ┃
┃ • Maintains full transparency with  ┃
┃   detailed operation logging        ┃
┃ • Supports complex workflows        ┃
┃   through agent orchestration       ┃
┃                                     ┃
┃ 🔮 Strategic Importance             ┃
┃ ─────────────────────────────────── ┃
┃                                     ┃
┃ The repository documentation        ┃
┃ indicates this was developed as a   ┃
┃ response to emerging AI security    ┃
┃ threats, with the goal of providing ┃
┃ powerful AI capabilities while      ┃
┃ maintaining appropriate safety      ┃
┃ controls and transparency. It's     ┃
┃ positioned as both a defensive tool ┃
┃ (security testing) and an offensive ┃
┃ capability (autonomous coding),     ┃
┃ making it valuable for security     ┃
┃ research, development acceleration, ┃
┃ and understanding AI capabilities   ┃
┃ in controlled environments.         ┃
┃                                     ┃
┃ In essence, Bo CLI is a             ┃
┃ sophisticated AI orchestration      ┃
┃ platform that transforms natural    ┃
┃ language requests into executable   ┃
┃ coding and security operations      ┃
┃ while maintaining comprehensive     ┃
┃ safety, transparency, and control.  ┃
╚═════════════════════════════════════╝
╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
  ⟡ elapsed 54s • usage 70,853 (in 69,438 / out 1,415) • context [▁▁▂▂▃▃▄▅▅▆▆▇▇█] 54%

✔ Waiting for next instruction...
                                 │
• Context 54% used (0s)
