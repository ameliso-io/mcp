# Ameliso — Agent Instructions

This file is the authoritative reference for coding agents working in this repository.
Read it before touching any test case or run file.

---

## What this repo is

Ameliso is a **git-native manual testing management system**.

- `test-cases/` — one Markdown file per test case (`TC-NNN-<slug>.md`)
- `test-runs/` — one Markdown file per test run (`RUN-NNN-YYYY-MM-DD.md`)
- `SCHEMA.md` — full file format specification
- `ameliso.py` — unified CLI (requires Python 3.9+, no extra packages)

---

## Discovery

Find test cases without reading every file:

```sh
python3 ameliso.py search "login"                    # full-text
python3 ameliso.py search --tag auth                 # by tag
python3 ameliso.py search --priority high --json     # by priority, machine-readable
python3 ameliso.py search --status never             # never-run test cases
python3 ameliso.py search "reset" --tag auth --json  # combined filters
```

## Orientation (run once per session)

```sh
python3 ameliso.py report --json      # current pass/fail status per TC
python3 ameliso.py affected --json    # TCs that need re-running after recent changes
python3 ameliso.py validate           # confirm all files are schema-valid
```

Parse the JSON output. Do not infer status from file names or dates alone.

---

## Creating a test case

```sh
python3 ameliso.py new tc "Title of what is being tested"
```

This creates `test-cases/TC-NNN-<slug>.md` with the next available ID.

**Required:** fill in every field before committing:
- `description` — one sentence, what is being verified
- `priority` — `low`, `medium`, or `high`
- `## Steps` — numbered list of tester actions
- `## Expected Result` — what a passing execution looks like

Leave `created_at` and `updated_at` as set by `new.py`. Update `updated_at` on every subsequent edit (ISO date, e.g. `2026-04-21`).

---

## Creating a test run

```sh
python3 ameliso.py new run <tester> [environment]
```

This creates `test-runs/RUN-NNN-YYYY-MM-DD.md` with the next available ID.

**Required:** fill in the `## Results` table and `## Summary` counts before committing.

Result status values:

| Value     | When to use                                              |
|-----------|----------------------------------------------------------|
| `passed`  | All steps ran; outcome matched expected result           |
| `failed`  | Steps ran; outcome did not match expected result         |
| `blocked` | Could not run due to a dependency or environment issue   |
| `skipped` | Intentionally excluded from this run                     |

Set `status` in frontmatter to `completed` when done, `aborted` if the run was cut short.

---

## Validation

The pre-commit hook runs automatically. To validate manually:

```sh
python3 ameliso.py validate
```

Fix every error before committing. Common errors:
- `missing required field 'description'` — fill in the frontmatter field
- `missing required section '## Steps'` — add the section heading
- `Summary Total (N) != rows in Results table (M)` — recount and fix `## Summary`
- `filename ID 'TC-002' does not match frontmatter id 'TC-003'` — ID in filename must match `id:` field

---

## Decision rules for agents

### When to create a test case
- A feature or user-facing behaviour exists with no corresponding TC.
- Identify the gap with: `python3 ameliso.py report --json | jq '.test_cases[] | select(.status == "never")'`

### When to create a test run
- After manually executing (or simulating) one or more test cases.
- Always reference specific TC IDs in the Results table — never leave it empty.

### When NOT to create files
- Do not fabricate run results. A run file represents a real execution.
- Do not invent TC IDs. Use `python3 ameliso.py new tc` to get the next valid ID.

### After code changes
```sh
python3 ameliso.py affected --json
```
Any TC listed in the output should be re-run before the next release.

---

## Commit conventions

Reference TC IDs in commit messages when a commit is related to a specific test case:

```
fix: login redirect on mobile (TC-001)
```

`affected.py` scans commit messages for these references to build its impact list.

---

## ID rules

- IDs are monotonically increasing integers, zero-padded to 3 digits: `TC-001`, `TC-002`, …
- IDs are permanent — never reuse a retired ID, even after deletion.
- Always use `python3 ameliso.py new` to assign IDs. Never hand-pick a number.

---

## Output reference

### `report --json`

```json
{
  "test_cases": [
    {
      "id": "TC-001",
      "title": "User Login",
      "priority": "high",
      "status": "passed",      // passed | failed | blocked | skipped | never
      "last_run": "RUN-001",
      "last_run_date": "2026-04-21",
      "path": "test-cases/TC-001-user-login.md"
    }
  ],
  "run_count": 1
}
```

### `affected --json`

```json
{
  "affected": [
    {
      "id": "TC-001",
      "title": "User Login",
      "priority": "high",
      "found_in_repo": true
    }
  ],
  "reason": "3 source file(s) changed with no explicit TC references — all 1 test case(s) flagged"
}
```

Exit code 1 means action is required; exit code 0 means nothing to do.
