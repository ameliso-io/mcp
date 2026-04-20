#!/usr/bin/env python3
"""Ameliso — manual testing management CLI.

Commands:
    new tc  <title>                   Create a new test case
    new run [tester] [environment]    Create a new test run

    validate [paths...]               Validate files against schema
    report   [--json] [--summary]     Coverage report (latest status per TC)
    affected [--json] [--since <ref>] Test cases needing re-run after changes
             [--all]
    search   <query>                  Search test cases by title/tag/text
             [--tag <tag>]            Filter by tag
             [--priority <p>]         Filter by priority
             [--status <s>]           Filter by latest run status
             [--json]

    help                              Show this message

All commands exit 0 on success, 1 on failure or when action is required.
"""

import sys


def _dispatch(args: list[str]) -> int:
    if not args or args[0] in ("help", "--help", "-h"):
        print(__doc__)
        return 0

    cmd = args[0]

    if cmd == "new":
        import new as m
        sys.argv = ["new.py"] + args[1:]
        return m.main()

    if cmd == "validate":
        import validate as m
        sys.argv = ["validate.py"] + args[1:]
        return m.main()

    if cmd == "report":
        import report as m
        sys.argv = ["report.py"] + args[1:]
        return m.main()

    if cmd == "affected":
        import affected as m
        sys.argv = ["affected.py"] + args[1:]
        return m.main()

    if cmd == "search":
        import search as m
        sys.argv = ["search.py"] + args[1:]
        return m.main()

    print(f"Unknown command {cmd!r}. Run 'python3 ameliso.py help' for usage.")
    return 1


def main() -> int:
    return _dispatch(sys.argv[1:])


if __name__ == "__main__":
    sys.exit(main())
