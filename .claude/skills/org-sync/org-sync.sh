#!/usr/bin/env bash
# org-sync.sh
# Merges all open remote branches across ameliso-io org repos + current repo into
# each repo's default branch, then deletes successfully merged branches.
#
# Writes NDJSON to /tmp/org-sync-results.ndjson (one JSON object per operation).
# Progress logs go to stderr.
#
# Exit codes:
#   0  All repos processed, no conflicts
#   1  One or more branches had merge conflicts (skipped)
#   2  Fatal: gh not found, not authenticated, or no repos found
set -euo pipefail

RESULTS_FILE="/tmp/org-sync-results.ndjson"
> "$RESULTS_FILE"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}[org-sync]${NC} $*" >&2; }
ok()   { echo -e "${GREEN}[org-sync]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[org-sync]${NC} $*" >&2; }
err()  { echo -e "${RED}[org-sync]${NC} $*" >&2; }
emit() { echo "$1" | tee -a "$RESULTS_FILE" >/dev/null; }

# Check gh auth
if ! gh auth status &>/dev/null; then
    err "Not authenticated with gh. Run: gh auth login"
    exit 2
fi

ORG="ameliso-io"

# Detect current repo
CURRENT_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || echo "")
log "Current repo: ${CURRENT_REPO:-unknown}"

# List org repos
log "Listing repos in $ORG..."
ORG_REPOS=$(gh repo list "$ORG" --json nameWithOwner --limit 100 --jq '.[].nameWithOwner' 2>/dev/null || echo "")

# Build deduplicated repo list (current repo first if outside org)
REPO_LIST="$ORG_REPOS"
if [[ -n "$CURRENT_REPO" ]] && ! echo "$ORG_REPOS" | grep -qxF "$CURRENT_REPO"; then
    REPO_LIST="$CURRENT_REPO"$'\n'"$ORG_REPOS"
fi

if [[ -z "$(echo "$REPO_LIST" | tr -d '[:space:]')" ]]; then
    err "No repos found. Check gh auth and org name ($ORG)."
    exit 2
fi

REPO_COUNT=$(echo "$REPO_LIST" | grep -c '[^[:space:]]' || echo 0)
log "Processing $REPO_COUNT repos..."

WORKDIR=$(mktemp -d)
CONFLICT_FLAG="$WORKDIR/.has_conflicts"
trap 'rm -rf "$WORKDIR"' EXIT

process_repo() {
    local REPO="$1"
    local REPO_SLUG
    REPO_SLUG=$(echo "$REPO" | tr '/' '_')
    local CLONE_DIR="$WORKDIR/$REPO_SLUG"

    log "[$REPO] Getting default branch..."
    local DEFAULT_BRANCH
    DEFAULT_BRANCH=$(gh repo view "$REPO" --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || echo "main")

    log "[$REPO] Listing branches..."
    local BRANCHES
    BRANCHES=$(gh api "repos/$REPO/branches" --paginate --jq '.[].name' 2>/dev/null \
        | grep -v "^${DEFAULT_BRANCH}$" || echo "")

    if [[ -z "$(echo "$BRANCHES" | tr -d '[:space:]')" ]]; then
        log "[$REPO] No branches to process."
        emit "{\"repo\":\"$REPO\",\"action\":\"no_branches\"}"
        return 0
    fi

    local BRANCH_COUNT
    BRANCH_COUNT=$(echo "$BRANCHES" | grep -c '[^[:space:]]' || echo 0)
    log "[$REPO] Found $BRANCH_COUNT branch(es). Cloning..."

    if ! gh repo clone "$REPO" "$CLONE_DIR" -- \
        --quiet --no-tags --single-branch --branch "$DEFAULT_BRANCH" 2>/dev/null; then
        err "[$REPO] Clone failed."
        emit "{\"repo\":\"$REPO\",\"action\":\"clone_failed\"}"
        return 0
    fi

    pushd "$CLONE_DIR" > /dev/null

    while IFS= read -r BRANCH; do
        [[ -z "$BRANCH" ]] && continue

        log "[$REPO] Fetching $BRANCH..."
        if ! git fetch origin "$BRANCH" --no-tags --quiet 2>/dev/null; then
            warn "[$REPO/$BRANCH] Fetch failed, skipping."
            emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"fetch_failed\"}"
            continue
        fi

        # Check if already merged into default
        if git merge-base --is-ancestor FETCH_HEAD HEAD 2>/dev/null; then
            warn "[$REPO/$BRANCH] Already merged. Deleting remote branch..."
            if gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH" 2>/dev/null; then
                ok "[$REPO/$BRANCH] Deleted (was already merged)."
                emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"deleted_already_merged\"}"
            else
                emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"delete_failed\",\"note\":\"already_merged\"}"
            fi
            continue
        fi

        # Attempt merge
        log "[$REPO/$BRANCH] Merging..."
        set +e
        git merge FETCH_HEAD --no-edit --no-ff --quiet 2>/dev/null
        MERGE_EXIT=$?
        set -e

        local CONFLICTS
        CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null || true)

        if [[ $MERGE_EXIT -ne 0 ]] || [[ -n "$CONFLICTS" ]]; then
            git merge --abort 2>/dev/null || git reset --hard HEAD 2>/dev/null || true
            local CF_JSON
            CF_JSON=$(echo "$CONFLICTS" | jq -R -s 'split("\n") | map(select(length>0))' 2>/dev/null || echo "[]")
            warn "[$REPO/$BRANCH] Conflict — skipping."
            emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"conflict\",\"files\":$CF_JSON}"
            touch "$CONFLICT_FLAG"
            continue
        fi

        # Push merged default branch
        if git push origin "$DEFAULT_BRANCH" --quiet 2>/dev/null; then
            emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"merged\"}"
            # Delete the remote branch
            if gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH" 2>/dev/null; then
                ok "[$REPO/$BRANCH] Merged + deleted."
                emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"deleted\"}"
            else
                warn "[$REPO/$BRANCH] Merged but remote branch deletion failed."
                emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"delete_failed\"}"
            fi
        else
            # Push rejected — likely branch protection; undo local merge
            git reset --hard "origin/$DEFAULT_BRANCH" 2>/dev/null || true
            warn "[$REPO/$BRANCH] Push failed (branch protection rules?)."
            emit "{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\",\"action\":\"push_failed\"}"
        fi
    done <<< "$BRANCHES"

    popd > /dev/null
}

while IFS= read -r REPO; do
    [[ -z "$REPO" ]] && continue
    process_repo "$REPO"
done <<< "$REPO_LIST"

log "Done. Results written to $RESULTS_FILE"

[[ -f "$CONFLICT_FLAG" ]] && exit 1
exit 0
