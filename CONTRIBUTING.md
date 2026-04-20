The user set a repo, the repos is a single source of truth for a project.

The repo contain a file system of test cases as md formatter files, and a file system of test runs as md formatter files.

Always follow the guidelines at https://github.com/tupe12334/guidelines when contributing.

## Setup

Enable the pre-commit validator (one-time, per clone):

```sh
git config core.hooksPath .githooks
```

## Creating files

Use `new.py` to create files with the next available ID:

```sh
python3 new.py tc "Title of test case"     # creates test-cases/TC-NNN-<slug>.md
python3 new.py run [tester] [environment]  # creates test-runs/RUN-NNN-YYYY-MM-DD.md
```

Fill in the generated template, then commit. The pre-commit hook validates before the commit lands.

## Coverage report

```sh
python3 report.py           # human-readable table
python3 report.py --json    # machine-readable (for agents)
python3 report.py --summary # counts only
```

Exits 0 if all test cases passed in their latest run; exits 1 if any are failing, blocked, or never run.

## Validation

Run manually at any time:

```sh
python3 validate.py
```

The validator requires only Python 3.9+ (no extra packages). It checks all files in `test-cases/` and `test-runs/` against the schema defined in `SCHEMA.md`.
