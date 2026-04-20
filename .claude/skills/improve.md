# Workbench: Improve

You are making the Workbench project better. Workbench is a **unified engineering inbox** — it aggregates Slack mentions, PR reviews, CI failures, and JIRA tickets, and lets engineers delegate those items to a local Claude Code instance (one-click or automatically via rules).

Follow these steps exactly, in order.

---

## Step 1 — Load authoritative context

Read these files before touching anything else:

1. `GOAL.md` — the product vision; every improvement must move toward this
2. `CONTRIBUTING.md` — hard engineering constraints; violations are not acceptable
3. `TODO.md` — explicit todos left by the team; treat these as high-priority candidates for Step 3B
4. https://github.com/tupe12334/guidelines/tree/main/rules — team-wide coding rules; all code must comply

Do not skip this step. Do not rely on memory of prior conversations.

---

## Step 2 — Check open Centy issues

Use the `mcp__centy__centy_v1_CentyDaemon_ListItems` tool to fetch open issues for this project:

- `project_path`: current working directory
- `item_type`: `"issues"`
- `filter`: `{"status":{"$in":["open","in-progress"]}}`

List all results. These are tracked work items — treat them as equal-priority candidates alongside `TODO.md` entries in Step 3B.

**If zero open/in-progress issues are returned**, invoke the `ensure-tasks` skill now (via the Skill tool with skill name `ensure-tasks`) before continuing. Wait for it to finish and use the newly created issues as the backlog for Step 4B.

If the Centy daemon is unavailable or the project has no `.centy` folder, skip silently and continue.

---

## Step 3 — Survey the current state

<!-- cspell:ignore oneline -->

**First**, sync with latest upstream changes:

```sh
git fetch origin
git merge origin/main
```

If merge conflicts arise, resolve them before proceeding. Do not implement on a stale base.

Run:

```sh
git log --oneline -15
git status
```

Then scan the top-level directories. For each one that has code (not just a placeholder), read its entry-point file to understand what it actually does vs. what the architecture says it should do.

---

## Step 4 — Gap analysis

Catalog every gap you find across three categories:

### A. Feature gaps (things in GOAL.md that aren't built yet)

The core goal is **delegation to Claude Code**. Rank these in order of impact:

1. One-click "Delegate to Claude Code" action on any inbox item
2. Auto-delegation rules (e.g., "any Slack question about auth → Claude handles it")
3. GitHub PR source (reviews requested, CI failures, merge conflicts)
4. JIRA ticket source
5. Cross-source unified view

### B. Explicit TODOs and open Centy issues

List every item from `TODO.md` and every open/in-progress issue found in Step 2. These represent things the team already decided need doing — prioritize them over your own gap analysis unless they conflict with `GOAL.md`.

### C. Quality / contributing-rules violations

Check for:

- Domain logic duplicated across `web/` and `tui/` that should live in `logic/`

## Step 5 — Pick one improvement and implement it

Select the **single highest-value improvement** that:

- Best advances the core goal (Claude Code delegation > more integrations > plumbing)
- Is completable in one focused session (prefer concrete + testable over large rewrites)
- Obeys every rule in `CONTRIBUTING.md`

**Before writing any code**, state in one sentence:

> "I am implementing X because it advances the goal by Y."

Then implement it. Apply these rules without exception:

- **Package manager**: `pnpm` only — never `npm install` or `yarn`
- **Service communication**: gRPC only — never REST, GraphQL, or WebSocket for service-to-service calls
- **Language preference**: new backend services → Rust; new shared logic → `logic/` as a Rust function compiled to WASM; TypeScript only for UI glue
- **No logic duplication**: if the same computation needs to run in both `web/` and `tui/`, it goes in `logic/src/lib.rs` and is imported — not copy-pasted

---

## Step 6 — Verify and report

After implementing:

1. Run the build and type-check for every package you touched (`pnpm build`, `cargo check`, etc.)
2. Fix any errors before reporting done
3. Commit all changed files with a clear message describing what was built and why
4. Push the commit to origin
5. Report concisely:
   - What changed (file list + one-line summary per file)
   - Why it matters for the goal
   - What the next highest-value improvement is
