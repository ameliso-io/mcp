#!/usr/bin/env python3
"""Find test cases that may need re-running based on recent git changes.

Scans commit messages, PR bodies (from commit trailers), and changed file
paths for TC-NNN references. Falls back to "all test cases" when the changed
files match known test-relevant globs.

Usage:
    python3 affected.py                  # changes since last run commit
    python3 affected.py --since <ref>    # changes since a specific ref/commit
    python3 affected.py --json           # machine-readable output
    python3 affected.py --all            # list all test cases (ignore git)

Exit codes:
    0  no test cases flagged as affected
    1  one or more test cases are affected (need re-running)
"""

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).parent
TC_DIR = ROOT / "test-cases"

TC_REF_RE = re.compile(r"\bTC-\d+\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str]) -> str:
    try:
        return subprocess.check_output(cmd, cwd=ROOT, stderr=subprocess.DEVNULL, text=True)
    except subprocess.CalledProcessError:
        return ""


def _all_tc_ids() -> list[str]:
    if not TC_DIR.exists():
        return []
    ids = []
    for f in sorted(TC_DIR.glob("*.md")):
        m = re.match(r"(TC-\d+)", f.stem, re.IGNORECASE)
        if m:
            ids.append(m.group(1).upper())
    return ids


def _tc_metadata() -> dict[str, dict]:
    meta: dict[str, dict] = {}
    if not TC_DIR.exists():
        return meta
    for f in sorted(TC_DIR.glob("*.md")):
        text = f.read_text()
        fields: dict = {}
        if text.startswith("---"):
            try:
                end = text.index("\n---", 3)
                for line in text[4:end].splitlines():
                    if ":" in line:
                        k, _, v = line.partition(":")
                        fields[k.strip()] = v.strip()
            except ValueError:
                pass
        tc_id = fields.get("id", "").upper()
        if tc_id:
            meta[tc_id] = {
                "id": tc_id,
                "title": fields.get("title", f.stem),
                "priority": fields.get("priority", "medium"),
            }
    return meta


# ---------------------------------------------------------------------------
# Git scanning
# ---------------------------------------------------------------------------

def _last_run_commit() -> Optional[str]:
    """Return the hash of the most recent commit that touched test-runs/."""
    out = _run(["git", "log", "--oneline", "-1", "--", "test-runs/"])
    if out.strip():
        return out.split()[0]
    return None


def _refs_in_text(text: str) -> set[str]:
    return {m.upper() for m in TC_REF_RE.findall(text)}


def _changed_files_since(ref: str) -> list[str]:
    out = _run(["git", "diff", "--name-only", f"{ref}..HEAD"])
    return [l.strip() for l in out.splitlines() if l.strip()]


def _commits_since(ref: str) -> list[dict]:
    """Return list of {hash, subject, body} for commits since ref."""
    sep = "\x1f"
    fmt = f"%H{sep}%s{sep}%b{sep}%x00"
    out = _run(["git", "log", f"{ref}..HEAD", f"--format={fmt}"])
    commits = []
    for block in out.split("\x00"):
        block = block.strip()
        if not block:
            continue
        parts = block.split(sep, 2)
        if len(parts) == 3:
            commits.append({"hash": parts[0], "subject": parts[1], "body": parts[2]})
    return commits


def _is_test_relevant(path: str) -> bool:
    """True if a changed file path is likely to affect test outcomes."""
    irrelevant = {".md", ".txt", ".gitignore", ".json", ".yaml", ".yml"}
    suffix = Path(path).suffix.lower()
    if suffix in irrelevant:
        # But changes to test-cases/ themselves are relevant
        return path.startswith("test-cases/")
    return True


def find_affected(since: Optional[str]) -> tuple[set[str], str]:
    """Return (affected_tc_ids, reason_summary)."""
    if since is None:
        since = _last_run_commit()

    if since is None:
        # No runs yet — everything is potentially affected
        return set(_all_tc_ids()), "no test runs found; all test cases affected"

    affected: set[str] = set()
    reasons: list[str] = []

    commits = _commits_since(since)
    for c in commits:
        text = c["subject"] + " " + c["body"]
        refs = _refs_in_text(text)
        if refs:
            affected |= refs
            reasons.append(f"commit {c['hash'][:7]} references {', '.join(sorted(refs))}")

    changed = _changed_files_since(since)
    test_relevant = [p for p in changed if _is_test_relevant(p)]

    # Explicit TC references in file paths (e.g., test-cases/TC-002-*.md changed)
    for path in changed:
        refs = _refs_in_text(path)
        if refs:
            affected |= refs
            reasons.append(f"file {path} references {', '.join(sorted(refs))}")

    # If non-trivial source files changed and no explicit TC references found,
    # flag all test cases as potentially affected
    if test_relevant and not affected:
        all_ids = _all_tc_ids()
        affected = set(all_ids)
        reasons.append(
            f"{len(test_relevant)} source file(s) changed with no explicit TC references "
            f"— all {len(all_ids)} test case(s) flagged"
        )

    reason_str = "; ".join(reasons) if reasons else "no changes detected since last run"
    return affected, reason_str


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def print_report(affected: set[str], reason: str, meta: dict[str, dict]) -> None:
    print(f"\nAffected Test Cases\n")
    if not affected:
        print("  None — no test cases need re-running.\n")
        return
    print(f"  Reason: {reason}\n")
    known = sorted(affected & meta.keys())
    unknown = sorted(affected - meta.keys())
    for tc_id in known:
        m = meta[tc_id]
        print(f"  {tc_id:<10} [{m['priority']:<6}]  {m['title']}")
    for tc_id in unknown:
        print(f"  {tc_id:<10} [unknown]  (test case file not found)")
    print()


def main() -> int:
    args = sys.argv[1:]
    as_json = "--json" in args
    all_flag = "--all" in args

    since: Optional[str] = None
    if "--since" in args:
        idx = args.index("--since")
        if idx + 1 < len(args):
            since = args[idx + 1]

    meta = _tc_metadata()

    if all_flag:
        affected = set(_all_tc_ids())
        reason = "all test cases listed (--all flag)"
    else:
        affected, reason = find_affected(since)

    if as_json:
        rows = []
        for tc_id in sorted(affected):
            m = meta.get(tc_id, {})
            rows.append({
                "id": tc_id,
                "title": m.get("title", ""),
                "priority": m.get("priority", ""),
                "found_in_repo": tc_id in meta,
            })
        print(json.dumps({"affected": rows, "reason": reason}, indent=2))
        return 1 if affected else 0

    print_report(affected, reason, meta)
    return 1 if affected else 0


if __name__ == "__main__":
    sys.exit(main())
