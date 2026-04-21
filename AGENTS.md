# Ameliso — Agent Instructions

This file is the authoritative reference for coding agents working in this repository.
Read it before touching any test case, run file, or Ameliso source code.

---

## What this project is

Ameliso is a **git-native manual testing management system** — a tool that manages
a controlled repository of test cases and test runs stored as Markdown/YAML files.

### Controlled repository structure

When a user points Ameliso at their project repository, it expects:

```
cases/{category}/{slug}.md         # one file per test case
suites/{slug}.yaml                 # optional groupings of cases
runs/{YYYY-MM-DD}-{slug}/
  run.yaml                         # run metadata
  results/{case_path}.md           # one result per executed case
```

### This repository's structure

```
server/   # gRPC server (Rust + tonic); exposes AmelisoService (16 RPCs)
mcp/      # MCP server (Rust + rmcp); stdio transport; 16 tools
cli/      # CLI (Rust + clap); calls repo logic directly
proto/    # Protobuf definitions (ameliso/v1/types.proto + service.proto)
```

---

## Using Ameliso via MCP (recommended for agents)

This repository ships a `.mcp.json` that auto-starts the MCP server.
Available tools:

| Tool | Description |
|------|-------------|
| `list_cases` | List cases; filter by tags or query |
| `get_case` | Get full case details including steps and body |
| `create_case` | Create a new case file; optionally supply body |
| `update_case` | Update case metadata and optionally replace body |
| `delete_case` | Delete a case file |
| `coverage_report` | Latest status per case across all runs |
| `list_runs` | List test runs |
| `get_run` | Get a run with all its results |
| `create_run` | Start a new test run |
| `record_result` | Record a case result (passed/failed/blocked/skipped) |
| `finalize_run` | Mark a run completed or aborted |
| `list_suites` | List all suites |
| `get_suite` | Get a suite by slug |
| `create_suite` | Create a new suite |
| `get_affected_cases` | Cases that may need re-running based on git changes |

All tools accept `repo_path` — the absolute path to the controlled repository.

---

## CLI usage

```sh
# Build first (only needed once)
cargo build --release

# Cases
export AMELISO_REPO=/path/to/project
ameliso cases list
ameliso cases list --tags auth --query login
ameliso cases get auth/login
ameliso cases create auth/login --title "User Login" --description "Verify login" --priority high
ameliso cases create auth/login --title "User Login" --description "..." \
    --body "## Steps\n\n1. Navigate to /login\n"
ameliso cases update auth/login --title "User Login Flow" --description "..."
ameliso cases delete auth/login

# Runs
ameliso runs list
ameliso runs get 2026-04-21-smoke
ameliso runs create smoke --tester alice --environment staging
ameliso runs record 2026-04-21-smoke auth/login passed --notes "Worked on Chrome"
ameliso runs finalize 2026-04-21-smoke completed

# Suites
ameliso suites list
ameliso suites get smoke
ameliso suites create smoke --name "Smoke Suite" --cases auth/login,billing/checkout

# Reports
ameliso coverage
ameliso affected
ameliso affected --since HEAD~10
```

---

## Test case file format

```markdown
---
title: User Login
description: Verify that a registered user can log in with valid credentials
tags: [auth, smoke]
priority: high
created_at: 2026-04-21
updated_at: 2026-04-21
---

## Steps

1. Navigate to /login
2. Enter valid email and password
3. Click "Sign in"

## Expected Result

User is redirected to the dashboard. Session cookie is set.
```

---

## Test result file format

```markdown
---
status: passed
---

Notes go here (optional).
```

---

## Decision rules

### When to create a test case
- A feature or user-facing behaviour has no corresponding case in `cases/`.
- Use `list_cases` (MCP) or `ameliso cases list` (CLI) to check coverage first.

### When to create a test run
- After executing one or more cases manually or in a controlled environment.
- Never fabricate results — a run represents a real execution.

### Recording results
Use `record_result` (MCP) or `ameliso runs record` (CLI).
Both reject writes to a `completed` or `aborted` run.

### After code changes
Run `get_affected_cases` via the gRPC API or check coverage to identify cases
that need re-running before the next release.

---

## Commit conventions

Reference case paths in commit messages when a commit affects a specific test case:

```
fix: login redirect on mobile (cases/auth/login)
```

The `GetAffectedCases` RPC scans commit messages for these references.
