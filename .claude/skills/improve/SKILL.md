---
description: Make Ameliso better — pick the highest-value improvement for server or web, implement it end-to-end, verify it builds and tests pass, commit and push.
allowed-tools: Bash(git *), Bash(pnpm *), Bash(cargo *), Bash(buf *), Read, Edit, Write, Grep, Glob, WebFetch, mcp__centy__centy_v1_CentyDaemon_ListItems, mcp__centy__IsRunning
---

Follow these steps exactly, in order.

## Step 1 — Load authoritative context

Read before touching anything else:

1. `GOAL.md` — product vision; every improvement must move toward this
2. `CONTRIBUTING.md` — hard engineering constraints; violations are not acceptable

Do not skip. Do not rely on memory of prior conversations.

## Step 2 — Check open Centy issues

Use `mcp__centy__centy_v1_CentyDaemon_ListItems`:

- `project_path`: current working directory
- `item_type`: `"issues"`
- `filter`: `{"status":{"$in":["open","in-progress"]}}`

List all results. Prioritize by priority field (1 = highest).

If Centy daemon is unavailable or no `.centy` folder exists, skip silently.

## Step 3 — Survey current state

Sync first:

```sh
git fetch origin
git merge origin/main
```

Resolve any merge conflicts before proceeding.

```sh
git log --oneline -15
git status
```

## Step 4 — Pick one improvement and implement it

**Focus exclusively on `server/` and `web/`.** Do NOT touch `cli/` or `mcp/`.

Select the single highest-value improvement from:

1. Open Centy issues (P1 before P2)
2. Feature gaps visible from GOAL.md
3. Test coverage gaps in `server/src/`
4. Web UI improvements in `web/src/`

State before writing any code:

> "I am implementing X because it advances the goal by Y."

Hard rules:

- **Scope**: server (`server/`) and web (`web/`) only — never touch `cli/src/main.rs` or `mcp/src/main.rs`
- **Proto changes**: always run `cd server && buf generate` after editing `.proto` files
- **Proto-first**: new RPCs start in `service.proto` → `buf generate` → `server/src/repo.rs` → `server/src/service.rs` → `web/src/`
- **Tests**: add validation tests for every new repo function (lazy pool pattern — no DB needed)
- **Package manager**: `pnpm` only inside `web/`
- **No half-finished work**: each iteration must compile and all tests pass before commit

## Step 5 — Verify, commit, and push

After each logical unit of work (not just at the end):

1. `cargo build --manifest-path server/Cargo.toml` — must succeed
2. `cargo test --manifest-path server/Cargo.toml` — all tests pass
3. `npm run test:typecheck` inside `web/` — no TypeScript errors
4. Commit all changed files with a conventional commit message
5. **`git push` immediately after every commit** — do not batch commits; push each one as it lands
6. If push fails (pre-push hook), fix the failure, amend or create a new commit, push again
7. Report: what changed, why it matters, what to do next
