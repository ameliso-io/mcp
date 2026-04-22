-- Stores inline case scopes for runs created without a named suite.
-- When rows exist for a run, pending-cases and scope calculations use this
-- table instead of listing all cases or looking up a suite.
CREATE TABLE IF NOT EXISTS run_cases (
    repo_id  TEXT NOT NULL,
    run_id   TEXT NOT NULL,
    case_path TEXT NOT NULL,
    PRIMARY KEY (repo_id, run_id, case_path)
);
