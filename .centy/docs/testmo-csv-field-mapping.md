---
# This file is managed by Centy. Use the Centy CLI to modify it.
createdAt: 2026-04-23T00:00:00.000000+00:00
updatedAt: 2026-04-23T00:00:00.000000+00:00
tags:
- import
- testmo
- migration
---

# Testmo CSV Field Mapping

Reference for Testmo export → Ameliso field mapping (from `testmo-export-repository-5.csv`).

## Supported Fields

| CSV Header | Ameliso Field | Notes |
|---|---|---|
| `Case` | `title` | Direct map |
| `Folder` | `path` | Use as path hierarchy |
| `Description` (1st) | `description` | Max 1000 chars |
| `Steps (Step)` | `body` | Markdown; combine with Expected |
| `Steps (Expected)` | `body` | Append to Steps (Step) |
| `Tags` | `tags` | Comma-separated |
| `Priority` | `priority` | Low / Medium / High |
| `Case ID` | `path` | Alternative to Folder-based path |

## Unsupported Fields (drop on import)

| CSV Header | Reason |
|---|---|
| `Status (latest)` | Ameliso tracks run results, not case status |
| `State` | No equivalent |
| `Template` | No equivalent |
| `Test type` | No equivalent |
| `Configurations` | No equivalent |
| `Forecast` | No equivalent |
| `Need to automate` | No equivalent |
| `Estimate` | No equivalent |
| `Issues` | No equivalent |
| `Created at` | Not imported |
| `Created by` | Not imported |
| `Updated at` | Not imported |
| `Updated by` | Not imported |
| `Status date` | No equivalent |
| `Description` (2nd duplicate) | Skip — duplicate column |

## Ameliso Field Constraints

| Field | Required | Max Length | Notes |
|---|---|---|---|
| `path` | YES | 200 chars | Pattern: `[a-z0-9_-]+(/[a-z0-9_-]+)*` |
| `title` | YES | 255 chars | |
| `description` | NO | 1000 chars | |
| `tags` | NO | — | Cleaned via `clean_tags()` |
| `priority` | NO | — | Defaults to `medium` if missing |
| `body` | NO | 100,000 chars | Markdown |

## Summary

7 of 24 CSV columns map to Ameliso fields. Import tracked in issue #21.
