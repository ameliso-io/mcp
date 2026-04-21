---
description: Generate Centy issues when backlog is empty. Invoked by improve skill or directly via /ensure-tasks when zero open/in-progress issues exist.
allowed-tools: Bash(git *), Read, mcp__centy__centy_v1_CentyDaemon_ListItems, mcp__centy__centy_v1_CentyDaemon_CreateItem, mcp__centy__IsRunning
---

Generate 3–10 Centy issues when backlog is empty. Every issue must advance GOAL.md.

## Step 1 — Load context

Read these files before doing anything else:

1. `GOAL.md` — product vision; issues must advance this
2. `CONTRIBUTING.md` — hard constraints; never create a violating issue

Do not skip this step.

## Step 2 — Survey codebase

```sh
git log --oneline -20
git status
```

Scan top-level directories. For each one with code, read its entry-point to understand actual vs. intended behavior.

## Step 3 — Identify gaps

Catalog gaps across three categories:

**A. Feature gaps vs. GOAL.md** — core delegation flow ranked by impact:
1. One-click "Delegate to Claude Code" on any inbox item
2. Auto-delegation rules (e.g., "Slack auth question → Claude handles it")
3. GitHub PR source (reviews requested, CI failures, merge conflicts)
4. JIRA ticket source
5. Cross-source unified view

**B. Explicit TODOs** — search for `TODO` comments in code via Grep; each becomes a candidate issue.

**C. Contributing-rules violations:**
- Domain logic duplicated across `web/` and `tui/` that should live in `logic/`
- Any pattern that breaks `CONTRIBUTING.md` rules

## Step 4 — Create issues

Check existing issues first via `mcp__centy__centy_v1_CentyDaemon_ListItems` — skip duplicates.

For each gap, use `mcp__centy__centy_v1_CentyDaemon_CreateItem` with:
- `project_path`: current working directory
- `item_type`: `"issue"`
- `title`: action-verb form (e.g., "Add one-click delegate button to inbox item")
- `body`: **Why** (one sentence linking to GOAL.md) + **Done when** (bullet acceptance criteria)

Priority: A → B → C. Create 3–10 issues.

## Step 5 — Report

List every created issue: title + one-line why. State total count.
