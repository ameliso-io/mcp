---
# This file is managed by Centy. Use the Centy CLI to modify it.
displayNumber: 1
priority: 1
createdAt: 2026-04-21T10:40:19.535614+00:00
updatedAt: 2026-04-21T10:40:19.535614+00:00
---

# 100% test coverage across all crates and frontend

Achieve 100% test coverage in every component of the ameliso monorepo.

## Scope
- `server` crate: unit tests for each module (repo.rs, git.rs, github.rs, repos_store.rs, service.rs)
- `cli` crate: unit + integration tests for all commands
- `mcp` crate: unit tests for all tool handlers
- `web`: Vitest infrastructure + component tests for all React components

## Current state
- Only `server/tests/integration.rs` exists (31 tests, integration only)
- No unit tests in any module
- No frontend testing framework
- No CLI or MCP tests
