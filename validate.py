#!/usr/bin/env python3
"""Validate test-cases/ and test-runs/ against the Ameliso schema (SCHEMA.md).

Usage:
    python3 validate.py          # validate all files
    python3 validate.py <paths>  # validate specific files
"""

import re
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).parent
ERRORS: list[str] = []


# ---------------------------------------------------------------------------
# Frontmatter parser (pure stdlib — no PyYAML dependency)
# ---------------------------------------------------------------------------

def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return (fields, body). Raises ValueError on malformed frontmatter."""
    if not text.startswith("---"):
        raise ValueError("File must start with '---' frontmatter delimiter")
    end = text.index("\n---", 3)
    fm_block = text[4:end]
    body = text[end + 4:].lstrip("\n")

    fields: dict = {}
    for line in fm_block.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"Invalid frontmatter line: {line!r}")
        key, _, raw = line.partition(":")
        key = key.strip()
        raw = raw.strip()
        # list value: [a, b, c]
        if raw.startswith("[") and raw.endswith("]"):
            inner = raw[1:-1]
            fields[key] = [v.strip() for v in inner.split(",") if v.strip()]
        else:
            fields[key] = raw
    return fields, body


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TC_ID_RE = re.compile(r"^TC-\d+$")
RUN_ID_RE = re.compile(r"^RUN-\d+$")


def _err(path: Path, msg: str) -> None:
    ERRORS.append(f"{path}: {msg}")


def _require(path: Path, fields: dict, key: str, pattern: Optional[re.Pattern] = None,
             choices: Optional[list] = None) -> Optional[str]:
    val = fields.get(key)
    if not val:
        _err(path, f"missing required field '{key}'")
        return None
    if pattern and not pattern.match(str(val)):
        _err(path, f"field '{key}' value {val!r} does not match {pattern.pattern}")
    if choices and val not in choices:
        _err(path, f"field '{key}' must be one of {choices}, got {val!r}")
    return val


def _require_section(path: Path, body: str, heading: str) -> None:
    if f"## {heading}" not in body:
        _err(path, f"missing required section '## {heading}'")


def validate_test_case(path: Path) -> None:
    try:
        fields, body = _parse_frontmatter(path.read_text())
    except ValueError as exc:
        _err(path, str(exc))
        return

    _require(path, fields, "id", pattern=TC_ID_RE)
    _require(path, fields, "title")
    _require(path, fields, "description")
    _require(path, fields, "priority", choices=["low", "medium", "high"])
    _require(path, fields, "created_at", pattern=ISO_DATE_RE)
    _require(path, fields, "updated_at", pattern=ISO_DATE_RE)

    _require_section(path, body, "Steps")
    _require_section(path, body, "Expected Result")

    # ID in filename must match id field
    stem = path.stem  # e.g. TC-001-user-login
    id_from_name = stem.split("-", 2)[:2]  # ['TC', '001']
    if len(id_from_name) == 2:
        reconstructed = "-".join(id_from_name)  # 'TC-001'
        fm_id = fields.get("id", "")
        # Normalize: TC-001 == TC-1 is fine, compare numeric part
        def num(s: str) -> int:
            m = re.search(r"\d+", s)
            return int(m.group()) if m else -1
        if num(reconstructed) != num(fm_id):
            _err(path, f"filename ID {reconstructed!r} does not match frontmatter id {fm_id!r}")


def validate_test_run(path: Path) -> None:
    try:
        fields, body = _parse_frontmatter(path.read_text())
    except ValueError as exc:
        _err(path, str(exc))
        return

    _require(path, fields, "id", pattern=RUN_ID_RE)
    _require(path, fields, "date", pattern=ISO_DATE_RE)
    _require(path, fields, "tester")
    _require(path, fields, "status", choices=["in-progress", "completed", "aborted"])

    _require_section(path, body, "Results")
    _require_section(path, body, "Summary")

    # Summary totals must be consistent with Results table rows
    results_match = re.search(r"## Results\n(.*?)(?:\n##|\Z)", body, re.DOTALL)
    summary_match = re.search(r"## Summary\n(.*?)(?:\n##|\Z)", body, re.DOTALL)
    if results_match and summary_match:
        table_rows = [
            l for l in results_match.group(1).splitlines()
            if l.startswith("|") and not re.search(r"-{3,}", l)
        ]
        # First row is header
        data_rows = table_rows[1:] if len(table_rows) > 1 else []
        total_in_table = len(data_rows)

        total_line = re.search(r"Total:\s*(\d+)", summary_match.group(1))
        if total_line:
            declared_total = int(total_line.group(1))
            if declared_total != total_in_table:
                _err(path, f"Summary Total ({declared_total}) != rows in Results table ({total_in_table})")

        statuses = {"passed": 0, "failed": 0, "blocked": 0, "skipped": 0}
        for row in data_rows:
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if len(cells) >= 2:
                status = cells[1].strip().lower()
                if status in statuses:
                    statuses[status] += 1

        for label, key in [("Passed", "passed"), ("Failed", "failed"), ("Blocked", "blocked")]:
            line = re.search(rf"{label}:\s*(\d+)", summary_match.group(1))
            if line:
                declared = int(line.group(1))
                actual = statuses[key]
                if declared != actual:
                    _err(path, f"Summary {label} ({declared}) != actual {key} rows ({actual})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def collect_files(args: list[str]) -> list[Path]:
    if args:
        return [Path(a) for a in args]
    files = []
    for d, validator in [("test-cases", validate_test_case), ("test-runs", validate_test_run)]:
        p = ROOT / d
        if p.exists():
            files.extend(sorted(p.glob("*.md")))
    return files


def main() -> int:
    paths = collect_files(sys.argv[1:])
    if not paths:
        print("No files to validate.")
        return 0

    for path in paths:
        path = Path(path)
        if path.parent.name == "test-cases":
            validate_test_case(path)
        elif path.parent.name == "test-runs":
            validate_test_run(path)
        else:
            print(f"Skipping {path} (not in test-cases/ or test-runs/)")

    if ERRORS:
        print(f"\n{len(ERRORS)} validation error(s):\n")
        for e in ERRORS:
            print(f"  ✗ {e}")
        print()
        return 1

    print(f"All {len(paths)} file(s) valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
