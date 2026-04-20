#!/usr/bin/env python3
"""Create a new test case or test run with the next available ID.

Usage:
    python3 new.py tc  "Title of test case"
    python3 new.py run [tester] [environment]

Examples:
    python3 new.py tc "User can reset password"
    python3 new.py run john.doe staging
    python3 new.py run                      # uses $USER and no environment
"""

import re
import sys
import os
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent
TODAY = date.today().isoformat()


def _slug(title: str) -> str:
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:40]


def _next_id(directory: Path, prefix: str) -> str:
    pattern = re.compile(rf"^{prefix}-(\d+)")
    ids = []
    for f in directory.glob("*.md"):
        m = pattern.match(f.stem)
        if m:
            ids.append(int(m.group(1)))
    next_num = (max(ids) + 1) if ids else 1
    return f"{prefix}-{next_num:03d}"


def create_test_case(title: str) -> Path:
    tc_dir = ROOT / "test-cases"
    tc_dir.mkdir(exist_ok=True)

    tc_id = _next_id(tc_dir, "TC")
    slug = _slug(title)
    path = tc_dir / f"{tc_id}-{slug}.md"

    path.write_text(
        f"---\n"
        f"id: {tc_id}\n"
        f"title: {title}\n"
        f"description: \n"
        f"tags: []\n"
        f"priority: medium\n"
        f"created_at: {TODAY}\n"
        f"updated_at: {TODAY}\n"
        f"---\n"
        f"\n"
        f"## Prerequisites\n"
        f"\n"
        f"- \n"
        f"\n"
        f"## Steps\n"
        f"\n"
        f"1. \n"
        f"\n"
        f"## Expected Result\n"
        f"\n"
        f"\n"
    )
    return path


def create_test_run(tester: str, environment: str) -> Path:
    run_dir = ROOT / "test-runs"
    run_dir.mkdir(exist_ok=True)

    run_id = _next_id(run_dir, "RUN")
    path = run_dir / f"{run_id}-{TODAY}.md"

    env_line = f"environment: {environment}\n" if environment else ""

    path.write_text(
        f"---\n"
        f"id: {run_id}\n"
        f"date: {TODAY}\n"
        f"tester: {tester}\n"
        f"status: in-progress\n"
        f"{env_line}"
        f"---\n"
        f"\n"
        f"## Results\n"
        f"\n"
        f"| Test Case | Status | Notes |\n"
        f"|-----------|--------|-------|\n"
        f"\n"
        f"## Summary\n"
        f"\n"
        f"- Total: 0\n"
        f"- Passed: 0\n"
        f"- Failed: 0\n"
        f"- Blocked: 0\n"
        f"\n"
        f"## Notes\n"
        f"\n"
    )
    return path


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1

    kind = args[0].lower()

    if kind in ("tc", "test-case", "testcase"):
        if len(args) < 2:
            print("Error: provide a title. Example: python3 new.py tc \"User Login\"")
            return 1
        title = args[1]
        path = create_test_case(title)
        print(path.relative_to(ROOT))
        return 0

    if kind in ("run", "test-run", "testrun"):
        tester = args[1] if len(args) > 1 else os.environ.get("USER", "unknown")
        environment = args[2] if len(args) > 2 else ""
        path = create_test_run(tester, environment)
        print(path.relative_to(ROOT))
        return 0

    print(f"Unknown type {args[0]!r}. Use 'tc' or 'run'.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
