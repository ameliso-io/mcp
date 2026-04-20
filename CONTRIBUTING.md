The user set a repo, the repos is a single source of truth for a project.

The repo contain a file system of test cases as md formatter files, and a file system of test runs as md formatter files.

Always follow the guidelines at https://github.com/tupe12334/guidelines when contributing.

## Setup

Enable the pre-commit validator (one-time, per clone):

```sh
git config core.hooksPath .githooks
```

## Validation

Run manually at any time:

```sh
python3 validate.py
```

The validator requires only Python 3.9+ (no extra packages). It checks all files in `test-cases/` and `test-runs/` against the schema defined in `SCHEMA.md`.
