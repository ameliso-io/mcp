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
    pub commit_sha: String,
}

#[derive(Debug)]
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
        return Err(RepoError::InvalidArg(format!("{kind} path is empty")));
    }
    if path.contains("..") || path.starts_with('/') || path.starts_with('\\') {
        return Err(RepoError::InvalidArg(format!(
            "invalid {kind} path: must not contain '..' or start with '/'"
        )));
    }
    for segment in path.split('/') {
        if segment.is_empty() {
            return Err(RepoError::InvalidArg(format!(
                "invalid {kind} path '{path}': contains empty segment"
            )));
        }
        if !segment
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
        {
            return Err(RepoError::InvalidArg(format!(
                "invalid {kind} path '{path}': segments must contain only a-z, 0-9, hyphens, underscores"
            )));
        }
    }
    Ok(())
}

fn validate_priority(priority: &str) -> RResult<()> {
    if !matches!(priority, "low" | "medium" | "high") {
        return Err(RepoError::InvalidArg(format!(
            "invalid priority '{priority}'; must be one of: low, medium, high"
        )));
    }
    Ok(())
}

fn validate_result_status(status: &str) -> RResult<()> {
    if !matches!(status, "passed" | "failed" | "blocked" | "skipped") {
        return Err(RepoError::InvalidArg(format!(
            "invalid result status '{status}'; must be one of: passed, failed, blocked, skipped"
        )));
    }
    Ok(())
}

fn validate_finalize_status(status: &str) -> RResult<()> {
    if !matches!(status, "completed" | "aborted") {
        return Err(RepoError::InvalidArg(format!(
            "invalid finalize status '{status}'; must be one of: completed, aborted"
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
    .ok_or_else(|| RepoError::NotFound(format!("case not found: {case_path}")))
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
            "case already exists: {case_path}"
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
    new_path: Option<&str>,
) -> RResult<LoadedCase> {
    validate_slug_path(case_path, "case")?;
    if let Some(p) = priority {
        validate_priority(p)?;
    }
    let effective_path = if let Some(np) = new_path {
        validate_slug_path(np, "new_path")?;
        if np == case_path {
            case_path
        } else {
            let conflict: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM cases WHERE repo_id=$1 AND case_path=$2)",
            )
            .bind(repo_id)
            .bind(np)
            .fetch_one(pool)
            .await
            .map_err(map_db)?;
            if conflict {
                return Err(RepoError::AlreadyExists(format!(
                    "case already exists: {np}"
                )));
            }
            // Rename atomically: update case_path and all referencing tables.
            let mut tx = pool.begin().await.map_err(map_db)?;
            let rows =
                sqlx::query("UPDATE cases SET case_path=$3 WHERE repo_id=$1 AND case_path=$2")
                    .bind(repo_id)
                    .bind(case_path)
                    .bind(np)
                    .execute(&mut *tx)
                    .await
                    .map_err(map_db)?
                    .rows_affected();
            if rows == 0 {
                return Err(RepoError::NotFound(format!("case not found: {case_path}")));
            }
            sqlx::query(
                "UPDATE suites SET cases = array_replace(cases, $2, $3) WHERE repo_id=$1 AND $2 = ANY(cases)",
            )
            .bind(repo_id)
            .bind(case_path)
            .bind(np)
            .execute(&mut *tx)
            .await
            .map_err(map_db)?;
            sqlx::query("UPDATE results SET case_path=$3 WHERE repo_id=$1 AND case_path=$2")
                .bind(repo_id)
                .bind(case_path)
                .bind(np)
                .execute(&mut *tx)
                .await
                .map_err(map_db)?;
            sqlx::query("UPDATE run_cases SET case_path=$3 WHERE repo_id=$1 AND case_path=$2")
                .bind(repo_id)
                .bind(case_path)
                .bind(np)
                .execute(&mut *tx)
                .await
                .map_err(map_db)?;
            tx.commit().await.map_err(map_db)?;
            np
        }
    } else {
        case_path
    };

    let existing = get_case(pool, repo_id, effective_path).await?;
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
    .bind(effective_path)
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
        return Err(RepoError::NotFound(format!(
            "case not found: {effective_path}"
        )));
    }

    Ok(LoadedCase {
        case_path: effective_path.to_owned(),
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
    let mut tx = pool.begin().await.map_err(map_db)?;
    let rows = sqlx::query("DELETE FROM cases WHERE repo_id=$1 AND case_path=$2")
        .bind(repo_id)
        .bind(case_path)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("case not found: {case_path}")));
    }
    // Remove case from suite case lists and inline run scopes.
    sqlx::query(
        "UPDATE suites SET cases = array_remove(cases, $2) WHERE repo_id=$1 AND $2 = ANY(cases)",
    )
    .bind(repo_id)
    .bind(case_path)
    .execute(&mut *tx)
    .await
    .map_err(map_db)?;
    sqlx::query("DELETE FROM run_cases WHERE repo_id=$1 AND case_path=$2")
        .bind(repo_id)
        .bind(case_path)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?;
    tx.commit().await.map_err(map_db)?;
    Ok(())
}

pub async fn delete_case_if_exists(pool: &PgPool, repo_id: &str, case_path: &str) -> RResult<()> {
    validate_slug_path(case_path, "case")?;
    let mut tx = pool.begin().await.map_err(map_db)?;
    let rows = sqlx::query("DELETE FROM cases WHERE repo_id=$1 AND case_path=$2")
        .bind(repo_id)
        .bind(case_path)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows > 0 {
        sqlx::query(
            "UPDATE suites SET cases = array_remove(cases, $2) WHERE repo_id=$1 AND $2 = ANY(cases)",
        )
        .bind(repo_id)
        .bind(case_path)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?;
        sqlx::query("DELETE FROM run_cases WHERE repo_id=$1 AND case_path=$2")
            .bind(repo_id)
            .bind(case_path)
            .execute(&mut *tx)
            .await
            .map_err(map_db)?;
    }
    tx.commit().await.map_err(map_db)?;
    Ok(()) // no error if not found
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert_case(
    pool: &PgPool,
    repo_id: &str,
    case_path: &str,
    title: &str,
    description: &str,
    tags: Vec<String>,
    priority: &str,
    body: &str,
    created_at: &str,
    updated_at: &str,
) -> RResult<()> {
    validate_slug_path(case_path, "case")?;
    validate_priority(priority)?;
    sqlx::query(
        "INSERT INTO cases (repo_id, case_path, title, description, tags, priority, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (repo_id, case_path) DO UPDATE SET
             title=$3, description=$4, tags=$5, priority=$6, body=$7, updated_at=$9",
    )
    .bind(repo_id)
    .bind(case_path)
    .bind(title)
    .bind(description)
    .bind(&tags)
    .bind(priority)
    .bind(body)
    .bind(created_at)
    .bind(updated_at)
    .execute(pool)
    .await
    .map_err(map_db)?;
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
    .ok_or_else(|| RepoError::NotFound(format!("suite not found: {slug}")))
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
            return Err(RepoError::NotFound(format!("case not found: {case_path}")));
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
            "suite already exists: {slug}"
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
    new_slug: Option<&str>,
) -> RResult<SuiteRow> {
    validate_slug_path(slug, "suite")?;
    let effective_slug = if let Some(ns) = new_slug {
        validate_slug_path(ns, "new_slug")?;
        if ns == slug {
            slug
        } else {
            let conflict: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM suites WHERE repo_id=$1 AND slug=$2)",
            )
            .bind(repo_id)
            .bind(ns)
            .fetch_one(pool)
            .await
            .map_err(map_db)?;
            if conflict {
                return Err(RepoError::AlreadyExists(format!(
                    "suite already exists: {ns}"
                )));
            }
            // Rename atomically: update slug and cascade to runs referencing it.
            let mut tx = pool.begin().await.map_err(map_db)?;
            let rows = sqlx::query("UPDATE suites SET slug=$3 WHERE repo_id=$1 AND slug=$2")
                .bind(repo_id)
                .bind(slug)
                .bind(ns)
                .execute(&mut *tx)
                .await
                .map_err(map_db)?
                .rows_affected();
            if rows == 0 {
                return Err(RepoError::NotFound(format!("suite not found: {slug}")));
            }
            sqlx::query("UPDATE runs SET suite=$3 WHERE repo_id=$1 AND suite=$2")
                .bind(repo_id)
                .bind(slug)
                .bind(ns)
                .execute(&mut *tx)
                .await
                .map_err(map_db)?;
            tx.commit().await.map_err(map_db)?;
            ns
        }
    } else {
        slug
    };

    let existing = get_suite(pool, repo_id, effective_slug).await?;
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
    .bind(effective_slug)
    .bind(new_name)
    .bind(&new_desc)
    .bind(&new_cases)
    .execute(pool)
    .await
    .map_err(map_db)?
    .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!(
            "suite not found: {effective_slug}"
        )));
    }

    Ok(SuiteRow {
        slug: effective_slug.to_owned(),
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
        return Err(RepoError::NotFound(format!("suite not found: {slug}")));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

pub async fn list_runs(pool: &PgPool, repo_id: &str) -> RResult<Vec<RunRow>> {
    sqlx::query_as::<_, RunRow>(
        "SELECT run_id, date, tester, status, environment, suite, commit_sha
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
        "SELECT run_id, date, tester, status, environment, suite, commit_sha
         FROM runs WHERE repo_id=$1 AND run_id=$2",
    )
    .bind(repo_id)
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(map_db)?
    .ok_or_else(|| RepoError::NotFound(format!("run not found: {run_id}")))?;

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

#[allow(clippy::too_many_arguments)]
pub async fn create_run(
    pool: &PgPool,
    repo_id: &str,
    slug: &str,
    tester: &str,
    environment: Option<String>,
    suite: Option<String>,
    inline_cases: Vec<String>,
    commit_sha: String,
) -> RResult<RunRow> {
    validate_slug_path(slug, "run slug")?;
    for case_path in &inline_cases {
        validate_slug_path(case_path, "case")?;
    }
    if !inline_cases.is_empty() && suite.as_deref().is_some_and(|s| !s.is_empty()) {
        return Err(RepoError::InvalidArg(
            "cannot specify both suite and cases — use one or the other".to_owned(),
        ));
    }
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
                    "suite not found: {suite_slug}"
                )));
            }
        }
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let run_id = format!("{today}-{slug}");

    let mut tx = pool.begin().await.map_err(map_db)?;
    let rows = sqlx::query(
        "INSERT INTO runs (repo_id, run_id, date, tester, status, environment, suite, commit_sha)
         VALUES ($1, $2, $3, $4, 'in-progress', $5, $6, $7)
         ON CONFLICT DO NOTHING",
    )
    .bind(repo_id)
    .bind(&run_id)
    .bind(&today)
    .bind(tester)
    .bind(&environment)
    .bind(&suite)
    .bind(&commit_sha)
    .execute(&mut *tx)
    .await
    .map_err(map_db)?
    .rows_affected();

    if rows == 0 {
        return Err(RepoError::AlreadyExists(format!(
            "run already exists: {run_id}"
        )));
    }

    for case_path in &inline_cases {
        sqlx::query(
            "INSERT INTO run_cases (repo_id, run_id, case_path) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        )
        .bind(repo_id)
        .bind(&run_id)
        .bind(case_path)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?;
    }
    tx.commit().await.map_err(map_db)?;

    Ok(RunRow {
        run_id,
        date: today,
        tester: tester.to_owned(),
        status: "in-progress".to_owned(),
        environment,
        suite,
        commit_sha,
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
    validate_result_status(status)?;
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
            return Err(RepoError::NotFound(format!("run not found: {run_id}")));
        }
        Some("completed" | "aborted") => {
            return Err(RepoError::ClosedRun(format!(
                "run {run_id} is closed; cannot record results"
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
        return Err(RepoError::NotFound(format!("case not found: {case_path}")));
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
    validate_finalize_status(status)?;
    validate_slug_path(run_id, "run")?;

    let current: Option<String> =
        sqlx::query_scalar("SELECT status FROM runs WHERE repo_id=$1 AND run_id=$2")
            .bind(repo_id)
            .bind(run_id)
            .fetch_optional(pool)
            .await
            .map_err(map_db)?;

    match current.as_deref() {
        None => return Err(RepoError::NotFound(format!("run not found: {run_id}"))),
        Some("completed" | "aborted") => {
            return Err(RepoError::ClosedRun(format!(
                "run {run_id} is already closed"
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
        return Err(RepoError::NotFound(format!("run not found: {run_id}")));
    }

    get_run(pool, repo_id, run_id).await.map(|r| r.meta)
}

pub async fn delete_run(pool: &PgPool, repo_id: &str, run_id: &str) -> RResult<()> {
    validate_slug_path(run_id, "run")?;
    let mut tx = pool.begin().await.map_err(map_db)?;
    sqlx::query("DELETE FROM results WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?;
    sqlx::query("DELETE FROM run_cases WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?;
    let rows = sqlx::query("DELETE FROM runs WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("run not found: {run_id}")));
    }
    tx.commit().await.map_err(map_db)?;
    Ok(())
}

pub async fn update_run(
    pool: &PgPool,
    repo_id: &str,
    run_id: &str,
    new_slug: &str,
) -> RResult<RunRow> {
    validate_slug_path(run_id, "run")?;
    validate_slug_path(new_slug, "new_slug")?;
    // run_id format: YYYY-MM-DD-{slug}. Extract date prefix (first 10 chars).
    let date_prefix = run_id.get(..10).ok_or_else(|| {
        RepoError::InvalidArg(format!(
            "run_id '{run_id}' does not start with a date prefix (YYYY-MM-DD)"
        ))
    })?;
    let new_run_id = format!("{date_prefix}-{new_slug}");
    if new_run_id == run_id {
        return get_run(pool, repo_id, run_id).await.map(|r| r.meta);
    }
    let mut tx = pool.begin().await.map_err(map_db)?;
    let conflict: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM runs WHERE repo_id=$1 AND run_id=$2)")
            .bind(repo_id)
            .bind(&new_run_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(map_db)?;
    if conflict {
        return Err(RepoError::AlreadyExists(format!(
            "run already exists: {new_run_id}"
        )));
    }
    let rows = sqlx::query("UPDATE runs SET run_id=$3 WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .bind(&new_run_id)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("run not found: {run_id}")));
    }
    // Cascade to results and run_cases atomically.
    sqlx::query("UPDATE results SET run_id=$3 WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .bind(&new_run_id)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?;
    sqlx::query("UPDATE run_cases SET run_id=$3 WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .bind(&new_run_id)
        .execute(&mut *tx)
        .await
        .map_err(map_db)?;
    tx.commit().await.map_err(map_db)?;
    get_run(pool, repo_id, &new_run_id).await.map(|r| r.meta)
}

/// Patch mutable metadata fields on an existing run (commit_sha, tester, environment).
/// Only fields wrapped in `Some` are written; `None` means "leave unchanged".
pub async fn patch_run_meta(
    pool: &PgPool,
    repo_id: &str,
    run_id: &str,
    commit_sha: Option<&str>,
    tester: Option<&str>,
    environment: Option<&str>,
) -> RResult<RunRow> {
    validate_slug_path(run_id, "run")?;
    // Verify the run exists before updating.
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM runs WHERE repo_id=$1 AND run_id=$2)")
            .bind(repo_id)
            .bind(run_id)
            .fetch_one(pool)
            .await
            .map_err(map_db)?;
    if !exists {
        return Err(RepoError::NotFound(format!("run not found: {run_id}")));
    }
    if let Some(sha) = commit_sha {
        sqlx::query("UPDATE runs SET commit_sha=$3 WHERE repo_id=$1 AND run_id=$2")
            .bind(repo_id)
            .bind(run_id)
            .bind(sha)
            .execute(pool)
            .await
            .map_err(map_db)?;
    }
    if let Some(t) = tester {
        sqlx::query("UPDATE runs SET tester=$3 WHERE repo_id=$1 AND run_id=$2")
            .bind(repo_id)
            .bind(run_id)
            .bind(t)
            .execute(pool)
            .await
            .map_err(map_db)?;
    }
    if let Some(e) = environment {
        sqlx::query("UPDATE runs SET environment=$3 WHERE repo_id=$1 AND run_id=$2")
            .bind(repo_id)
            .bind(run_id)
            .bind(e)
            .execute(pool)
            .await
            .map_err(map_db)?;
    }
    get_run(pool, repo_id, run_id).await.map(|r| r.meta)
}

/// Insert `case_paths` into the run's inline scope (ON CONFLICT DO NOTHING).
/// Only valid for inline-scoped runs; silently ignored for suite/all-cases runs.
pub async fn add_cases_to_run(
    pool: &PgPool,
    repo_id: &str,
    run_id: &str,
    case_paths: &[String],
) -> RResult<()> {
    validate_slug_path(run_id, "run")?;
    for case_path in case_paths {
        validate_slug_path(case_path, "case")?;
        sqlx::query(
            "INSERT INTO run_cases (repo_id, run_id, case_path) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        )
        .bind(repo_id)
        .bind(run_id)
        .bind(case_path)
        .execute(pool)
        .await
        .map_err(map_db)?;
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

    // Check for inline run_cases first.
    let inline: Vec<String> = sqlx::query_scalar(
        "SELECT case_path FROM run_cases WHERE repo_id=$1 AND run_id=$2 ORDER BY case_path",
    )
    .bind(repo_id)
    .bind(run_id)
    .fetch_all(pool)
    .await
    .map_err(map_db)?;

    let (scope, total) = if !inline.is_empty() {
        let inline_set: std::collections::HashSet<String> = inline.into_iter().collect();
        let all = list_cases(pool, repo_id).await?;
        let filtered: Vec<_> = all
            .into_iter()
            .filter(|c| inline_set.contains(&c.case_path))
            .collect();
        let total = filtered.len();
        (filtered, total)
    } else if let Some(ref suite_slug) = run.meta.suite {
        if suite_slug.is_empty() {
            let all = list_cases(pool, repo_id).await?;
            let total = all.len();
            (all, total)
        } else {
            match get_suite(pool, repo_id, suite_slug).await {
                Ok(s) => {
                    let suite_set: std::collections::HashSet<String> =
                        s.cases.into_iter().collect();
                    let all = list_cases(pool, repo_id).await?;
                    let filtered: Vec<_> = all
                        .into_iter()
                        .filter(|c| suite_set.contains(&c.case_path))
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

/// Returns a map from case_path to its latest result status string ("passed", "failed",
/// "blocked", "skipped", or "never") for every case in the repository.
pub async fn get_latest_statuses(
    pool: &PgPool,
    repo_id: &str,
) -> RResult<std::collections::HashMap<String, String>> {
    #[derive(sqlx::FromRow)]
    struct Row {
        case_path: String,
        status: String,
    }
    let rows = sqlx::query_as::<_, Row>(
        "WITH latest_results AS (
            SELECT DISTINCT ON (r.case_path)
                r.case_path, r.status
            FROM results r
            JOIN runs ru ON ru.repo_id = r.repo_id AND ru.run_id = r.run_id
            WHERE r.repo_id = $1
            ORDER BY r.case_path, ru.date DESC, r.run_id DESC
        )
        SELECT c.case_path, COALESCE(lr.status, 'never') AS status
        FROM cases c
        LEFT JOIN latest_results lr ON lr.case_path = c.case_path
        WHERE c.repo_id = $1",
    )
    .bind(repo_id)
    .fetch_all(pool)
    .await
    .map_err(map_db)?;
    Ok(rows.into_iter().map(|r| (r.case_path, r.status)).collect())
}

#[cfg(test)]
mod tests;
