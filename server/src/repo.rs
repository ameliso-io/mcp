use anyhow::anyhow;
use chrono::Local;
use sqlx::PgPool;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("already exists: {0}")]
    AlreadyExists(String),
    #[error("closed run: {0}")]
    ClosedRun(String),
    #[error("invalid argument: {0}")]
    InvalidArg(String),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

type RResult<T> = std::result::Result<T, RepoError>;

fn map_db(e: sqlx::Error) -> RepoError {
    RepoError::Other(anyhow!(e))
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LoadedCase {
    pub case_path: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub priority: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LoadedResult {
    pub case_path: String,
    pub status: String,
    pub notes: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RunRow {
    pub run_id: String,
    pub date: String,
    pub tester: String,
    pub status: String,
    pub environment: Option<String>,
    pub suite: Option<String>,
}

pub struct LoadedRun {
    pub meta: RunRow,
    pub results: Vec<LoadedResult>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SuiteRow {
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub cases: Vec<String>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CoverageRow {
    pub case_path: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub priority: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
    pub latest_status: String,
    pub last_run_id: String,
    pub last_run_date: String,
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn validate_slug_path(path: &str, kind: &str) -> RResult<()> {
    if path.is_empty() {
        return Err(RepoError::InvalidArg(format!("{} path is empty", kind)));
    }
    if path.contains("..") || path.starts_with('/') || path.starts_with('\\') {
        return Err(RepoError::InvalidArg(format!(
            "invalid {} path: must not contain '..' or start with '/'",
            kind
        )));
    }
    for segment in path.split('/') {
        if segment.is_empty() {
            return Err(RepoError::InvalidArg(format!(
                "invalid {} path '{}': contains empty segment",
                kind, path
            )));
        }
        if !segment
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
        {
            return Err(RepoError::InvalidArg(format!(
                "invalid {} path '{}': segments must contain only a-z, 0-9, hyphens, underscores",
                kind, path
            )));
        }
    }
    Ok(())
}

fn validate_priority(priority: &str) -> RResult<()> {
    if !matches!(priority, "low" | "medium" | "high") {
        return Err(RepoError::InvalidArg(format!(
            "invalid priority '{}'; must be one of: low, medium, high",
            priority
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

pub async fn list_cases(pool: &PgPool, repo_id: &str) -> RResult<Vec<LoadedCase>> {
    sqlx::query_as::<_, LoadedCase>(
        "SELECT case_path, title, description, tags, priority, body, created_at, updated_at
         FROM cases WHERE repo_id = $1
         ORDER BY priority DESC, case_path",
    )
    .bind(repo_id)
    .fetch_all(pool)
    .await
    .map_err(map_db)
}

pub async fn get_case(pool: &PgPool, repo_id: &str, case_path: &str) -> RResult<LoadedCase> {
    validate_slug_path(case_path, "case")?;
    sqlx::query_as::<_, LoadedCase>(
        "SELECT case_path, title, description, tags, priority, body, created_at, updated_at
         FROM cases WHERE repo_id = $1 AND case_path = $2",
    )
    .bind(repo_id)
    .bind(case_path)
    .fetch_optional(pool)
    .await
    .map_err(map_db)?
    .ok_or_else(|| RepoError::NotFound(format!("case not found: {}", case_path)))
}

#[allow(clippy::too_many_arguments)]
pub async fn create_case(
    pool: &PgPool,
    repo_id: &str,
    case_path: &str,
    title: &str,
    description: &str,
    tags: Vec<String>,
    priority: &str,
    body: Option<&str>,
) -> RResult<LoadedCase> {
    validate_slug_path(case_path, "case")?;
    validate_priority(priority)?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let body =
        body.unwrap_or("## Prerequisites\n\n- \n\n## Steps\n\n1. \n\n## Expected Result\n\n\n");
    let rows_affected = sqlx::query(
        "INSERT INTO cases (repo_id, case_path, title, description, tags, priority, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING",
    )
    .bind(repo_id)
    .bind(case_path)
    .bind(title)
    .bind(description)
    .bind(&tags)
    .bind(priority)
    .bind(body)
    .bind(&today)
    .bind(&today)
    .execute(pool)
    .await
    .map_err(map_db)?
    .rows_affected();

    if rows_affected == 0 {
        return Err(RepoError::AlreadyExists(format!(
            "case already exists: {}",
            case_path
        )));
    }

    Ok(LoadedCase {
        case_path: case_path.to_owned(),
        title: title.to_owned(),
        description: description.to_owned(),
        tags,
        priority: priority.to_owned(),
        body: body.to_owned(),
        created_at: today.clone(),
        updated_at: today,
    })
}

#[allow(clippy::too_many_arguments)]
pub async fn update_case(
    pool: &PgPool,
    repo_id: &str,
    case_path: &str,
    title: Option<&str>,
    description: Option<&str>,
    tags: Option<Vec<String>>,
    priority: Option<&str>,
    body: Option<&str>,
) -> RResult<LoadedCase> {
    validate_slug_path(case_path, "case")?;
    if let Some(p) = priority {
        validate_priority(p)?;
    }
    let existing = get_case(pool, repo_id, case_path).await?;
    let new_title = title.unwrap_or(&existing.title);
    let new_desc = description.unwrap_or(&existing.description);
    let new_tags = tags.as_ref().unwrap_or(&existing.tags);
    let new_priority = priority.unwrap_or(&existing.priority);
    let new_body = body.unwrap_or(&existing.body);
    let today = Local::now().format("%Y-%m-%d").to_string();

    let rows = sqlx::query(
        "UPDATE cases SET title=$3, description=$4, tags=$5, priority=$6, body=$7, updated_at=$8
         WHERE repo_id=$1 AND case_path=$2",
    )
    .bind(repo_id)
    .bind(case_path)
    .bind(new_title)
    .bind(new_desc)
    .bind(new_tags)
    .bind(new_priority)
    .bind(new_body)
    .bind(&today)
    .execute(pool)
    .await
    .map_err(map_db)?
    .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("case not found: {}", case_path)));
    }

    Ok(LoadedCase {
        case_path: case_path.to_owned(),
        title: new_title.to_owned(),
        description: new_desc.to_owned(),
        tags: new_tags.to_owned(),
        priority: new_priority.to_owned(),
        body: new_body.to_owned(),
        created_at: existing.created_at,
        updated_at: today,
    })
}

pub async fn delete_case(pool: &PgPool, repo_id: &str, case_path: &str) -> RResult<()> {
    validate_slug_path(case_path, "case")?;
    let rows = sqlx::query("DELETE FROM cases WHERE repo_id=$1 AND case_path=$2")
        .bind(repo_id)
        .bind(case_path)
        .execute(pool)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!(
            "case not found: {}",
            case_path
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

pub async fn list_suites(pool: &PgPool, repo_id: &str) -> RResult<Vec<SuiteRow>> {
    sqlx::query_as::<_, SuiteRow>(
        "SELECT slug, name, description, cases FROM suites WHERE repo_id=$1 ORDER BY slug",
    )
    .bind(repo_id)
    .fetch_all(pool)
    .await
    .map_err(map_db)
}

pub async fn get_suite(pool: &PgPool, repo_id: &str, slug: &str) -> RResult<SuiteRow> {
    validate_slug_path(slug, "suite")?;
    sqlx::query_as::<_, SuiteRow>(
        "SELECT slug, name, description, cases FROM suites WHERE repo_id=$1 AND slug=$2",
    )
    .bind(repo_id)
    .bind(slug)
    .fetch_optional(pool)
    .await
    .map_err(map_db)?
    .ok_or_else(|| RepoError::NotFound(format!("suite not found: {}", slug)))
}

async fn validate_suite_cases(pool: &PgPool, repo_id: &str, cases: &[String]) -> RResult<()> {
    for case_path in cases {
        validate_slug_path(case_path, "case")?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM cases WHERE repo_id=$1 AND case_path=$2)",
        )
        .bind(repo_id)
        .bind(case_path)
        .fetch_one(pool)
        .await
        .map_err(map_db)?;
        if !exists {
            return Err(RepoError::NotFound(format!(
                "case not found: {}",
                case_path
            )));
        }
    }
    Ok(())
}

pub async fn create_suite(
    pool: &PgPool,
    repo_id: &str,
    slug: &str,
    name: &str,
    description: Option<String>,
    cases: Vec<String>,
) -> RResult<SuiteRow> {
    validate_slug_path(slug, "suite")?;
    validate_suite_cases(pool, repo_id, &cases).await?;
    let rows = sqlx::query(
        "INSERT INTO suites (repo_id, slug, name, description, cases)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING",
    )
    .bind(repo_id)
    .bind(slug)
    .bind(name)
    .bind(&description)
    .bind(&cases)
    .execute(pool)
    .await
    .map_err(map_db)?
    .rows_affected();

    if rows == 0 {
        return Err(RepoError::AlreadyExists(format!(
            "suite already exists: {}",
            slug
        )));
    }

    Ok(SuiteRow {
        slug: slug.to_owned(),
        name: name.to_owned(),
        description,
        cases,
    })
}

pub async fn update_suite(
    pool: &PgPool,
    repo_id: &str,
    slug: &str,
    name: Option<&str>,
    description: Option<Option<String>>,
    cases: Option<Vec<String>>,
) -> RResult<SuiteRow> {
    validate_slug_path(slug, "suite")?;
    let existing = get_suite(pool, repo_id, slug).await?;
    let new_name = name.unwrap_or(&existing.name);
    let new_desc = description.unwrap_or(existing.description.clone());
    let new_cases = if let Some(c) = cases {
        validate_suite_cases(pool, repo_id, &c).await?;
        c
    } else {
        existing.cases.clone()
    };

    let rows = sqlx::query(
        "UPDATE suites SET name=$3, description=$4, cases=$5 WHERE repo_id=$1 AND slug=$2",
    )
    .bind(repo_id)
    .bind(slug)
    .bind(new_name)
    .bind(&new_desc)
    .bind(&new_cases)
    .execute(pool)
    .await
    .map_err(map_db)?
    .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("suite not found: {}", slug)));
    }

    Ok(SuiteRow {
        slug: slug.to_owned(),
        name: new_name.to_owned(),
        description: new_desc,
        cases: new_cases,
    })
}

pub async fn delete_suite(pool: &PgPool, repo_id: &str, slug: &str) -> RResult<()> {
    validate_slug_path(slug, "suite")?;
    let rows = sqlx::query("DELETE FROM suites WHERE repo_id=$1 AND slug=$2")
        .bind(repo_id)
        .bind(slug)
        .execute(pool)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("suite not found: {}", slug)));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

pub async fn list_runs(pool: &PgPool, repo_id: &str) -> RResult<Vec<RunRow>> {
    sqlx::query_as::<_, RunRow>(
        "SELECT run_id, date, tester, status, environment, suite
         FROM runs WHERE repo_id=$1 ORDER BY date DESC, run_id DESC",
    )
    .bind(repo_id)
    .fetch_all(pool)
    .await
    .map_err(map_db)
}

pub async fn get_run(pool: &PgPool, repo_id: &str, run_id: &str) -> RResult<LoadedRun> {
    validate_slug_path(run_id, "run")?;
    let meta = sqlx::query_as::<_, RunRow>(
        "SELECT run_id, date, tester, status, environment, suite
         FROM runs WHERE repo_id=$1 AND run_id=$2",
    )
    .bind(repo_id)
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(map_db)?
    .ok_or_else(|| RepoError::NotFound(format!("run not found: {}", run_id)))?;

    let results = sqlx::query_as::<_, LoadedResult>(
        "SELECT case_path, status, notes FROM results WHERE repo_id=$1 AND run_id=$2",
    )
    .bind(repo_id)
    .bind(run_id)
    .fetch_all(pool)
    .await
    .map_err(map_db)?;

    Ok(LoadedRun { meta, results })
}

pub async fn create_run(
    pool: &PgPool,
    repo_id: &str,
    slug: &str,
    tester: &str,
    environment: Option<String>,
    suite: Option<String>,
) -> RResult<RunRow> {
    validate_slug_path(slug, "run slug")?;
    if let Some(ref suite_slug) = suite {
        if !suite_slug.is_empty() {
            validate_slug_path(suite_slug, "suite")?;
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM suites WHERE repo_id=$1 AND slug=$2)",
            )
            .bind(repo_id)
            .bind(suite_slug)
            .fetch_one(pool)
            .await
            .map_err(map_db)?;
            if !exists {
                return Err(RepoError::NotFound(format!(
                    "suite not found: {}",
                    suite_slug
                )));
            }
        }
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let run_id = format!("{}-{}", today, slug);

    let rows = sqlx::query(
        "INSERT INTO runs (repo_id, run_id, date, tester, status, environment, suite)
         VALUES ($1, $2, $3, $4, 'in-progress', $5, $6)
         ON CONFLICT DO NOTHING",
    )
    .bind(repo_id)
    .bind(&run_id)
    .bind(&today)
    .bind(tester)
    .bind(&environment)
    .bind(&suite)
    .execute(pool)
    .await
    .map_err(map_db)?
    .rows_affected();

    if rows == 0 {
        return Err(RepoError::AlreadyExists(format!(
            "run already exists: {}",
            run_id
        )));
    }

    Ok(RunRow {
        run_id,
        date: today,
        tester: tester.to_owned(),
        status: "in-progress".to_owned(),
        environment,
        suite,
    })
}

pub async fn record_result(
    pool: &PgPool,
    repo_id: &str,
    run_id: &str,
    case_path: &str,
    status: &str,
    notes: &str,
) -> RResult<(LoadedResult, Option<String>)> {
    if !matches!(status, "passed" | "failed" | "blocked" | "skipped") {
        return Err(RepoError::InvalidArg(format!(
            "invalid result status '{}'; must be one of: passed, failed, blocked, skipped",
            status
        )));
    }
    validate_slug_path(run_id, "run")?;
    validate_slug_path(case_path, "case")?;

    let run_status: Option<String> =
        sqlx::query_scalar("SELECT status FROM runs WHERE repo_id=$1 AND run_id=$2")
            .bind(repo_id)
            .bind(run_id)
            .fetch_optional(pool)
            .await
            .map_err(map_db)?;

    match run_status.as_deref() {
        None => {
            return Err(RepoError::NotFound(format!("run not found: {}", run_id)));
        }
        Some("completed") | Some("aborted") => {
            return Err(RepoError::ClosedRun(format!(
                "run {} is closed; cannot record results",
                run_id
            )));
        }
        _ => {}
    }

    let case_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cases WHERE repo_id=$1 AND case_path=$2)")
            .bind(repo_id)
            .bind(case_path)
            .fetch_one(pool)
            .await
            .map_err(map_db)?;

    if !case_exists {
        return Err(RepoError::NotFound(format!(
            "case not found: {}",
            case_path
        )));
    }

    let previous: Option<String> = sqlx::query_scalar(
        "SELECT status FROM results WHERE repo_id=$1 AND run_id=$2 AND case_path=$3",
    )
    .bind(repo_id)
    .bind(run_id)
    .bind(case_path)
    .fetch_optional(pool)
    .await
    .map_err(map_db)?;

    sqlx::query(
        "INSERT INTO results (repo_id, run_id, case_path, status, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (repo_id, run_id, case_path) DO UPDATE SET status=$4, notes=$5",
    )
    .bind(repo_id)
    .bind(run_id)
    .bind(case_path)
    .bind(status)
    .bind(notes)
    .execute(pool)
    .await
    .map_err(map_db)?;

    Ok((
        LoadedResult {
            case_path: case_path.to_owned(),
            status: status.to_owned(),
            notes: notes.to_owned(),
        },
        previous,
    ))
}

pub async fn finalize_run(
    pool: &PgPool,
    repo_id: &str,
    run_id: &str,
    status: &str,
) -> RResult<RunRow> {
    if !matches!(status, "completed" | "aborted") {
        return Err(RepoError::InvalidArg(format!(
            "invalid finalize status '{}'; must be one of: completed, aborted",
            status
        )));
    }
    validate_slug_path(run_id, "run")?;

    let current: Option<String> =
        sqlx::query_scalar("SELECT status FROM runs WHERE repo_id=$1 AND run_id=$2")
            .bind(repo_id)
            .bind(run_id)
            .fetch_optional(pool)
            .await
            .map_err(map_db)?;

    match current.as_deref() {
        None => return Err(RepoError::NotFound(format!("run not found: {}", run_id))),
        Some("completed") | Some("aborted") => {
            return Err(RepoError::ClosedRun(format!(
                "run {} is already closed",
                run_id
            )));
        }
        _ => {}
    }

    let rows = sqlx::query("UPDATE runs SET status=$3 WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .bind(status)
        .execute(pool)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("run not found: {}", run_id)));
    }

    get_run(pool, repo_id, run_id).await.map(|r| r.meta)
}

pub async fn delete_run(pool: &PgPool, repo_id: &str, run_id: &str) -> RResult<()> {
    validate_slug_path(run_id, "run")?;
    // Delete results first (no FK cascade defined), then the run.
    sqlx::query("DELETE FROM results WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .execute(pool)
        .await
        .map_err(map_db)?;
    let rows = sqlx::query("DELETE FROM runs WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .execute(pool)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("run not found: {}", run_id)));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Pending cases
// ---------------------------------------------------------------------------

pub async fn get_pending_cases(
    pool: &PgPool,
    repo_id: &str,
    run_id: &str,
) -> RResult<(Vec<LoadedCase>, usize)> {
    validate_slug_path(run_id, "run")?;
    let run = get_run(pool, repo_id, run_id).await?;

    let (scope, total) = if let Some(ref suite_slug) = run.meta.suite {
        if suite_slug.is_empty() {
            let all = list_cases(pool, repo_id).await?;
            let total = all.len();
            (all, total)
        } else {
            match get_suite(pool, repo_id, suite_slug).await {
                Ok(s) => {
                    let suite_cases = s.cases.clone();
                    let all = list_cases(pool, repo_id).await?;
                    let filtered: Vec<_> = all
                        .into_iter()
                        .filter(|c| suite_cases.contains(&c.case_path))
                        .collect();
                    let total = filtered.len();
                    (filtered, total)
                }
                Err(RepoError::NotFound(_)) => {
                    let all = list_cases(pool, repo_id).await?;
                    let total = all.len();
                    (all, total)
                }
                Err(e) => return Err(e),
            }
        }
    } else {
        let all = list_cases(pool, repo_id).await?;
        let total = all.len();
        (all, total)
    };

    let recorded: std::collections::HashSet<String> =
        run.results.iter().map(|r| r.case_path.clone()).collect();

    let priority_rank = |p: &str| match p {
        "high" => 0u8,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    };
    let mut pending: Vec<LoadedCase> = scope
        .into_iter()
        .filter(|c| !recorded.contains(&c.case_path))
        .collect();
    pending.sort_by(|a, b| {
        priority_rank(&a.priority)
            .cmp(&priority_rank(&b.priority))
            .then_with(|| a.case_path.cmp(&b.case_path))
    });

    Ok((pending, total))
}

// ---------------------------------------------------------------------------
// Coverage report
// ---------------------------------------------------------------------------

pub async fn get_coverage_report(pool: &PgPool, repo_id: &str) -> RResult<(Vec<CoverageRow>, i64)> {
    let entries = sqlx::query_as::<_, CoverageRow>(
        "WITH latest_results AS (
            SELECT DISTINCT ON (r.case_path)
                r.case_path,
                r.status,
                r.run_id,
                ru.date
            FROM results r
            JOIN runs ru ON ru.repo_id = r.repo_id AND ru.run_id = r.run_id
            WHERE r.repo_id = $1
            ORDER BY r.case_path, ru.date DESC, r.run_id DESC
        )
        SELECT
            c.case_path, c.title, c.description, c.tags, c.priority, c.body,
            c.created_at, c.updated_at,
            COALESCE(lr.status, 'never') AS latest_status,
            COALESCE(lr.run_id, '') AS last_run_id,
            COALESCE(lr.date, '') AS last_run_date
        FROM cases c
        LEFT JOIN latest_results lr ON lr.case_path = c.case_path
        WHERE c.repo_id = $1
        ORDER BY c.priority DESC, c.case_path",
    )
    .bind(repo_id)
    .fetch_all(pool)
    .await
    .map_err(map_db)?;

    let run_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runs WHERE repo_id=$1")
        .bind(repo_id)
        .fetch_one(pool)
        .await
        .map_err(map_db)?;

    Ok((entries, run_count))
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // validate_slug_path
    // -----------------------------------------------------------------------

    #[test]
    fn slug_path_valid_single_segment() {
        assert!(validate_slug_path("auth", "case").is_ok());
    }

    #[test]
    fn slug_path_valid_multi_segment() {
        assert!(validate_slug_path("auth/login", "case").is_ok());
    }

    #[test]
    fn slug_path_valid_with_hyphen_digit_underscore() {
        assert!(validate_slug_path("auth/login-flow_2", "case").is_ok());
    }

    #[test]
    fn slug_path_empty_returns_invalid_arg() {
        let err = validate_slug_path("", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("case path is empty"));
    }

    #[test]
    fn slug_path_dot_dot_returns_invalid_arg() {
        let err = validate_slug_path("auth/../etc", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[test]
    fn slug_path_leading_slash_returns_invalid_arg() {
        let err = validate_slug_path("/auth/login", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[test]
    fn slug_path_leading_backslash_returns_invalid_arg() {
        let err = validate_slug_path("\\auth", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[test]
    fn slug_path_double_slash_empty_segment_returns_invalid_arg() {
        let err = validate_slug_path("auth//login", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("empty segment"));
    }

    #[test]
    fn slug_path_uppercase_returns_invalid_arg() {
        let err = validate_slug_path("Auth/Login", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("a-z, 0-9"));
    }

    #[test]
    fn slug_path_space_returns_invalid_arg() {
        let err = validate_slug_path("auth/lo in", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // validate_priority
    // -----------------------------------------------------------------------

    #[test]
    fn priority_low_is_valid() {
        assert!(validate_priority("low").is_ok());
    }

    #[test]
    fn priority_medium_is_valid() {
        assert!(validate_priority("medium").is_ok());
    }

    #[test]
    fn priority_high_is_valid() {
        assert!(validate_priority("high").is_ok());
    }

    #[test]
    fn priority_invalid_returns_invalid_arg() {
        let err = validate_priority("critical").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("critical"));
    }

    #[test]
    fn priority_empty_returns_invalid_arg() {
        assert!(matches!(
            validate_priority("").unwrap_err(),
            RepoError::InvalidArg(_)
        ));
    }

    #[test]
    fn priority_uppercase_returns_invalid_arg() {
        assert!(matches!(
            validate_priority("High").unwrap_err(),
            RepoError::InvalidArg(_)
        ));
    }

    // -----------------------------------------------------------------------
    // RepoError display
    // -----------------------------------------------------------------------

    #[test]
    fn error_not_found_display() {
        assert_eq!(
            RepoError::NotFound("case not found: x".to_owned()).to_string(),
            "not found: case not found: x"
        );
    }

    #[test]
    fn error_already_exists_display() {
        assert_eq!(
            RepoError::AlreadyExists("case already exists: x".to_owned()).to_string(),
            "already exists: case already exists: x"
        );
    }

    #[test]
    fn error_closed_run_display() {
        assert_eq!(
            RepoError::ClosedRun("run x is closed".to_owned()).to_string(),
            "closed run: run x is closed"
        );
    }

    #[test]
    fn error_invalid_arg_display() {
        assert_eq!(
            RepoError::InvalidArg("bad input".to_owned()).to_string(),
            "invalid argument: bad input"
        );
    }

    #[test]
    fn error_other_wraps_anyhow() {
        let inner = anyhow::anyhow!("something broke");
        let err = RepoError::Other(inner);
        assert!(err.to_string().contains("something broke"));
    }
}
