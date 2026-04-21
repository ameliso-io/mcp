# Ameliso

Git-native manual testing management — agent-friendly, zero runtime dependencies for your test data.

Test cases, runs, and results live as plain Markdown and YAML files in any git repository. Ameliso is the tool that reads and writes them.

## Architecture

```
Coding Agent  →  MCP Server  →  Repo logic  →  controlled git repo
Human Tester  →  CLI         →  Repo logic  →  controlled git repo
Browser       →  Web Client  →  gRPC Server →  controlled git repo
```

The **controlled repository** (your project's repo) stores:

```
cases/{category}/{slug}.md         # one file per test case
suites/{slug}.yaml                 # optional groupings
runs/{YYYY-MM-DD}-{slug}/
  run.yaml                         # run metadata
  results/{case_path}.md           # one result per executed case
```

## Quick start

### Build

```sh
cargo build --release
```

Binaries land in `target/release/`:
- `ameliso` — CLI for human testers
- `ameliso-mcp` — MCP server for coding agents (stdio transport)
- `ameliso-server` — standalone gRPC server

### CLI usage

```sh
export AMELISO_REPO=/path/to/your/project

# Cases
ameliso cases list
ameliso cases list --tags auth --query login
ameliso cases get auth/login
ameliso cases create auth/login --title "User Login" --description "Verify login" --priority high
ameliso cases create auth/login --title "User Login" --description "..." --body "## Steps\n\n1. ..."
ameliso cases update auth/login --title "User Login Flow" --description "..."
ameliso cases delete auth/login

# Runs
ameliso runs list
ameliso runs list --status in-progress
ameliso runs create smoke --tester alice --environment staging
ameliso runs record 2026-04-21-smoke auth/login passed --notes "Worked on Chrome"
ameliso runs finalize 2026-04-21-smoke completed
ameliso runs get 2026-04-21-smoke

# Suites
ameliso suites list
ameliso suites create smoke --name "Smoke Suite" --cases auth/login,billing/checkout

# Reports
ameliso coverage
ameliso affected
ameliso affected --since HEAD~10
```

### MCP server (coding agents)

Add to your Claude Code / MCP host configuration (`.mcp.json` is pre-configured in this repo):

```json
{
  "mcpServers": {
    "ameliso": {
      "command": "ameliso-mcp"
    }
  }
}
```

Available tools: `list_cases`, `get_case`, `create_case`, `update_case`, `delete_case`, `coverage_report`, `list_runs`, `get_run`, `create_run`, `record_result`, `finalize_run`, `list_suites`, `get_suite`, `create_suite`, `update_suite`, `delete_suite`, `get_affected_cases`.

See [AGENTS.md](AGENTS.md) for full agent usage guide.

### gRPC server

The gRPC server exposes all 17 RPCs defined in `server/proto/ameliso/v1/service.proto`.

```sh
ameliso-server         # listens on [::1]:50051
```

## File format

### Test case (`cases/auth/login.md`)

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

### Test result (`runs/2026-04-21-smoke/results/auth/login.md`)

```markdown
---
status: passed
---

All steps completed. Verified on Chrome 124.
```

## Development

```sh
pnpm install          # install git hooks (Husky)
cargo test            # run all tests
make pre-commit       # fmt + lint
make pre-push         # build + test
```

Git hooks run automatically after `pnpm install`.
