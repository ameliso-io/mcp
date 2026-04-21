---
description: Make the Workbench project better — pick the highest-value improvement, implement it, verify it builds, and push. Workbench is a unified engineering inbox that lets engineers delegate Slack/PR/CI/JIRA items to Claude Code.
allowed-tools: Bash(git *), Bash(pnpm *), Bash(cargo *), Read, Edit, Write, Grep, Glob, WebFetch, mcp__centy__centy_v1_CentyDaemon_ListItems, mcp__centy__IsRunning
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

List all results. If zero open/in-progress issues are returned, invoke the `ensure-tasks` skill now and wait for it to finish before continuing.

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

Scan top-level dirs. For each one with code, read its entry-point to understand actual vs. intended behavior.

## Step 4 — Gap analysis

**A. Feature gaps** (things in GOAL.md not built yet) — ranked by impact:
1. One-click "Delegate to Claude Code" action on any inbox item
2. Auto-delegation rules (e.g., "any Slack auth question → Claude handles it")
3. GitHub PR source (reviews requested, CI failures, merge conflicts)
4. JIRA ticket source
5. Cross-source unified view

**B. Explicit TODOs and open Centy issues** — list every open/in-progress issue from Step 2. Prioritize these over your own gap analysis unless they conflict with GOAL.md.

**C. Quality / contributing-rules violations:**
- Domain logic duplicated across `web/` and `tui/` that should live in `logic/`

## Step 5 — Pick one improvement and implement it

Select the single highest-value improvement that:
- Best advances the core goal (Claude Code delegation > more integrations > plumbing)
- Is completable in one focused session (prefer concrete + testable over large rewrites)
- Obeys every rule in `CONTRIBUTING.md`

State before writing any code:
> "I am implementing X because it advances the goal by Y."

Hard rules:
- **Package manager**: `pnpm` only — never `npm install` or `yarn`
- **Service communication**: gRPC only — never REST, GraphQL, or WebSocket for service-to-service calls
- **Language**: new backend services → Rust; new shared logic → `logic/` as Rust compiled to WASM; TypeScript only for UI glue
- **No logic duplication**: if computation runs in both `web/` and `tui/`, it goes in `logic/src/lib.rs` — never copy-pasted

## Step 6 — Verify and report

1. Run build + type-check for every package touched (`pnpm build`, `cargo check`, etc.)
2. Fix any errors before reporting done
3. Commit all changed files with a clear message
4. Push to origin
5. Report: what changed (file list + one-line summary per file), why it matters, what the next improvement is
