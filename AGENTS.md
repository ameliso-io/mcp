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
server/          # gRPC server (Rust + tonic); exposes AmelisoService (26 RPCs)
server/proto/    # Protobuf definitions (ameliso/v1/types.proto + service.proto)
mcp/             # MCP server (Rust + rmcp); stdio transport; 24 tools
cli/             # CLI (Rust + clap); calls repo logic directly
web/             # React browser client (Next.js + TypeScript); talks gRPC-Web to server
```

---

## Using Ameliso via MCP (recommended for agents)

This repository ships a `.mcp.json` that auto-starts the MCP server.
Available tools:

| Tool | Description |
|------|-------------|
| `repo_status` | **Start here**: overview of cases by priority, coverage stats, active runs (with pending counts), and suites in one call |
| `list_cases` | List cases; filter by tags, priority, full-text query, or suite slug |
| `get_case` | Get full case details including steps and body |
| `create_case` | Create a new case file; priority must be low\|medium\|high |
| `update_case` | Patch-style update: all fields optional — omit any to keep existing value |
| `delete_case` | Delete a case file |
| `coverage_report` | Latest status per case; filter by status |
| `list_runs` | List test runs; filter by status; shows suite scope |
| `get_run` | Get a run with pass/fail/blocked/skipped summary and results |
| `create_run` | Start a new test run; returns run ID and scope size; suite must exist |
| `record_result` | Record a case result; case must exist; rejects closed runs |
| `finalize_run` | Mark a run completed or aborted |
| `delete_run` | Delete a run directory entirely (use to clean up accidental runs) |
| `list_suites` | List all suites |
| `get_suite` | Get a suite by slug |
| `create_suite` | Create a new suite |
| `update_suite` | Patch-style update: all fields optional — omit any to keep existing value. Pass `cases` to replace the full case list (including empty to clear all). |
| `delete_suite` | Delete a suite file |
| `bulk_record_results` | Record multiple case results in one call; returns per-result confirmation + progress |
| `get_affected_cases` | Cases that may need re-running based on git changes; shows title/priority/tags |
| `get_pending_cases` | Cases in a run's scope with no result yet; sorted high→medium→low priority |
| `list_repositories` | List all connected GitHub repos and their `repo_id` values — use this first if `repo_id` is unknown |
| `sync_repository` | Force a full re-sync of all case files from GitHub — use after pushing case changes when you can't wait for the webhook |
| `remove_repository` | Disconnect a GitHub repo and delete all its synced case data from this installation |

All tools accept `repo_id` — the repository identifier (e.g. `owner/repo`). If unknown, call `list_repositories` first.

---

## CLI usage

```sh
# Build first (only needed once)
cargo build --release

# Environment variables (set once)
export AMELISO_SERVER_URL=http://localhost:50052  # default: http://[::1]:50052
export AMELISO_REPO_ID=owner/repo                # use `ameliso repos list` if unknown

# Cases
ameliso cases list
ameliso cases list --tags auth --query login
ameliso cases list --priority high
ameliso cases list --suite smoke
ameliso cases list --json        # machine-readable JSON array of case objects
ameliso cases get auth/login --json  # machine-readable JSON: case object + body
ameliso cases get auth/login
ameliso cases create auth/login --title "User Login" --description "Verify login" --priority high
ameliso cases create auth/login --title "User Login" --description "..." \
    --body "## Steps\n\n1. Navigate to /login\n"
ameliso cases create auth/login --title "User Login" --json  # machine-readable: { file_path, path, title, priority, tags }
ameliso cases update auth/login --priority high              # patch: change only priority
ameliso cases update auth/login --title "User Login Flow" --json  # machine-readable: { file_path, path, title, ... }
ameliso cases delete auth/login --json                       # machine-readable: { file_path }

# Runs
ameliso runs list
ameliso runs list --status in-progress
ameliso runs list --json             # machine-readable JSON array of run objects
ameliso runs get 2026-04-21-smoke --json  # machine-readable JSON: run + results[]
ameliso runs get 2026-04-21-smoke
ameliso runs create smoke --tester alice --environment staging
ameliso runs create smoke --json     # machine-readable: { run_id, dir_path, total_in_scope, scope[] }
ameliso runs record 2026-04-21-smoke auth/login passed --notes "Worked on Chrome"
ameliso runs record 2026-04-21-smoke auth/login passed --json  # machine-readable: { case_path, status, done, total, remaining }
ameliso runs finalize 2026-04-21-smoke completed
ameliso runs finalize 2026-04-21-smoke completed --json  # machine-readable: { run_id, status, passed, failed, ... }
ameliso runs delete 2026-04-21-smoke
ameliso runs pending 2026-04-21-smoke
ameliso runs pending 2026-04-21-smoke --json  # machine-readable: { pending_count, total_in_scope, done, cases[] }

# Bulk record
ameliso runs bulk-record 2026-04-21-smoke auth/login:passed auth/logout:failed:"login broke"
ameliso runs bulk-record 2026-04-21-smoke auth/login:passed --json  # machine-readable: { results[], pending_count, total_in_scope, done }

# Suites
ameliso suites list
ameliso suites list --json           # machine-readable JSON array of suite objects
ameliso suites get smoke --json      # machine-readable JSON: suite object with cases[]
ameliso suites get smoke
ameliso suites create smoke --name "Smoke Suite" --cases auth/login,billing/checkout
ameliso suites create smoke --name "Smoke Suite" --cases auth/login --json  # machine-readable: { file_path, slug, name, case_count }
ameliso suites update smoke --cases auth/login,billing/checkout,payments/refund  # patch: change only cases
ameliso suites update smoke --cases auth/login --json  # machine-readable: { file_path, slug, name, case_count }

# Reports
ameliso coverage
ameliso coverage --status never
ameliso coverage --json          # machine-readable JSON: { run_count, entries[] }
ameliso affected
ameliso affected --json          # machine-readable JSON: { reason, cases[] }
ameliso affected --since HEAD~10
ameliso status --repo-id owner/repo
ameliso status --repo-id owner/repo --json  # machine-readable JSON: { cases, coverage, active_runs[] }

# Repositories (no --repo-id needed)
ameliso repos list               # list all connected repos with repo_id and URL
ameliso repos list --json        # machine-readable JSON: [{ repo_id, name, url, added_at }]
ameliso repos sync owner/repo    # force immediate re-sync of all case files from GitHub
ameliso repos remove owner/repo  # disconnect repo and delete all synced case data
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

### Finding your repo_id
If `repo_id` is not provided in the task context, call `list_repositories` first:
- MCP: `list_repositories` (no parameters) → returns all connected repos with `repo_id` and URL
- CLI: `ameliso cases list --repo-id <id>` requires knowing the id first — use MCP if unsure

### When to create a test case
- A feature or user-facing behaviour has no corresponding case in `cases/`.
- Use `list_cases` (MCP) or `ameliso cases list` (CLI) to check coverage first.

### When to create a test run
- After executing one or more cases manually or in a controlled environment.
- Never fabricate results — a run represents a real execution.
- If using `--suite`, the suite must already exist (`create_run` validates this).
- `create_run` returns the full list of cases to test sorted by priority — no separate `get_pending_cases` call needed at the start.

### Recording results
Use `record_result` (MCP) or `ameliso runs record` (CLI) for individual results.
Use `bulk_record_results` (MCP / gRPC) when you have multiple results ready — it's a
single call instead of N calls and returns overall progress.
Both reject writes to a `completed` or `aborted` run.
Both reject results for case paths that don't exist (use exact paths from `get_pending_cases`).

### Tracking progress in an active run
Use `get_pending_cases` (MCP) or `ameliso runs pending <run_id>` (CLI) to see
which cases in the run's scope still need results recorded. Scope = suite cases
if the run was created with `--suite`; otherwise all cases in the repo.

Typical agent workflow:
1. `repo_status` → see all active runs with pending counts (or `list_runs --status in-progress` to get just IDs)
2. `get_pending_cases` → which cases still need results (sorted high→medium→low priority)
3. `bulk_record_results` for all ready results in one call (or `record_result` one at a time)
4. When all done: `finalize_run` (warns if any cases still pending)

### Updating cases and suites
Both `update_case` and `update_suite` are **patch-style**: omit any field to preserve its current value.
- To change only priority: `update_case case_path=X priority=high` (title/description/tags unchanged)
- To add a case to a suite: `get_suite` first, then `update_suite cases=existing,new` (or omit cases to keep list unchanged)
- Passing an empty string for `tags` in `update_case` clears all tags.

### After code changes
Use `get_affected_cases` (MCP) or `ameliso affected` (CLI) to identify cases
that need re-running. The tool compares git history since the last run commit.

### After pushing case file changes to git
The webhook auto-syncs case files on push. If you need immediate sync (not waiting for the webhook):
- MCP: `sync_repository` with `repo_id` — triggers a full re-sync from GitHub

---

## Commit conventions

Reference case paths in commit messages when a commit affects a specific test case:

```
fix: login redirect on mobile (cases/auth/login)
```

The `GetAffectedCases` RPC scans commit messages for these references.
