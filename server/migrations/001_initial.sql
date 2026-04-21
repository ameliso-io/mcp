CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    html_url TEXT NOT NULL DEFAULT '',
    installation_id TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cases (
    repo_id TEXT NOT NULL,
    case_path TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    priority TEXT NOT NULL DEFAULT 'medium',
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (repo_id, case_path)
);

CREATE TABLE IF NOT EXISTS suites (
    repo_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT,
    cases TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (repo_id, slug)
);

CREATE TABLE IF NOT EXISTS runs (
    repo_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    date TEXT NOT NULL DEFAULT '',
    tester TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in-progress',
    environment TEXT,
    suite TEXT,
    PRIMARY KEY (repo_id, run_id)
);

CREATE TABLE IF NOT EXISTS results (
    repo_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    case_path TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (repo_id, run_id, case_path)
);
