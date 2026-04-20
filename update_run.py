#!/usr/bin/env python3
"""Add or update a test result in an in-progress run file.

Edits the Results table and recalculates the Summary counts atomically.

Usage:
    python3 update_run.py <run-id> <tc-id> <status> [notes]
    python3 update_run.py RUN-001 TC-002 failed "Button not visible on mobile"
    python3 update_run.py RUN-001 TC-003 passed

Status values: passed | failed | blocked | skipped

Exit codes:
    0  success
    1  error (run not found, invalid status, run already completed/aborted)
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
RUN_DIR = ROOT / "test-runs"

VALID_STATUSES = {"passed", "failed", "blocked", "skipped"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_run(run_id: str) -> Path:
    run_id = run_id.upper()
    if not RUN_DIR.exists():
        raise FileNotFoundError(f"test-runs/ directory not found")
    for f in RUN_DIR.glob("*.md"):
        if f.stem.upper().startswith(run_id):
            return f
    raise FileNotFoundError(f"No run file found for {run_id}")


def _parse_frontmatter_bounds(text: str) -> tuple[int, int]:
    """Return (start_of_fm_content, end_of_fm_content) line indices."""
    if not text.startswith("---"):
        raise ValueError("File missing frontmatter")
    end = text.index("\n---", 3)
    return 4, end


def _get_fm_field(text: str, key: str) -> str:
    _, end = _parse_frontmatter_bounds(text)
    fm = text[4:end]
    for line in fm.splitlines():
        if line.startswith(f"{key}:"):
            return line.partition(":")[2].strip()
    return ""


def _set_fm_field(text: str, key: str, value: str) -> str:
    _, end = _parse_frontmatter_bounds(text)
    fm = text[4:end]
    lines = fm.splitlines()
    new_lines = []
    found = False
    for line in lines:
        if line.startswith(f"{key}:"):
            new_lines.append(f"{key}: {value}")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f"{key}: {value}")
    new_fm = "\n".join(new_lines)
    return text[:4] + new_fm + text[end:]


def _rebuild_results_section(text: str, results: dict[str, tuple[str, str]]) -> str:
    """Replace the Results table with updated rows; recalculate Summary."""
    # Build new Results table
    rows = ["| Test Case | Status | Notes |", "|-----------|--------|-------|"]
    for tc_id in sorted(results):
        status, notes = results[tc_id]
        rows.append(f"| {tc_id} | {status} | {notes} |")
    new_table = "\n".join(rows)

    # Recalculate Summary
    counts = {"passed": 0, "failed": 0, "blocked": 0, "skipped": 0}
    for tc_id, (status, _) in results.items():
        if status in counts:
            counts[status] += 1
    total = len(results)
    new_summary = (
        f"- Total: {total}\n"
        f"- Passed: {counts['passed']}\n"
        f"- Failed: {counts['failed']}\n"
        f"- Blocked: {counts['blocked']}"
    )

    # Replace Results section (preserve trailing newline before next section)
    text = re.sub(
        r"(## Results\n).*?(\n(?=##)|\Z)",
        lambda m: f"## Results\n{new_table}\n",
        text,
        flags=re.DOTALL,
    )
    # Replace Summary bullet counts (skip blank lines before first bullet)
    text = re.sub(
        r"(## Summary\n\n?)(- Total:.*?)(\n(?=##)|\Z)",
        lambda m: f"## Summary\n\n{new_summary}\n",
        text,
        flags=re.DOTALL,
    )
    return text


def _parse_results_table(text: str) -> dict[str, tuple[str, str]]:
    """Return {TC_ID: (status, notes)} from the Results table."""
    results: dict[str, tuple[str, str]] = {}
    m = re.search(r"## Results\n(.*?)(?=\n##|\Z)", text, re.DOTALL)
    if not m:
        return results
    for line in m.group(1).splitlines():
        if not line.startswith("|") or re.search(r"-{3,}", line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and re.match(r"TC-\d+", cells[0], re.I):
            tc_id = cells[0].upper()
            status = cells[1].lower()
            notes = cells[2] if len(cells) > 2 else ""
            results[tc_id] = (status, notes)
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = sys.argv[1:]
    if len(args) < 3:
        print("Usage: python3 update_run.py <run-id> <tc-id> <status> [notes]")
        print("Example: python3 update_run.py RUN-001 TC-002 failed \"Button missing\"")
        return 1

    run_id = args[0].upper()
    tc_id = args[1].upper()
    status = args[2].lower()
    notes = args[3] if len(args) > 3 else ""

    if status not in VALID_STATUSES:
        print(f"Invalid status {status!r}. Must be one of: {', '.join(sorted(VALID_STATUSES))}")
        return 1

    try:
        run_path = _find_run(run_id)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return 1

    text = run_path.read_text()
    run_status = _get_fm_field(text, "status")

    if run_status in ("completed", "aborted"):
        print(f"Error: run {run_id} is already '{run_status}'. Cannot add results to a closed run.")
        return 1

    results = _parse_results_table(text)
    results[tc_id] = (status, notes)
    text = _rebuild_results_section(text, results)
    run_path.write_text(text)

    total = len(results)
    print(f"{run_path.name}: recorded {tc_id} = {status} ({total} result(s) total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
