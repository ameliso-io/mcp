use anyhow::Result;
use sqlx::PgPool;

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            full_name TEXT NOT NULL DEFAULT '',
            html_url TEXT NOT NULL DEFAULT '',
            installation_id TEXT NOT NULL DEFAULT '',
            added_at TEXT NOT NULL DEFAULT ''
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS cases (
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
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS suites (
            repo_id TEXT NOT NULL,
            slug TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            description TEXT,
            cases TEXT[] NOT NULL DEFAULT '{}',
            PRIMARY KEY (repo_id, slug)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS runs (
            repo_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            date TEXT NOT NULL DEFAULT '',
            tester TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'in-progress',
            environment TEXT,
            suite TEXT,
            PRIMARY KEY (repo_id, run_id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS results (
            repo_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            case_path TEXT NOT NULL,
            status TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (repo_id, run_id, case_path)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS run_cases (
            repo_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            case_path TEXT NOT NULL,
            PRIMARY KEY (repo_id, run_id, case_path)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("ALTER TABLE runs ADD COLUMN IF NOT EXISTS commit_sha TEXT NOT NULL DEFAULT ''")
        .execute(pool)
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    fn lazy_pool() -> sqlx::PgPool {
        PgPoolOptions::new()
            .connect_lazy("postgres://user:pass@localhost/db_does_not_exist")
            .expect("lazy pool")
    }

    #[tokio::test]
    async fn run_migrations_returns_db_error_when_no_connection() {
        let err = run_migrations(&lazy_pool()).await.unwrap_err();
        assert!(!err.to_string().is_empty());
    }
}
