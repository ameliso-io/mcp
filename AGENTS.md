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
server/   # gRPC server (Rust + tonic); exposes AmelisoService (17 RPCs)
mcp/      # MCP server (Rust + rmcp); stdio transport; 17 tools
cli/      # CLI (Rust + clap); calls repo logic directly
proto/    # Protobuf definitions (ameliso/v1/types.proto + service.proto)
```

---

## Using Ameliso via MCP (recommended for agents)

This repository ships a `.mcp.json` that auto-starts the MCP server.
Available tools:

| Tool | Description |
|------|-------------|
| `list_cases` | List cases; filter by tags, priority, or full-text query |
| `get_case` | Get full case details including steps and body |
| `create_case` | Create a new case file; priority must be low\|medium\|high |
| `update_case` | Update case metadata and optionally replace body |
| `delete_case` | Delete a case file |
| `coverage_report` | Latest status per case; filter by status |
| `list_runs` | List test runs; filter by status; shows suite scope |
| `get_run` | Get a run with pass/fail/blocked/skipped summary and results |
| `create_run` | Start a new test run; returns run ID and scope size; suite must exist |
| `record_result` | Record a case result; case must exist; rejects closed runs |
| `finalize_run` | Mark a run completed or aborted |
| `list_suites` | List all suites |
| `get_suite` | Get a suite by slug |
| `create_suite` | Create a new suite |
| `update_suite` | Update a suite's name, description, or case list |
| `delete_suite` | Delete a suite file |
| `get_affected_cases` | Cases that may need re-running based on git changes; shows title/priority/tags |
| `get_pending_cases` | Cases in a run's scope with no result yet; sorted high→medium→low priority |

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
ameliso cases list --priority high
ameliso cases get auth/login
ameliso cases create auth/login --title "User Login" --description "Verify login" --priority high
ameliso cases create auth/login --title "User Login" --description "..." \
    --body "## Steps\n\n1. Navigate to /login\n"
ameliso cases update auth/login --title "User Login Flow" --description "..."
ameliso cases delete auth/login

# Runs
ameliso runs list
ameliso runs list --status in-progress
ameliso runs get 2026-04-21-smoke
ameliso runs create smoke --tester alice --environment staging
ameliso runs record 2026-04-21-smoke auth/login passed --notes "Worked on Chrome"
ameliso runs finalize 2026-04-21-smoke completed
ameliso runs pending 2026-04-21-smoke

# Suites
ameliso suites list
ameliso suites get smoke
ameliso suites create smoke --name "Smoke Suite" --cases auth/login,billing/checkout
ameliso suites update smoke --name "Smoke Suite" --cases auth/login,billing/checkout,payments/refund

# Reports
ameliso coverage
ameliso coverage --status never
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
- If using `--suite`, the suite must already exist (`create_run` validates this).
- `create_run` immediately reports the scope size (number of cases to test).

### Recording results
Use `record_result` (MCP) or `ameliso runs record` (CLI).
Both reject writes to a `completed` or `aborted` run.
Both reject results for case paths that don't exist (use exact paths from `get_pending_cases`).

### Tracking progress in an active run
Use `get_pending_cases` (MCP) or `ameliso runs pending <run_id>` (CLI) to see
which cases in the run's scope still need results recorded. Scope = suite cases
if the run was created with `--suite`; otherwise all cases in the repo.

Typical agent workflow:
1. `list_runs --status in-progress` → find the active run_id
2. `get_pending_cases` → which cases still need results
3. `record_result` for each pending case
4. When all done: `finalize_run`

### After code changes
Use `get_affected_cases` (MCP) or `ameliso affected` (CLI) to identify cases
that need re-running. The tool compares git history since the last run commit.

---

## Commit conventions

Reference case paths in commit messages when a commit affects a specific test case:

```
fix: login redirect on mobile (cases/auth/login)
```

The `GetAffectedCases` RPC scans commit messages for these references.
