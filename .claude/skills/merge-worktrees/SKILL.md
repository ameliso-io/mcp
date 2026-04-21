---
description: Merge all open git worktree branches into the current main branch, resolving conflicts intelligently
allowed-tools: Bash(git *), Read, Edit, Write, Grep, Glob
---

Merge every open git worktree branch into main. Work through them one at a time, fully completing each merge (including conflict resolution) before moving to the next.

## Step 1 — Discover branches to merge

```bash
git worktree list
git branch -vv
```

Collect all worktree branches that are NOT the current branch (main). Skip any branch that is already fully merged (`git merge-base --is-ancestor <branch> HEAD` exits 0).

## Step 2 — For each branch (in order)

### 2a. Attempt the merge

```bash
git merge <branch> --no-commit --no-ff
```

If it exits 0 with no conflicts, go to step 2d.

### 2b. Identify conflicts

```bash
git diff --name-only --diff-filter=U
```

Read every conflicted file.

### 2c. Resolve each conflict

Apply these rules in priority order:

**Formatting conflicts** (quote style, semicolons, trailing commas, whitespace):
- Keep the main branch's format. This project uses Prettier with double quotes. Discard single-quote/no-semicolon style from incoming branches.

**API / prop name conflicts** (e.g. `repoPath` vs `repoId`, `localPath` vs `repoId`):
- Keep main's names. Main has gone through more merges and has the canonical API.

**Import conflicts** (direct import vs `dynamic()`, missing imports):
- If both sides import the same symbol differently, prefer the more capable version (e.g. `dynamic(() => import(...), { ssr: false })` over a direct `import`).
- Keep `useTransition`, `useDeferredValue`, and other concurrent React hooks from the incoming branch if main doesn't have them — they are additive and non-breaking.
- Never leave duplicate symbol declarations (e.g. both `import X` and `const X = dynamic(...)`).

**New features / hooks** (e.g. `useDeferredValue`, `useTransition`, `startTransition`):
- Incorporate from the incoming branch. Keep main's prop names and inline-style approach where the incoming branch used CSS modules that don't exist yet — use main's JSX but wire up the new hook logic.

**Modify/delete conflicts** (`deleted in HEAD and modified in branch`):
- If main deleted the file intentionally (e.g. a renamed hook), keep the deletion: `git rm -f <file>`.
- If main added the file and the branch deleted it, keep main's version: `git checkout HEAD -- <file>`.

**New files from the incoming branch** (test files, CSS modules, config):
- Always accept them. Stage with `git add`.

**Title/metadata conflicts in Next.js pages** (e.g. `"Cases | Ameliso"` vs `"Cases"`):
- Use the short title if a layout template (`template: '%s | Ameliso'`) exists in `layout.tsx`. Otherwise use the full title.

After resolving each file, `git add` it immediately.

### 2d. Commit the merge

```bash
git commit --no-edit
```

The pre-commit hook runs formatting and linting. If it fails:
- Read the error output.
- Fix the reported issue (usually a leftover conflict marker, a duplicate import, or a type error).
- `git add` the fixed files and retry `git commit --no-edit`.

Do NOT use `--no-verify`.

### 2e. Verify

```bash
git log --oneline -3
git diff --name-only --diff-filter=U
```

Confirm zero unresolved conflicts before moving to the next branch.

## Step 3 — Push

After all branches are merged:

```bash
git push
```

The pre-push hook runs build + tests. If it fails, fix the issue and push again. Do NOT use `--no-verify`.

## Step 4 — Report

List every branch that was merged, any conflicts that were resolved, and confirm the push succeeded.
