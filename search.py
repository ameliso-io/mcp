#!/usr/bin/env python3
"""Search test cases by title, tag, priority, or full-text.

Usage:
    python3 search.py <query>                  # full-text search
    python3 search.py --tag <tag>              # filter by tag
    python3 search.py --priority <p>           # filter by priority
    python3 search.py --status <s>             # filter by latest run status
    python3 search.py <query> --json           # machine-readable output

Flags can be combined. <query> matches against id, title, description,
and body text (case-insensitive).

Exit codes:
    0  one or more results found
    1  no results
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
# Shared parsers (minimal, no import from other modules to stay standalone)
# ---------------------------------------------------------------------------

def _parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    try:
        end = text.index("\n---", 3)
    except ValueError:
        return {}, text
    body = text[end + 4:].lstrip("\n")
    fields: dict = {}
    for line in text[4:end].splitlines():
        if ":" not in line or line.strip().startswith("#"):
            continue
        k, _, v = line.partition(":")
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            fields[k] = [x.strip() for x in v[1:-1].split(",") if x.strip()]
        else:
            fields[k] = v
    return fields, body


def _load_test_cases() -> list[dict]:
    cases = []
    if not TC_DIR.exists():
        return cases
    for f in sorted(TC_DIR.glob("*.md")):
        text = f.read_text()
        fields, body = _parse_frontmatter(text)
        tc_id = fields.get("id", "")
        if not tc_id:
            continue
        cases.append({
            "id": tc_id.upper(),
            "title": fields.get("title", ""),
            "description": fields.get("description", ""),
            "tags": fields.get("tags", []),
            "priority": fields.get("priority", "medium"),
            "created_at": fields.get("created_at", ""),
            "updated_at": fields.get("updated_at", ""),
            "body": body,
            "path": str(f.relative_to(ROOT)),
        })
    return cases


def _latest_status_map() -> dict[str, str]:
    """Return {tc_id: latest_status} from run files."""
    if not RUN_DIR.exists():
        return {}
    latest: dict[str, str] = {}
    for f in sorted(RUN_DIR.glob("*.md"), reverse=True):
        _, body = _parse_frontmatter(f.read_text())
        m = re.search(r"## Results\n(.*?)(?:\n##|\Z)", body, re.DOTALL)
        if not m:
            continue
        for line in m.group(1).splitlines():
            if not line.startswith("|") or re.search(r"-{3,}", line):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 2 and re.match(r"TC-\d+", cells[0], re.I):
                tc_id = cells[0].upper()
                if tc_id not in latest:
                    latest[tc_id] = cells[1].lower()
    return latest


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

def _matches(case: dict, query: Optional[str], tag: Optional[str],
             priority: Optional[str], status: Optional[str],
             status_map: dict[str, str]) -> bool:
    if tag:
        tags = [t.lower() for t in (case["tags"] if isinstance(case["tags"], list) else [])]
        if tag.lower() not in tags:
            return False

    if priority and case["priority"].lower() != priority.lower():
        return False

    if status:
        actual = status_map.get(case["id"], "never")
        if actual != status.lower():
            return False

    if query:
        haystack = " ".join([
            case["id"], case["title"], case["description"], case["body"]
        ]).lower()
        if query.lower() not in haystack:
            return False

    return True


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _print_results(results: list[dict], status_map: dict[str, str]) -> None:
    if not results:
        print("No matching test cases.")
        return
    print(f"\n{len(results)} result(s):\n")
    print(f"  {'ID':<10} {'Pri':<7} {'Status':<10} {'Title'}")
    print(f"  {'-'*9} {'-'*6} {'-'*9} {'-'*35}")
    for r in results:
        st = status_map.get(r["id"], "never")
        print(f"  {r['id']:<10} {r['priority']:<7} {st:<10} {r['title']}")
        if r["tags"]:
            tags = r["tags"] if isinstance(r["tags"], list) else [r["tags"]]
            print(f"  {'':10} {'':7} {'':10} tags: {', '.join(tags)}")
        print(f"  {'':10} {'':7} {'':10} {r['path']}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = sys.argv[1:]
    as_json = "--json" in args
    if "--json" in args:
        args = [a for a in args if a != "--json"]

    def _flag(name: str) -> Optional[str]:
        if name in args:
            idx = args.index(name)
            if idx + 1 < len(args):
                return args[idx + 1]
        return None

    tag = _flag("--tag")
    priority = _flag("--priority")
    status = _flag("--status")

    # Remaining positional args are the query
    skip = set()
    for flag in ("--tag", "--priority", "--status"):
        if flag in args:
            i = args.index(flag)
            skip.add(i)
            skip.add(i + 1)
    query_parts = [a for i, a in enumerate(args) if i not in skip and not a.startswith("--")]
    query = " ".join(query_parts) if query_parts else None

    if not any([query, tag, priority, status]):
        print(__doc__)
        return 1

    cases = _load_test_cases()
    status_map = _latest_status_map()
    results = [c for c in cases if _matches(c, query, tag, priority, status, status_map)]

    if as_json:
        out = []
        for r in results:
            out.append({
                "id": r["id"],
                "title": r["title"],
                "description": r["description"],
                "tags": r["tags"],
                "priority": r["priority"],
                "status": status_map.get(r["id"], "never"),
                "path": r["path"],
            })
        print(json.dumps(out, indent=2))
        return 0 if results else 1

    _print_results(results, status_map)
    return 0 if results else 1


if __name__ == "__main__":
    sys.exit(main())
