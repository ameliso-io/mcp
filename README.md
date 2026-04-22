# Ameliso

Git-native manual testing management — agent-friendly, zero runtime dependencies for your test data.

Test cases, runs, and results live as plain Markdown and YAML files in any git repository. Ameliso is the tool that reads and writes them.

## Architecture

```
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

- `ameliso-server` — standalone gRPC server

### gRPC server

The gRPC server exposes all 26 RPCs defined in `server/proto/ameliso/v1/service.proto`.

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

### Web client

A browser UI for human testers. Talks gRPC-Web to `ameliso-server`.

```sh
pnpm dev        # starts both gRPC server + Next.js dev server (http://localhost:5173)
```

Tabs: **Overview** (coverage stats, affected cases by git diff), **Cases** (list/create/edit/delete), **Suites** (list/create/edit/delete), **Runs** (create/record results/finalize).

## Development

```sh
pnpm install          # install git hooks (Husky) and workspace packages
cargo test            # run all tests
make pre-commit       # fmt + lint
make pre-push         # build + test + coverage check
make coverage-check   # run coverage checks only
```

Git hooks run automatically after `pnpm install`.

### Coverage prerequisites

`cargo-llvm-cov` must be installed for Rust coverage:

```sh
cargo install cargo-llvm-cov
```

Thresholds: **60% line coverage** for `ameliso-server` (target: 80%), **99% statement/line, 85% branch, 75% function coverage** for the web frontend.
