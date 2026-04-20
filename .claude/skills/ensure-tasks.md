# Workbench: Ensure Tasks

Generate Centy issues when backlog is empty. Guarantees every improve cycle has tracked work to pull from.

---

## When to run

- Invoked directly via `/ensure-tasks`
- OR called by another skill when Centy returns zero open/in-progress issues

---

## Step 1 — Load context

Read these files before doing anything else:

1. `GOAL.md` — product vision; issues must advance this
2. `CONTRIBUTING.md` — hard constraints; never create an issue that violates these
3. `TODO.md` — explicit team todos; every entry here becomes a candidate issue

Do not skip this step.

---

## Step 2 — Survey codebase

Run:

```sh
git log --oneline -20
git status
```

Scan top-level directories. For each one with code, read its entry-point to understand actual vs. intended behavior.

---

## Step 3 — Identify gaps

Catalog gaps across three categories (same as improve.md Step 4):

### A. Feature gaps vs. GOAL.md

Core delegation flow ranked by impact:

1. One-click "Delegate to Claude Code" on any inbox item
2. Auto-delegation rules (e.g., "Slack auth question → Claude handles it")
3. GitHub PR source (reviews requested, CI failures, merge conflicts)
4. JIRA ticket source
5. Cross-source unified view

### B. TODO.md entries not yet tracked

Each untracked TODO becomes one issue.

### C. Contributing-rules violations

- Domain logic duplicated across `web/` and `tui/` that should live in `logic/`
- Any pattern that breaks `CONTRIBUTING.md` rules

---

## Step 4 — Create issues

For each gap (create **3–10 issues**, prioritizing A → B → C):

Use `mcp__centy__centy_v1_CentyDaemon_CreateItem` with:

- `project_path`: current working directory
- `item_type`: `"issue"`
- `title`: concise, action-verb form (e.g., "Add one-click delegate button to inbox item")
- `body`: two sections:
  - **Why**: one sentence linking to GOAL.md impact
  - **Done when**: concrete acceptance criteria (bullet list)

Skip duplicates — check existing issues first via `ListItems` before creating.

---

## Step 5 — Report

List every created issue: title + one-line why. State total count.
