---
# This file is managed by Centy. Use the Centy CLI to modify it.
displayNumber: 19
status: open
priority: 2
createdAt: 2026-04-21T23:32:26.178306+00:00
updatedAt: 2026-04-21T23:32:26.178306+00:00
---

# Switch from sqlx raw SQL to ORM (sea-orm or diesel)

## Problem

Currently using `sqlx` for raw SQL queries with compile-time verification. No model abstraction, no migration management, no relationship handling.

## Goal

Migrate to a Rust ORM — candidates:
- **sea-orm**: async-first, active record + data mapper, good tokio/sqlx integration
- **diesel**: mature, sync by default (async via diesel-async), strong type safety

## Tasks

- [ ] Evaluate sea-orm vs diesel for this stack (tokio + postgres)
- [ ] Replace `sqlx` dependency in `server/Cargo.toml`
- [ ] Define entity/model structs
- [ ] Migrate existing queries to ORM
- [ ] Verify integration tests pass
