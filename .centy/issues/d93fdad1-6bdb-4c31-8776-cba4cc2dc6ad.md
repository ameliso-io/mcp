---
# This file is managed by Centy. Use the Centy CLI to modify it.
displayNumber: 3
status: open
priority: 1
createdAt: 2026-04-21T10:40:26.671669+00:00
updatedAt: 2026-04-21T10:40:26.671669+00:00
tags:
- testing
- server
- coverage
---

# Unit tests for server/src/repo.rs

Add unit tests covering all functions in `server/src/repo.rs` — the core repository logic.

## What to test
- Case CRUD: create, get, update, delete, list
- Run lifecycle: create, record_result, finalize
- Suite operations
- Coverage report generation
- Affected cases detection (git diff parsing)
- Edge cases: missing files, malformed YAML/Markdown, duplicate IDs

## Notes
- Use `tempfile` crate for isolated git repos (same pattern as integration tests)
- Test each function in isolation where possible
- Prefer `#[tokio::test]` since repo ops are async
