# Minimal Feature Set

Purpose: keep the CLI focused on day-to-day software engineering. Everything else has been disabled or removed from the default build.

## Core capabilities (kept)
- Filesystem: `read_file`, `write_file` (now defaults to empty content with a warning), list files, and diff previews.
- Edit: `edit_file` for targeted replacements.
- Search: ripgrep-backed search plus definition/grep helpers.
- Glob: fast pattern listing for navigation.
- Bash: sandbox-aware shell execution for tests/builds.

## Removed/disabled
- Web fetch/search, MCP connectors, agent spawning/mission control, pentest/security scanners.
- Dependency/security auditing, repo checks, development workflow wrappers, code intelligence/observability/performance suites.
- Notebook editing, task/todo/interaction helpers, telemetry/caching layers.

These tool suites were pruned from `src/contracts/tools.schema.json` and from the default plugin registration (`src/plugins/tools/nodeDefaults.ts`). The capability index now only exports the minimal set.

## Rationale
- Reduce attack surface and surprise behaviors.
- Keep the tool palette predictable for code edits, searches, and local command execution.
- Avoid validation dead-ends like `write_file` without content (now handled gracefully).
