---
description: Merge all open git worktree branches into the current main branch, resolving conflicts intelligently
allowed-tools: Bash(git *), Bash(bash *), Read, Edit, Write, Grep, Glob
---

Merge every open git worktree branch into main using the automation script.
The script handles all git mechanics; you handle conflict resolution and hook failures.

## Step 1 — Run the script

```bash
bash "$(git rev-parse --show-toplevel)/.claude/skills/merge-worktrees/merge-worktrees.sh"
```

Interpret the exit code:

| Code | Meaning | Your action |
|------|---------|-------------|
| 0 | Done — all merged + pushed | Report success (Step 4) |
| 1 | Conflicts found | Resolve conflicts (Step 2), then re-run |
| 2 | Pre-commit hook failed | Fix issues (Step 3), then re-run |
| 3 | Push failed | Fix issues, then `git push` |
| 4 | Unexpected failure | Investigate `git status` |

## Step 2 — Resolve conflicts (exit code 1)

The script prints the conflicted files. Read each one. Apply these rules in priority order:

**Formatting conflicts** (quote style, semicolons, trailing commas, whitespace):
- Keep main's format. This project uses Prettier with double quotes. Discard single-quote/no-semicolon style.

**API / prop name conflicts** (e.g. `repoPath` vs `repoId`):
- Keep main's names. Main has the canonical API after going through more merges.

**Import conflicts** (direct import vs `dynamic()`, missing imports):
- Prefer the more capable version (e.g. `dynamic(() => import(...), { ssr: false })` over a direct `import`).
- Keep `useTransition`, `useDeferredValue`, and other concurrent React hooks if main lacks them — additive, non-breaking.
- Never leave duplicate symbol declarations.

**New features / hooks** (`useDeferredValue`, `useTransition`, `startTransition`):
- Incorporate from incoming. Keep main's prop names and inline styles where the incoming branch used CSS modules that don't exist yet.

**Modify/delete conflicts** (`deleted in HEAD, modified in branch`):
- Main deleted intentionally (e.g. renamed hook) → keep deletion: `git rm -f <file>`.
- Main added the file and branch deleted it → keep main's version: `git checkout HEAD -- <file>`.

**New files from incoming branch** (tests, CSS modules, config):
- Always accept: `git add <file>`.

**Title/metadata in Next.js pages** (`"Cases | Ameliso"` vs `"Cases"`):
- Use short title if `layout.tsx` has `template: '%s | Ameliso'`. Otherwise use full title.

After resolving each file: `git add <file>` immediately, then re-run the script.

## Step 3 — Fix hook failures (exit code 2)

The pre-commit hook runs: `cargo fmt`, Prettier, ESLint, cspell, `cargo clippy`.
Read the hook error output. Common causes:
- Leftover conflict markers (`<<<<<<<`) — search and remove.
- Duplicate import (both `import X` and `const X = dynamic(...)`).
- TypeScript error from `noUncheckedIndexedAccess` — add `!` non-null assertion.
- Missing import — add it.

Fix, `git add` the fixed files, then re-run the script.

## Step 4 — Report

List every branch merged, any conflicts resolved, and confirm push succeeded.
