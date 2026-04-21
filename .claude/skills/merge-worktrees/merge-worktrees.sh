#!/usr/bin/env bash
# Merges all git worktree branches into the current branch (main).
# Handles one branch per run; re-run after resolving conflicts or hook failures.
#
# Exit codes:
#   0  All branches merged and pushed
#   1  Conflicts found — resolve, git add, re-run
#   2  Pre-commit hook failed — fix issues, git add, re-run
#   3  Push failed — fix issues, then: git push
#   4  Unexpected merge failure — investigate with: git status
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

CURRENT_BRANCH=$(git branch --show-current)

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log() { echo -e "${BLUE}[merge-worktrees]${NC} $*"; }
ok()  { echo -e "${GREEN}[merge-worktrees]${NC} $*"; }
err() { echo -e "${RED}[merge-worktrees]${NC} $*" >&2; }

# ── Resume mid-merge (conflicts were resolved or hook was fixed) ───────────────
if [[ -f "$REPO_ROOT/.git/MERGE_HEAD" ]]; then
    MERGE_MSG=$(head -1 "$REPO_ROOT/.git/MERGE_MSG" 2>/dev/null || echo "")
    MERGING=$(echo "$MERGE_MSG" | grep -oP "(?<=Merge branch ').*(?=')" 2>/dev/null || echo "unknown")
    log "Mid-merge state detected (branch: '$MERGING')"

    CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
    if [[ -n "$CONFLICTS" ]]; then
        err "Unresolved conflicts remain:"
        echo "$CONFLICTS" | sed 's/^/  /'
        err "Resolve each file, then: git add <file>"
        err "Then run this script again."
        exit 1
    fi

    log "All conflicts resolved. Committing..."
    if git commit --no-edit; then
        ok "Committed merge of '$MERGING'."
    else
        err "Pre-commit hook failed for '$MERGING'."
        err "Fix reported issues, stage fixes, then run this script again."
        exit 2
    fi
fi

# ── Discover worktree branches not yet merged into HEAD ───────────────────────
BRANCHES=()
while IFS= read -r branch; do
    [[ -z "$branch" || "$branch" == "$CURRENT_BRANCH" ]] && continue
    if git merge-base --is-ancestor "$branch" HEAD 2>/dev/null; then
        log "Branch '$branch': already merged, skipping."
        continue
    fi
    BRANCHES+=("$branch")
done < <(git worktree list --porcelain | grep "^branch " | sed 's|^branch refs/heads/||')

if [[ ${#BRANCHES[@]} -eq 0 ]]; then
    ok "All branches merged."
    log "Pushing..."
    if git push; then
        ok "Push complete."
    else
        err "Push failed. Fix the issue, then run: git push"
        exit 3
    fi
    exit 0
fi

# ── Merge each unmerged branch ────────────────────────────────────────────────
for branch in "${BRANCHES[@]}"; do
    log "Merging '$branch' (${#BRANCHES[@]} remaining)..."

    set +e
    git merge "$branch" --no-commit --no-ff
    MERGE_EXIT=$?
    set -e

    CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null || true)

    if [[ $MERGE_EXIT -ne 0 ]]; then
        if [[ -n "$CONFLICTS" ]]; then
            err "CONFLICTS merging '$branch':"
            echo "$CONFLICTS" | sed 's/^/  /'
            err ""
            err "Resolve each file, then: git add <file>"
            err "Then run this script again."
            exit 1
        else
            err "Merge of '$branch' failed unexpectedly (no conflict markers)."
            err "Run: git status — investigate and resolve manually."
            exit 4
        fi
    fi

    # Defensive: check even on clean exit (e.g. rerere edge cases)
    if [[ -n "$CONFLICTS" ]]; then
        err "Conflicts detected after clean-exit merge of '$branch':"
        echo "$CONFLICTS" | sed 's/^/  /'
        err "Resolve, git add, then run this script again."
        exit 1
    fi

    log "Clean merge of '$branch'. Committing..."
    if git commit --no-edit; then
        ok "✓ '$branch' merged."
    else
        err "Pre-commit hook failed for '$branch'."
        err "Fix reported issues, stage fixes, then run this script again."
        exit 2
    fi
done

# ── All merged — push ─────────────────────────────────────────────────────────
log "Pushing..."
if git push; then
    ok "All branches merged and pushed."
else
    err "Push failed. Fix the issue, then run: git push"
    exit 3
fi
