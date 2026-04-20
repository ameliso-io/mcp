#!/usr/bin/env python3
"""Report test case coverage from the most recent run of each test case.

Usage:
    python3 report.py            # full report
    python3 report.py --json     # machine-readable JSON
    python3 report.py --summary  # counts only

Exit codes:
    0  all test cases passed in their latest run
    1  one or more test cases failed, blocked, or were never run
"""

import json
import re
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).parent
TC_DIR = ROOT / "test-cases"
RUN_DIR = ROOT / "test-runs"


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def _parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    try:
        end = text.index("\n---", 3)
    except ValueError:
        return {}, text
    fm_block = text[4:end]
    body = text[end + 4:].lstrip("\n")
    fields: dict = {}
    for line in fm_block.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, raw = line.partition(":")
        key = key.strip()
        raw = raw.strip()
        if raw.startswith("[") and raw.endswith("]"):
            inner = raw[1:-1]
            fields[key] = [v.strip() for v in inner.split(",") if v.strip()]
        else:
            fields[key] = raw
    return fields, body


def _load_test_cases() -> dict[str, dict]:
    """Return {tc_id: {id, title, priority, path}}."""
    cases: dict[str, dict] = {}
    if not TC_DIR.exists():
        return cases
    for f in sorted(TC_DIR.glob("*.md")):
        fields, _ = _parse_frontmatter(f.read_text())
        tc_id = fields.get("id", "")
        if tc_id:
            cases[tc_id] = {
                "id": tc_id,
                "title": fields.get("title", f.stem),
                "priority": fields.get("priority", "medium"),
                "path": str(f.relative_to(ROOT)),
            }
    return cases


def _parse_run_results(body: str) -> dict[str, str]:
    """Return {tc_id: status} from a run's Results table."""
    results: dict[str, str] = {}
    m = re.search(r"## Results\n(.*?)(?:\n##|\Z)", body, re.DOTALL)
    if not m:
        return results
    for line in m.group(1).splitlines():
        if not line.startswith("|") or re.search(r"-{3,}", line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and cells[0].upper().startswith("TC-"):
            tc_id = cells[0].upper()
            status = cells[1].lower()
            results[tc_id] = status
    return results


def _load_runs() -> list[dict]:
    """Return runs sorted newest-first, each with {id, date, tester, status, results}."""
    runs = []
    if not RUN_DIR.exists():
        return runs
    for f in sorted(RUN_DIR.glob("*.md"), reverse=True):
        fields, body = _parse_frontmatter(f.read_text())
        run_id = fields.get("id", "")
        if not run_id:
            continue
        runs.append({
            "id": run_id,
            "date": fields.get("date", ""),
            "tester": fields.get("tester", ""),
            "status": fields.get("status", ""),
            "results": _parse_run_results(body),
        })
    return runs


# ---------------------------------------------------------------------------
# Coverage calculation
# ---------------------------------------------------------------------------

STATUS_RANK = {"passed": 0, "failed": 1, "blocked": 2, "skipped": 3, "never": 4}


def build_coverage(cases: dict[str, dict], runs: list[dict]) -> list[dict]:
    """For each test case return its latest result across all runs."""
    latest: dict[str, tuple[str, str, str]] = {}  # tc_id -> (status, run_id, date)

    for run in runs:  # newest first
        for tc_id, status in run["results"].items():
            if tc_id not in latest:
                latest[tc_id] = (status, run["id"], run["date"])

    rows = []
    for tc_id, case in cases.items():
        if tc_id in latest:
            status, run_id, run_date = latest[tc_id]
        else:
            status, run_id, run_date = "never", "", ""
        rows.append({
            "id": tc_id,
            "title": case["title"],
            "priority": case["priority"],
            "status": status,
            "last_run": run_id,
            "last_run_date": run_date,
            "path": case["path"],
        })

    rows.sort(key=lambda r: (STATUS_RANK.get(r["status"], 99), r["id"]))
    return rows


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

STATUS_SYMBOL = {
    "passed": "✓",
    "failed": "✗",
    "blocked": "!",
    "skipped": "-",
    "never": "?",
}

STATUS_LABEL = {
    "passed": "passed",
    "failed": "FAILED",
    "blocked": "blocked",
    "skipped": "skipped",
    "never": "never run",
}


def print_report(rows: list[dict], runs: list[dict]) -> None:
    total = len(rows)
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    print(f"\nAmeliso Coverage Report  ({total} test case(s), {len(runs)} run(s))\n")
    print(f"  {'ID':<10} {'Pri':<7} {'Status':<12} {'Last Run':<12} {'Title'}")
    print(f"  {'-'*9} {'-'*6} {'-'*11} {'-'*11} {'-'*30}")

    for r in rows:
        sym = STATUS_SYMBOL.get(r["status"], "?")
        label = STATUS_LABEL.get(r["status"], r["status"])
        print(
            f"  {r['id']:<10} {r['priority']:<7} {sym} {label:<10} "
            f"{r['last_run_date'] or '':<12} {r['title']}"
        )

    print()
    for status in ["passed", "failed", "blocked", "skipped", "never"]:
        n = counts.get(status, 0)
        if n:
            print(f"  {STATUS_SYMBOL[status]} {STATUS_LABEL[status]}: {n}")
    print()


def print_summary(rows: list[dict]) -> None:
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    total = len(rows)
    print(f"Total: {total}")
    for s in ["passed", "failed", "blocked", "skipped", "never"]:
        n = counts.get(s, 0)
        if n:
            print(f"{STATUS_LABEL[s]}: {n}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = sys.argv[1:]
    as_json = "--json" in args
    summary_only = "--summary" in args

    cases = _load_test_cases()
    runs = _load_runs()
    rows = build_coverage(cases, runs)

    if as_json:
        print(json.dumps({"test_cases": rows, "run_count": len(runs)}, indent=2))
        return 0

    if summary_only:
        print_summary(rows)
    else:
        print_report(rows, runs)

    bad = {"failed", "blocked", "never"}
    return 1 if any(r["status"] in bad for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
