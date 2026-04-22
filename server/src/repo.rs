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
        return Err(RepoError::AlreadyExists(format!("case already exists: {case_path}")));
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
                return Err(RepoError::AlreadyExists(format!("case already exists: {np}")));
            }
            // Rename: update case_path, fix suites referencing old path, fix results, fix run_cases.
            let rows =
                sqlx::query("UPDATE cases SET case_path=$3 WHERE repo_id=$1 AND case_path=$2")
                    .bind(repo_id)
                    .bind(case_path)
                    .bind(np)
                    .execute(pool)
                    .await
                    .map_err(map_db)?
                    .rows_affected();
            if rows == 0 {
                return Err(RepoError::NotFound(format!("case not found: {case_path}")));
            }
            // Update suite case lists: replace old path in arrays.
            sqlx::query(
                "UPDATE suites SET cases = array_replace(cases, $2, $3) WHERE repo_id=$1 AND $2 = ANY(cases)",
            )
            .bind(repo_id)
            .bind(case_path)
            .bind(np)
            .execute(pool)
            .await
            .map_err(map_db)?;
            // Update results recorded against this case.
            sqlx::query("UPDATE results SET case_path=$3 WHERE repo_id=$1 AND case_path=$2")
                .bind(repo_id)
                .bind(case_path)
                .bind(np)
                .execute(pool)
                .await
                .map_err(map_db)?;
            // Update inline run_cases scope entries.
            sqlx::query("UPDATE run_cases SET case_path=$3 WHERE repo_id=$1 AND case_path=$2")
                .bind(repo_id)
                .bind(case_path)
                .bind(np)
                .execute(pool)
                .await
                .map_err(map_db)?;
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
        return Err(RepoError::NotFound(format!("case not found: {effective_path}")));
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
    let rows = sqlx::query("DELETE FROM cases WHERE repo_id=$1 AND case_path=$2")
        .bind(repo_id)
        .bind(case_path)
        .execute(pool)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("case not found: {case_path}")));
    }
    Ok(())
}

pub async fn delete_case_if_exists(pool: &PgPool, repo_id: &str, case_path: &str) -> RResult<()> {
    validate_slug_path(case_path, "case")?;
    sqlx::query("DELETE FROM cases WHERE repo_id=$1 AND case_path=$2")
        .bind(repo_id)
        .bind(case_path)
        .execute(pool)
        .await
        .map_err(map_db)?;
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
        return Err(RepoError::AlreadyExists(format!("suite already exists: {slug}")));
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
                return Err(RepoError::AlreadyExists(format!("suite already exists: {ns}")));
            }
            // Rename: update slug and also update any runs that reference the old slug.
            let rows = sqlx::query("UPDATE suites SET slug=$3 WHERE repo_id=$1 AND slug=$2")
                .bind(repo_id)
                .bind(slug)
                .bind(ns)
                .execute(pool)
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
                .execute(pool)
                .await
                .map_err(map_db)?;
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
        return Err(RepoError::NotFound(format!("suite not found: {effective_slug}")));
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

pub async fn create_run(
    pool: &PgPool,
    repo_id: &str,
    slug: &str,
    tester: &str,
    environment: Option<String>,
    suite: Option<String>,
    inline_cases: Vec<String>,
) -> RResult<RunRow> {
    validate_slug_path(slug, "run slug")?;
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
                return Err(RepoError::NotFound(format!("suite not found: {suite_slug}")));
            }
        }
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let run_id = format!("{today}-{slug}");

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
        return Err(RepoError::AlreadyExists(format!("run already exists: {run_id}")));
    }

    if !inline_cases.is_empty() {
        for case_path in &inline_cases {
            sqlx::query(
                "INSERT INTO run_cases (repo_id, run_id, case_path) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            )
            .bind(repo_id)
            .bind(&run_id)
            .bind(case_path)
            .execute(pool)
            .await
            .map_err(map_db)?;
        }
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
            return Err(RepoError::ClosedRun(format!("run {run_id} is closed; cannot record results")));
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
            return Err(RepoError::ClosedRun(format!("run {run_id} is already closed")));
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
        return Err(RepoError::NotFound(format!("run not found: {run_id}")));
    }
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
        RepoError::InvalidArg(format!("run_id '{run_id}' does not start with a date prefix (YYYY-MM-DD)"))
    })?;
    let new_run_id = format!("{date_prefix}-{new_slug}");
    if new_run_id == run_id {
        return get_run(pool, repo_id, run_id).await.map(|r| r.meta);
    }
    let conflict: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM runs WHERE repo_id=$1 AND run_id=$2)")
            .bind(repo_id)
            .bind(&new_run_id)
            .fetch_one(pool)
            .await
            .map_err(map_db)?;
    if conflict {
        return Err(RepoError::AlreadyExists(format!("run already exists: {new_run_id}")));
    }
    let rows = sqlx::query("UPDATE runs SET run_id=$3 WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .bind(&new_run_id)
        .execute(pool)
        .await
        .map_err(map_db)?
        .rows_affected();
    if rows == 0 {
        return Err(RepoError::NotFound(format!("run not found: {run_id}")));
    }
    // Cascade to results and run_cases.
    sqlx::query("UPDATE results SET run_id=$3 WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .bind(&new_run_id)
        .execute(pool)
        .await
        .map_err(map_db)?;
    sqlx::query("UPDATE run_cases SET run_id=$3 WHERE repo_id=$1 AND run_id=$2")
        .bind(repo_id)
        .bind(run_id)
        .bind(&new_run_id)
        .execute(pool)
        .await
        .map_err(map_db)?;
    get_run(pool, repo_id, &new_run_id).await.map(|r| r.meta)
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

    #[test]
    fn slug_path_trailing_slash_returns_invalid_arg() {
        let err = validate_slug_path("auth/login/", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("empty segment"));
    }

    #[test]
    fn slug_path_dot_returns_invalid_arg() {
        let err = validate_slug_path("auth/lo.gin", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("a-z, 0-9"));
    }

    #[test]
    fn slug_path_embedded_backslash_returns_invalid_arg() {
        // Embedded '\' is not caught by starts_with('\\'), but the segment
        // character check rejects it since '\' is not a-z/0-9/hyphen/underscore.
        let err = validate_slug_path("auth\\login", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("a-z, 0-9"));
    }

    #[test]
    fn slug_path_single_dot_segment_returns_invalid_arg() {
        // "." as a path: not ".." so the double-dot check passes, but the segment
        // character validation rejects it because '.' is not a-z/0-9/hyphen/underscore.
        let err = validate_slug_path(".", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("a-z, 0-9"));
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

    // finalize_run status validation (pre-DB)
    // -----------------------------------------------------------------------

    fn lazy_pool() -> sqlx::PgPool {
        sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://user:pass@localhost/db_does_not_exist")
            .expect("lazy pool creation should not fail")
    }

    #[tokio::test]
    async fn finalize_run_invalid_status_returns_invalid_arg() {
        let err = finalize_run(&lazy_pool(), "owner/repo", "2026-01-01-smoke", "invalid")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("invalid finalize status"));
    }

    #[tokio::test]
    async fn finalize_run_invalid_run_id_returns_invalid_arg() {
        // Valid status but invalid run_id — validate_slug_path fires before DB.
        let err = finalize_run(&lazy_pool(), "owner/repo", "../escape", "completed")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // delete_case_if_exists unit tests (validation only — no DB)
    // -----------------------------------------------------------------------

    #[test]
    fn delete_case_if_exists_with_invalid_path_returns_error() {
        let err = validate_slug_path("../etc", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // record_result status validation (pre-DB)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn record_result_invalid_status_returns_invalid_arg() {
        let err = record_result(
            &lazy_pool(),
            "owner/repo",
            "2026-01-01-smoke",
            "auth/login",
            "unspecified",
            "",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("invalid result status"));
    }

    #[tokio::test]
    async fn record_result_invalid_run_id_returns_invalid_arg() {
        // Valid status but invalid run_id — validate_slug_path fires before DB.
        let err = record_result(
            &lazy_pool(),
            "owner/repo",
            "bad run",
            "auth/login",
            "passed",
            "",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn record_result_invalid_case_path_returns_invalid_arg() {
        // Valid status and run_id — validate_slug_path on case_path fires before DB.
        let err = record_result(
            &lazy_pool(),
            "owner/repo",
            "2026-01-01-smoke",
            "bad case!",
            "passed",
            "",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // get_case / create_case / update_case / delete_case / get_suite pre-DB
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn get_case_invalid_path_returns_invalid_arg() {
        let err = get_case(&lazy_pool(), "owner/repo", "../escape")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn create_case_invalid_path_returns_invalid_arg() {
        let err = create_case(
            &lazy_pool(),
            "owner/repo",
            "../escape",
            "title",
            "",
            vec![],
            "medium",
            None,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn create_case_invalid_priority_returns_invalid_arg() {
        let err = create_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            "title",
            "",
            vec![],
            "ultra",
            None,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("invalid priority"));
    }

    #[tokio::test]
    async fn create_case_valid_fields_passes_validation_and_hits_db() {
        // Valid path + valid priority + body: None — all validation passes, DB fails.
        let err = create_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            "Login Flow",
            "desc",
            vec![],
            "medium",
            None,
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_case_invalid_path_returns_invalid_arg() {
        let err = update_case(
            &lazy_pool(),
            "owner/repo",
            "bad path!",
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_case_invalid_priority_returns_invalid_arg() {
        let err = update_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            None,
            None,
            None,
            Some("turbo"),
            None,
            None,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("invalid priority"));
    }

    #[tokio::test]
    async fn update_case_no_priority_skips_validation_and_hits_db() {
        // priority: None takes the false branch of `if let Some(p) = priority`,
        // skipping validate_priority; passes pre-DB checks → DB error.
        let err = update_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn delete_case_invalid_path_returns_invalid_arg() {
        let err = delete_case(&lazy_pool(), "owner/repo", "../traversal")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_suite_invalid_slug_returns_invalid_arg() {
        let err = get_suite(&lazy_pool(), "owner/repo", "bad slug!")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // create_suite / update_suite / delete_suite / get_run / create_run /
    // delete_run pre-DB slug validation
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_suite_invalid_slug_returns_invalid_arg() {
        let err = create_suite(
            &lazy_pool(),
            "owner/repo",
            "bad slug!",
            "Name",
            None,
            vec![],
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_suite_invalid_slug_returns_invalid_arg() {
        let err = update_suite(
            &lazy_pool(),
            "owner/repo",
            "../escape",
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_suite_valid_slug_passes_validation_and_hits_db() {
        let err = update_suite(
            &lazy_pool(),
            "owner/repo",
            "regression",
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_suite_invalid_new_slug_returns_invalid_arg() {
        let err = update_suite(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            None,
            None,
            None,
            Some("bad slug!"),
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_suite_valid_new_slug_passes_validation_and_hits_db() {
        // Valid new_slug passes slug validation then hits DB (not found).
        let err = update_suite(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            None,
            None,
            None,
            Some("smoke-v2"),
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_case_invalid_new_path_returns_invalid_arg() {
        let err = update_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            None,
            None,
            None,
            None,
            None,
            Some("bad path!"),
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_case_valid_new_path_passes_validation_and_hits_db() {
        // Valid new_path passes path validation then hits DB (not found).
        let err = update_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            None,
            None,
            None,
            None,
            None,
            Some("auth/signin"),
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn delete_suite_invalid_slug_returns_invalid_arg() {
        let err = delete_suite(&lazy_pool(), "owner/repo", "bad slug!")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_run_invalid_run_id_returns_invalid_arg() {
        let result = get_run(&lazy_pool(), "owner/repo", "bad run!").await;
        assert!(result.is_err());
        if let Err(err) = result {
            assert!(matches!(err, RepoError::InvalidArg(_)));
        }
    }

    #[tokio::test]
    async fn create_run_invalid_slug_returns_invalid_arg() {
        let err = create_run(
            &lazy_pool(),
            "owner/repo",
            "bad slug!",
            "tester",
            None,
            None,
            vec![],
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn create_run_invalid_suite_slug_returns_invalid_arg() {
        // Valid run slug but invalid suite slug — validate_slug_path fires before DB.
        let err = create_run(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            "tester",
            None,
            Some("bad suite!".to_owned()),
            vec![],
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn create_run_empty_suite_string_skips_validation_and_hits_db() {
        // suite: Some("") hits the `if !suite_slug.is_empty()` false branch,
        // skipping validate_slug_path entirely; passes pre-DB checks → DB error.
        let err = create_run(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            "tester",
            None,
            Some("".to_owned()),
            vec![],
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn delete_run_invalid_run_id_returns_invalid_arg() {
        let err = delete_run(&lazy_pool(), "owner/repo", "bad run!")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_pending_cases_invalid_run_id_returns_invalid_arg() {
        let err = get_pending_cases(&lazy_pool(), "owner/repo", "bad run!")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // validate_suite_cases: invalid case path fires before DB
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_run_no_suite_passes_validation_and_hits_db() {
        // suite: None — outer `if let Some(ref suite_slug) = suite` is false, skipping
        // all suite validation; passes pre-DB checks → DB error.
        let err = create_run(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            "tester",
            None,
            None,
            vec![],
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn create_run_valid_suite_slug_passes_validation_and_hits_db() {
        // Valid run slug + valid suite slug — passes validate_slug_path for both,
        // then fails at the DB EXISTS check for the suite.
        let err = create_run(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            "tester",
            None,
            Some("regression".to_owned()),
            vec![],
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn record_result_valid_inputs_passes_validation_and_hits_db() {
        // All three validations pass (valid status, run_id, case_path) → DB error.
        let err = record_result(
            &lazy_pool(),
            "owner/repo",
            "2026-04-21-smoke",
            "auth/login",
            "passed",
            "",
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn finalize_run_valid_inputs_passes_validation_and_hits_db() {
        // Both validations pass (valid status, run_id) → DB error.
        let err = finalize_run(&lazy_pool(), "owner/repo", "2026-04-21-smoke", "completed")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn create_suite_invalid_case_path_in_cases_returns_invalid_arg() {
        // Valid slug but an invalid case path in the list — validate_slug_path fires in
        // validate_suite_cases before the first DB query.
        let err = create_suite(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            "Smoke Tests",
            None,
            vec!["bad path!".to_owned()],
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_case_valid_path_passes_validation_and_hits_db() {
        let err = get_case(&lazy_pool(), "owner/repo", "auth/login")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn delete_case_valid_path_passes_validation_and_hits_db() {
        let err = delete_case(&lazy_pool(), "owner/repo", "auth/login")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_suite_valid_slug_passes_validation_and_hits_db() {
        let err = get_suite(&lazy_pool(), "owner/repo", "regression")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn create_suite_empty_cases_skips_case_validation_and_hits_db() {
        // cases: vec![] — validate_suite_cases loop body never executes;
        // passes straight to INSERT → DB error.
        let err = create_suite(
            &lazy_pool(),
            "owner/repo",
            "smoke",
            "Smoke Tests",
            None,
            vec![],
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn delete_suite_valid_slug_passes_validation_and_hits_db() {
        let err = delete_suite(&lazy_pool(), "owner/repo", "regression")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_run_valid_run_id_passes_validation_and_hits_db() {
        let err = get_run(&lazy_pool(), "owner/repo", "2026-04-21-smoke")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn delete_run_valid_run_id_passes_validation_and_hits_db() {
        let err = delete_run(&lazy_pool(), "owner/repo", "2026-04-21-smoke")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_pending_cases_valid_run_id_passes_validation_and_hits_db() {
        let err = get_pending_cases(&lazy_pool(), "owner/repo", "2026-04-21-smoke")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // list_* functions — no validation, always hit the DB
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn list_cases_returns_db_error_when_no_connection() {
        let err = list_cases(&lazy_pool(), "owner/repo").await.unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn list_suites_returns_db_error_when_no_connection() {
        let err = list_suites(&lazy_pool(), "owner/repo").await.unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn list_runs_returns_db_error_when_no_connection() {
        let err = list_runs(&lazy_pool(), "owner/repo").await.unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // upsert_case unit tests (validation only — no DB)
    // -----------------------------------------------------------------------

    #[test]
    fn upsert_case_with_invalid_priority_returns_error() {
        let err = validate_priority("critical").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("critical"));
    }

    #[test]
    fn upsert_case_with_invalid_path_returns_error() {
        let err = validate_slug_path("", "case").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("case path is empty"));
    }

    // -----------------------------------------------------------------------
    // validate_result_status
    // -----------------------------------------------------------------------

    #[test]
    fn result_status_passed_is_valid() {
        assert!(validate_result_status("passed").is_ok());
    }

    #[test]
    fn result_status_failed_is_valid() {
        assert!(validate_result_status("failed").is_ok());
    }

    #[test]
    fn result_status_blocked_is_valid() {
        assert!(validate_result_status("blocked").is_ok());
    }

    #[test]
    fn result_status_skipped_is_valid() {
        assert!(validate_result_status("skipped").is_ok());
    }

    #[test]
    fn result_status_invalid_returns_invalid_arg() {
        let err = validate_result_status("pending").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("pending"));
    }

    #[test]
    fn result_status_empty_returns_invalid_arg() {
        assert!(matches!(
            validate_result_status("").unwrap_err(),
            RepoError::InvalidArg(_)
        ));
    }

    #[test]
    fn result_status_uppercase_returns_invalid_arg() {
        assert!(matches!(
            validate_result_status("Passed").unwrap_err(),
            RepoError::InvalidArg(_)
        ));
    }

    // -----------------------------------------------------------------------
    // validate_finalize_status
    // -----------------------------------------------------------------------

    #[test]
    fn finalize_status_completed_is_valid() {
        assert!(validate_finalize_status("completed").is_ok());
    }

    #[test]
    fn finalize_status_aborted_is_valid() {
        assert!(validate_finalize_status("aborted").is_ok());
    }

    #[test]
    fn finalize_status_in_progress_returns_invalid_arg() {
        let err = validate_finalize_status("in-progress").unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("in-progress"));
    }

    #[test]
    fn finalize_status_empty_returns_invalid_arg() {
        assert!(matches!(
            validate_finalize_status("").unwrap_err(),
            RepoError::InvalidArg(_)
        ));
    }

    // -----------------------------------------------------------------------
    // delete_case_if_exists / upsert_case / get_coverage_report (pre-DB)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn delete_case_if_exists_invalid_path_returns_invalid_arg() {
        let err = delete_case_if_exists(&lazy_pool(), "owner/repo", "../escape")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn delete_case_if_exists_valid_path_passes_validation_and_hits_db() {
        let err = delete_case_if_exists(&lazy_pool(), "owner/repo", "auth/login")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn upsert_case_invalid_path_returns_invalid_arg() {
        let err = upsert_case(
            &lazy_pool(),
            "owner/repo",
            "../escape",
            "title",
            "",
            vec![],
            "medium",
            "",
            "2026-01-01",
            "2026-01-01",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn upsert_case_invalid_priority_returns_invalid_arg() {
        let err = upsert_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            "title",
            "",
            vec![],
            "critical",
            "",
            "2026-01-01",
            "2026-01-01",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
        assert!(err.to_string().contains("critical"));
    }

    #[tokio::test]
    async fn upsert_case_valid_inputs_passes_validation_and_hits_db() {
        let err = upsert_case(
            &lazy_pool(),
            "owner/repo",
            "auth/login",
            "Login",
            "",
            vec![],
            "high",
            "",
            "2026-01-01",
            "2026-01-01",
        )
        .await
        .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn get_coverage_report_returns_db_error_when_no_connection() {
        let err = get_coverage_report(&lazy_pool(), "owner/repo")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    // -----------------------------------------------------------------------
    // DB tests — require DATABASE_URL; run with:
    //   DATABASE_URL=postgres://ameliso:ameliso@localhost/ameliso \
    //     cargo test -p ameliso-server -- --include-ignored
    // -----------------------------------------------------------------------

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn create_and_get_case(pool: PgPool) {
        let repo = "test-repo";
        let case = create_case(&pool, repo, "auth/login", "Login", "", vec![], "high", None)
            .await
            .unwrap();
        assert_eq!(case.case_path, "auth/login");
        assert_eq!(case.priority, "high");
        assert!(!case.body.is_empty());

        let fetched = get_case(&pool, repo, "auth/login").await.unwrap();
        assert_eq!(fetched.title, "Login");
    }

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn create_case_duplicate_returns_already_exists(pool: PgPool) {
        let repo = "test-repo";
        create_case(&pool, repo, "auth/login", "A", "", vec![], "low", None)
            .await
            .unwrap();
        let err = create_case(&pool, repo, "auth/login", "B", "", vec![], "low", None)
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::AlreadyExists(_)));
    }

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn get_case_not_found_returns_not_found(pool: PgPool) {
        let err = get_case(&pool, "repo", "missing/case").await.unwrap_err();
        assert!(matches!(err, RepoError::NotFound(_)));
    }

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn delete_case_removes_it(pool: PgPool) {
        let repo = "test-repo";
        create_case(&pool, repo, "x/y", "T", "", vec![], "medium", None)
            .await
            .unwrap();
        delete_case(&pool, repo, "x/y").await.unwrap();
        let err = get_case(&pool, repo, "x/y").await.unwrap_err();
        assert!(matches!(err, RepoError::NotFound(_)));
    }

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn list_cases_returns_all_for_repo(pool: PgPool) {
        let repo = "test-repo";
        create_case(&pool, repo, "a/b", "A", "", vec![], "low", None)
            .await
            .unwrap();
        create_case(&pool, repo, "c/d", "C", "", vec![], "high", None)
            .await
            .unwrap();
        let cases = list_cases(&pool, repo).await.unwrap();
        assert_eq!(cases.len(), 2);
    }

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn create_and_finalize_run(pool: PgPool) {
        let repo = "test-repo";
        let run = create_run(&pool, repo, "sprint-1", "alice", None, None, vec![])
            .await
            .unwrap();
        assert_eq!(run.status, "in-progress");

        let finalized = finalize_run(&pool, repo, &run.run_id, "completed")
            .await
            .unwrap();
        assert_eq!(finalized.status, "completed");
    }

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn record_result_on_closed_run_returns_closed_run(pool: PgPool) {
        let repo = "test-repo";
        create_case(&pool, repo, "a/b", "A", "", vec![], "low", None)
            .await
            .unwrap();
        let run = create_run(&pool, repo, "sprint-2", "", None, None, vec![])
            .await
            .unwrap();
        finalize_run(&pool, repo, &run.run_id, "aborted")
            .await
            .unwrap();

        let err = record_result(&pool, repo, &run.run_id, "a/b", "passed", "")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::ClosedRun(_)));
    }

    #[tokio::test]
    async fn update_run_invalid_run_id_returns_invalid_arg() {
        let err = update_run(&lazy_pool(), "owner/repo", "bad run!", "smoke-v2")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_run_invalid_new_slug_returns_invalid_arg() {
        let err = update_run(&lazy_pool(), "owner/repo", "2026-01-01-smoke", "bad slug!")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_run_short_run_id_returns_invalid_arg() {
        // run_id shorter than 10 chars — date prefix extraction fails.
        let err = update_run(&lazy_pool(), "owner/repo", "short", "smoke-v2")
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }

    #[tokio::test]
    async fn update_run_valid_args_passes_validation_and_hits_db() {
        // Valid run_id + new_slug pass all validation → hits DB (no connection → DB error).
        let err = update_run(&lazy_pool(), "owner/repo", "2026-01-01-smoke", "smoke-v2")
            .await
            .unwrap_err();
        assert!(!matches!(err, RepoError::InvalidArg(_)));
    }

    #[sqlx::test]
    #[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
    async fn suite_create_list_delete(pool: PgPool) {
        let repo = "test-repo";
        create_case(&pool, repo, "a/b", "A", "", vec![], "low", None)
            .await
            .unwrap();
        create_suite(&pool, repo, "smoke", "Smoke", None, vec!["a/b".to_owned()])
            .await
            .unwrap();

        let suites = list_suites(&pool, repo).await.unwrap();
        assert_eq!(suites.len(), 1);
        assert_eq!(suites[0].slug, "smoke");

        delete_suite(&pool, repo, "smoke").await.unwrap();
        assert!(list_suites(&pool, repo).await.unwrap().is_empty());
    }
}
