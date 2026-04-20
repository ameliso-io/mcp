# Ameliso

An intuitive manual testing management tool — git-native, agent-friendly.

## Quick start

```sh
python3 ameliso.py new tc "User can reset password"   # create test case
python3 ameliso.py new run john.doe staging            # create test run
python3 ameliso.py validate                            # check all files
python3 ameliso.py report                              # coverage table
python3 ameliso.py affected                            # what needs re-running
```

Requires Python 3.9+, no extra packages. Agents: see [AGENTS.md](AGENTS.md).

## File Structure

```
test-cases/   # TC-NNN-<slug>.md — one file per test case
test-runs/    # RUN-NNN-YYYY-MM-DD.md — one file per run
SCHEMA.md     # Full format spec for test cases and test runs
```

See [SCHEMA.md](SCHEMA.md) for the complete file format specification.

## Vocabulary

### Test Case

A test case is a set of steps that are executed to verify a specific functionality or feature of a software application

### Run

A run is an execution of a test cases. It can be successful, failed, or blocked.
