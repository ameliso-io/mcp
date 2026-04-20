The user set a repo, the repos is a single source of truth for a project.

The repo contain a file system of test cases as md formatter files, and a file system of test runs as md formatter files.

Always follow the guidelines at https://github.com/tupe12334/guidelines when contributing.

## Setup

Enable the pre-commit validator (one-time, per clone):

```sh
git config core.hooksPath .githooks
```

## CLI — `ameliso.py`

All operations go through the unified CLI:

```sh
python3 ameliso.py new tc  "Title"              # create test case (TC-NNN)
python3 ameliso.py new run [tester] [env]       # create test run (RUN-NNN)
python3 ameliso.py validate [paths...]          # validate schema
python3 ameliso.py report  [--json|--summary]   # coverage table
python3 ameliso.py affected [--json] [--since]  # what needs re-running
python3 ameliso.py help                         # full usage
```

Requires Python 3.9+, no extra packages. Individual scripts (`new.py`,
`validate.py`, `report.py`, `affected.py`) remain callable directly.

## Workflow

1. `python3 ameliso.py new tc "..."` — scaffold a test case, fill in steps.
2. `python3 ameliso.py new run` — scaffold a run, fill in results table.
3. `git add . && git commit` — pre-commit hook validates automatically.
4. `python3 ameliso.py report` — check coverage.
5. `python3 ameliso.py affected` — see what needs re-running after code changes.
