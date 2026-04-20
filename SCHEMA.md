# Ameliso File Schema

Ameliso stores test cases and test runs as Markdown files with YAML frontmatter.
All files live in `test-cases/` and `test-runs/` at the repo root.

---

## Test Case

**File:** `test-cases/TC-<number>-<slug>.md`

**Example:** `test-cases/TC-001-user-login.md`

```markdown
---
id: TC-001
title: User Login
description: Verify user can log in with valid credentials
tags: [auth, login]
priority: high
created_at: 2024-01-01
updated_at: 2024-01-01
---

## Steps

1. Navigate to the login page.
2. Enter a valid username and password.
3. Click the **Login** button.

## Expected Result

User is redirected to the dashboard and their profile is visible.

## Prerequisites

- A valid user account exists in the system.
```

### Frontmatter fields

| Field        | Type              | Required | Description                                    |
|--------------|-------------------|----------|------------------------------------------------|
| `id`         | string `TC-NNN`   | yes      | Unique identifier. Never reuse a retired id.   |
| `title`      | string            | yes      | Short human-readable name.                     |
| `description`| string            | yes      | One-sentence summary of what is being tested.  |
| `tags`       | string[]          | no       | Free-form labels for filtering.                |
| `priority`   | `low\|medium\|high` | yes    | Testing urgency.                               |
| `created_at` | ISO date          | yes      | Creation date.                                 |
| `updated_at` | ISO date          | yes      | Last modification date.                        |

### Body sections

| Section            | Required | Description                                     |
|--------------------|----------|-------------------------------------------------|
| `## Steps`         | yes      | Ordered list of actions the tester performs.    |
| `## Expected Result` | yes   | What a passing run looks like.                  |
| `## Prerequisites` | no       | Conditions that must be true before starting.   |
| `## Notes`         | no       | Anything else relevant to the test case.        |

---

## Test Run

**File:** `test-runs/RUN-<number>-<YYYY-MM-DD>.md`

**Example:** `test-runs/RUN-001-2024-01-15.md`

```markdown
---
id: RUN-001
date: 2024-01-15
tester: john.doe
status: completed
environment: staging
---

## Results

| Test Case | Status  | Notes                               |
|-----------|---------|-------------------------------------|
| TC-001    | passed  |                                     |
| TC-002    | failed  | Login button missing on mobile view |
| TC-003    | blocked | Depends on TC-002                   |

## Summary

- Total: 3
- Passed: 1
- Failed: 1
- Blocked: 1

## Notes

Any free-form observations about the run as a whole.
```

### Frontmatter fields

| Field         | Type                                      | Required | Description                                |
|---------------|-------------------------------------------|----------|--------------------------------------------|
| `id`          | string `RUN-NNN`                          | yes      | Unique identifier. Never reuse.            |
| `date`        | ISO date                                  | yes      | Date the run was executed.                 |
| `tester`      | string                                    | yes      | Username or identifier of the tester.      |
| `status`      | `in-progress\|completed\|aborted`        | yes      | Overall run status.                        |
| `environment` | string                                    | no       | Target environment (e.g. staging, prod).   |

### Body sections

| Section      | Required | Description                                                               |
|--------------|----------|---------------------------------------------------------------------------|
| `## Results` | yes      | Markdown table with columns: Test Case, Status, Notes.                    |
| `## Summary` | yes      | Bullet counts: Total, Passed, Failed, Blocked.                            |
| `## Notes`   | no       | Free-form observations about the run as a whole.                          |

### Result status values

| Value     | Meaning                                                     |
|-----------|-------------------------------------------------------------|
| `passed`  | All steps executed; outcome matched expected result.        |
| `failed`  | Steps executed; outcome did not match expected result.      |
| `blocked` | Could not execute due to a blocking dependency or blocker.  |
| `skipped` | Intentionally not run in this run.                          |

---

## ID Conventions

- IDs are **monotonically increasing integers** padded to 3 digits: `001`, `002`, …
- IDs are assigned at creation time and **never reused**, even after deletion.
- To find the next available ID, scan existing files in the relevant directory for the highest number.

---

## Agent Instructions

When creating or updating test cases or test runs:

1. Read `SCHEMA.md` (this file) before writing any file.
2. Assign the next available ID by scanning existing files.
3. Set `updated_at` on every modification to a test case.
4. Never rename an existing file's ID prefix — create a new file if the test case fundamentally changes.
5. Keep `## Summary` totals consistent with the `## Results` table in test runs.
