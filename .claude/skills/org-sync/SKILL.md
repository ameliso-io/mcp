---
description: Merge all open branches across ameliso-io org repos + current repo into each repo's default branch, delete merged branches, render mermaid summary.
allowed-tools: Bash(gh *), Bash(git *), Bash(bash *), Bash(jq *), Bash(chmod *), Bash(mktemp), Bash(grep *), Bash(echo *), Bash(cat *), Read
---

```mermaid
flowchart TD
    START(["/org-sync invoked"]) --> S1

    S1["Step 1 — Run the script
    bash .claude/skills/org-sync/org-sync.sh
    Results → /tmp/org-sync-results.ndjson
    Progress logs → stderr
    Capture both; note EXIT code"]

    S1 --> EXIT{Exit code?}

    EXIT -- 2 --> FATAL["FATAL — stop here
    gh not authenticated or no repos found
    Tell user: gh auth login
    Then: gh repo list ameliso-io to verify access"]

    EXIT -- 0 --> PARSE
    EXIT -- 1 --> CONFLICTS_NOTE["Note: some branches had conflicts
    They were aborted + skipped
    Continue to PARSE — still render diagram"]
    CONFLICTS_NOTE --> PARSE

    PARSE["Step 2 — Parse results
    jq -s '.' /tmp/org-sync-results.ndjson
    Group records by repo
    Count each action type across all repos"]

    PARSE --> DIAGRAM

    DIAGRAM["Step 3 — Render mermaid diagram
    One subgraph per repo (skip repos with action=no_branches)
    Node IDs: r{i}b{j} for branch, r{i}m for main, r{i}s for skip
    Labels on edges show outcome icon + text

    Edge labels by action:
    • merged + deleted        →  ✓ merged + deleted
    • deleted_already_merged  →  ✓ cleaned up
    • conflict                →  ⚠ conflict — skipped
    • push_failed             →  ✗ push failed
    • delete_failed           →  ✓ merged  ✗ delete failed
    • fetch_failed            →  ✗ fetch failed

    Example shape:
    flowchart LR
      subgraph r1[\"ameliso-io/frontend\"]
        r1b1[feature-x] -->|✓ merged + deleted| r1m([main])
        r1b2[fix-y]     -->|⚠ conflict — skipped| r1s([SKIPPED])
      end
      subgraph r2[\"tupe12334/ameliso\"]
        r2b1[my-branch] -->|✓ merged + deleted| r2m([main])
      end"]

    DIAGRAM --> CONFLICT_LIST{Any conflicts?}

    CONFLICT_LIST -- yes --> SHOW_CONFLICTS["List conflict details
    For each conflict record:
      Repo + branch name
      files[] array from JSON
    Advice: open a PR manually and resolve there"]
    SHOW_CONFLICTS --> SUMMARY

    CONFLICT_LIST -- no --> SUMMARY

    SUMMARY["Step 4 — Print summary table
    | Metric                        | Count |
    |-------------------------------|-------|
    | Repos processed               | N     |
    | Branches merged               | N     |
    | Remote branches deleted       | N     |
    | Already-merged branches cleaned| N    |
    | Conflicts skipped             | N     |
    | Push failures                 | N     |"]

    SUMMARY --> DONE([done])
```

## Running the script

```bash
SKILL_DIR="$(git rev-parse --show-toplevel)/.claude/skills/org-sync"
bash "$SKILL_DIR/org-sync.sh"
echo "EXIT:$?"
```

Then read results:

```bash
jq -s '.' /tmp/org-sync-results.ndjson
```
