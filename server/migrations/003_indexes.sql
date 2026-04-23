-- Speed up list_runs: ORDER BY date DESC per repo
CREATE INDEX IF NOT EXISTS idx_runs_repo_date ON runs (repo_id, date DESC);

-- Speed up suite rename/delete cascade: UPDATE runs SET suite=... WHERE repo_id=... AND suite=...
CREATE INDEX IF NOT EXISTS idx_runs_repo_suite ON runs (repo_id, suite);
