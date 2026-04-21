/// File-system operations against a controlled repository.
///
/// A controlled repo has this layout (from REPO_STRUCTURE.md):
///   cases/{category...}/{slug}.md   — test case files
///   suites/{slug}.yaml              — suite definitions
///   runs/{YYYY-MM-DD}-{slug}/
///     run.yaml                      — run metadata
///     results/{category...}/{slug}.md — per-case results
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result as AResult};
use chrono::Local;
use serde::{Deserialize, Serialize};
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

// ---------------------------------------------------------------------------
// On-disk formats
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseFm {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

fn default_priority() -> String {
    "medium".to_owned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultFm {
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunYaml {
    pub id: String,
    pub date: String,
    pub tester: String,
    pub status: String,
    #[serde(default)]
    pub environment: Option<String>,
    #[serde(default)]
    pub suite: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuiteYaml {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub cases: Vec<String>,
}

// ---------------------------------------------------------------------------
// Loaded structures (with path context)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct LoadedCase {
    pub fm: CaseFm,
    pub body: String,
    /// Path relative to cases/  e.g. "auth/user-login"
    pub case_path: String,
}

#[derive(Debug, Clone)]
pub struct LoadedResult {
    pub fm: ResultFm,
    pub notes: String,
    /// Matches LoadedCase::case_path
    pub case_path: String,
}

#[derive(Debug, Clone)]
pub struct LoadedRun {
    pub meta: RunYaml,
    pub results: Vec<LoadedResult>,
    #[allow(dead_code)]
    pub slug: String,
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

fn split_fm(content: &str) -> AResult<(&str, &str)> {
    if !content.starts_with("---") {
        bail!("file must start with '---' frontmatter delimiter");
    }
    let after = &content[3..];
    let close = after
        .find("\n---")
        .context("missing closing '---' delimiter")?;
    let yaml = after[..close].trim_start_matches('\n');
    let body = after[close + 4..].trim_start_matches('\n');
    Ok((yaml, body))
}

fn parse_fm<T: serde::de::DeserializeOwned>(content: &str) -> AResult<(T, String)> {
    let (yaml, body) = split_fm(content)?;
    let fm: T = serde_yaml::from_str(yaml).context("invalid YAML frontmatter")?;
    Ok((fm, body.to_owned()))
}

fn write_case_file(path: &Path, fm: &CaseFm, body: &str) -> AResult<()> {
    let yaml = serde_yaml::to_string(fm).context("serializing case frontmatter")?;
    let content = format!("---\n{}---\n\n{}", yaml, body);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content).with_context(|| format!("writing {}", path.display()))
}

fn write_result_file(path: &Path, status: &str, notes: &str) -> AResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = format!("---\nstatus: {}\n---\n\n{}", status, notes);
    std::fs::write(path, content).with_context(|| format!("writing {}", path.display()))
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

pub fn cases_dir(repo: &Path) -> PathBuf {
    repo.join("cases")
}

pub fn runs_dir(repo: &Path) -> PathBuf {
    repo.join("runs")
}

pub fn suites_dir(repo: &Path) -> PathBuf {
    repo.join("suites")
}

fn case_file_path(repo: &Path, case_path: &str) -> PathBuf {
    repo.join("cases").join(format!("{}.md", case_path))
}

fn run_dir_path(repo: &Path, run_id: &str) -> PathBuf {
    repo.join("runs").join(run_id)
}

fn result_file_path(repo: &Path, run_id: &str, case_path: &str) -> PathBuf {
    repo.join("runs")
        .join(run_id)
        .join("results")
        .join(format!("{}.md", case_path))
}

/// Walk a directory recursively, yielding all `.md` files.
fn walk_md(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if !dir.exists() {
        return out;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut paths: Vec<_> = entries.filter_map(|e| e.ok()).map(|e| e.path()).collect();
        paths.sort();
        for path in paths {
            if path.is_dir() {
                out.extend(walk_md(&path));
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                out.push(path);
            }
        }
    }
    out
}

/// Convert an absolute file path to a case_path (relative to cases/, no extension).
fn to_case_path(cases_dir: &Path, file: &Path) -> Option<String> {
    file.strip_prefix(cases_dir).ok().and_then(|rel| {
        rel.with_extension("")
            .to_str()
            .map(|s| s.replace('\\', "/"))
    })
}

// ---------------------------------------------------------------------------
// Validation helpers
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
                "invalid {} path '{}': contains empty segment (double slash?)",
                kind, path
            )));
        }
        if !segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(RepoError::InvalidArg(format!(
                "invalid {} path '{}': each segment must contain only a-z, 0-9, hyphens, underscores",
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
// Public API
// ---------------------------------------------------------------------------

pub fn list_cases(repo: &Path) -> RResult<Vec<LoadedCase>> {
    let dir = cases_dir(repo);
    let mut cases = Vec::new();
    for file in walk_md(&dir) {
        let content = std::fs::read_to_string(&file)
            .with_context(|| format!("reading {}", file.display()))?;
        match parse_fm::<CaseFm>(&content) {
            Ok((fm, body)) => {
                if let Some(case_path) = to_case_path(&dir, &file) {
                    cases.push(LoadedCase {
                        fm,
                        body,
                        case_path,
                    });
                }
            }
            Err(_) => continue,
        }
    }
    Ok(cases)
}

pub fn get_case(repo: &Path, case_path: &str) -> RResult<LoadedCase> {
    validate_slug_path(case_path, "case")?;
    let file = case_file_path(repo, case_path);
    let content = std::fs::read_to_string(&file)
        .map_err(|_| RepoError::NotFound(format!("case not found: {}", case_path)))?;
    let (fm, body) = parse_fm::<CaseFm>(&content)?;
    Ok(LoadedCase {
        fm,
        body,
        case_path: case_path.to_owned(),
    })
}

pub fn create_case(
    repo: &Path,
    case_path: &str,
    title: &str,
    description: &str,
    tags: Vec<String>,
    priority: &str,
    body: Option<&str>,
) -> RResult<LoadedCase> {
    validate_slug_path(case_path, "case")?;
    validate_priority(priority)?;
    let file = case_file_path(repo, case_path);
    if file.exists() {
        return Err(RepoError::AlreadyExists(format!(
            "case already exists: {}",
            case_path
        )));
    }
    let today = Local::now().format("%Y-%m-%d").to_string();
    let fm = CaseFm {
        title: title.to_owned(),
        description: description.to_owned(),
        tags,
        priority: priority.to_owned(),
        created_at: today.clone(),
        updated_at: today,
    };
    let body =
        body.unwrap_or("## Prerequisites\n\n- \n\n## Steps\n\n1. \n\n## Expected Result\n\n\n");
    write_case_file(&file, &fm, body)?;
    Ok(LoadedCase {
        fm,
        body: body.to_owned(),
        case_path: case_path.to_owned(),
    })
}

pub fn update_case(
    repo: &Path,
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
    let file = case_file_path(repo, case_path);
    let content = std::fs::read_to_string(&file)
        .map_err(|_| RepoError::NotFound(format!("case not found: {}", case_path)))?;
    let (mut fm, existing_body) = parse_fm::<CaseFm>(&content)?;
    if let Some(t) = title {
        fm.title = t.to_owned();
    }
    if let Some(d) = description {
        fm.description = d.to_owned();
    }
    if let Some(t) = tags {
        fm.tags = t;
    }
    if let Some(p) = priority {
        fm.priority = p.to_owned();
    }
    fm.updated_at = Local::now().format("%Y-%m-%d").to_string();
    let body = body.unwrap_or(&existing_body);
    write_case_file(&file, &fm, body)?;
    Ok(LoadedCase {
        fm,
        body: body.to_owned(),
        case_path: case_path.to_owned(),
    })
}

pub fn delete_case(repo: &Path, case_path: &str) -> RResult<()> {
    validate_slug_path(case_path, "case")?;
    let file = case_file_path(repo, case_path);
    if !file.exists() {
        return Err(RepoError::NotFound(format!(
            "case not found: {}",
            case_path
        )));
    }
    std::fs::remove_file(&file).with_context(|| format!("deleting {}", file.display()))?;
    Ok(())
}

pub fn list_runs(repo: &Path) -> RResult<Vec<RunYaml>> {
    let dir = runs_dir(repo);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut runs = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .context("reading runs dir")?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();
    // newest first
    entries.sort_by_key(|e| std::cmp::Reverse(e.file_name()));
    for entry in entries {
        let yaml_path = entry.path().join("run.yaml");
        if !yaml_path.exists() {
            continue;
        }
        let content = std::fs::read_to_string(&yaml_path)
            .with_context(|| format!("reading {}", yaml_path.display()))?;
        match serde_yaml::from_str::<RunYaml>(&content) {
            Ok(run) => runs.push(run),
            Err(_) => continue,
        }
    }
    Ok(runs)
}

pub fn get_run(repo: &Path, run_id: &str) -> RResult<LoadedRun> {
    validate_slug_path(run_id, "run")?;
    let dir = run_dir_path(repo, run_id);
    if !dir.exists() {
        return Err(RepoError::NotFound(format!("run not found: {}", run_id)));
    }
    let yaml_path = dir.join("run.yaml");
    let content = std::fs::read_to_string(&yaml_path)
        .with_context(|| format!("reading run.yaml for {}", run_id))?;
    let meta: RunYaml = serde_yaml::from_str(&content).context("parsing run.yaml")?;

    let results_dir = dir.join("results");
    let mut results = Vec::new();
    for file in walk_md(&results_dir) {
        let rc = std::fs::read_to_string(&file)
            .with_context(|| format!("reading {}", file.display()))?;
        if let Ok((fm, notes)) = parse_fm::<ResultFm>(&rc) {
            if let Some(case_path) = to_case_path(&results_dir, &file) {
                results.push(LoadedResult {
                    fm,
                    notes,
                    case_path,
                });
            }
        }
    }

    Ok(LoadedRun {
        meta,
        results,
        slug: run_id.to_owned(),
    })
}

pub fn create_run(
    repo: &Path,
    slug: &str,
    tester: &str,
    environment: Option<String>,
    suite: Option<String>,
) -> RResult<(RunYaml, String)> {
    validate_slug_path(slug, "run slug")?;
    if let Some(ref suite_slug) = suite {
        if !suite_slug.is_empty() {
            validate_slug_path(suite_slug, "suite")?;
            let suite_file = suites_dir(repo).join(format!("{}.yaml", suite_slug));
            if !suite_file.exists() {
                return Err(RepoError::NotFound(format!(
                    "suite not found: {}",
                    suite_slug
                )));
            }
        }
    }
    let today = Local::now().format("%Y-%m-%d").to_string();
    let run_id = format!("{}-{}", today, slug);
    let dir = run_dir_path(repo, &run_id);
    if dir.exists() {
        return Err(RepoError::AlreadyExists(format!(
            "run already exists: {}",
            run_id
        )));
    }
    std::fs::create_dir_all(&dir).context("creating run directory")?;
    let meta = RunYaml {
        id: run_id.clone(),
        date: today,
        tester: tester.to_owned(),
        status: "in-progress".to_owned(),
        environment,
        suite,
    };
    let yaml = serde_yaml::to_string(&meta).context("serializing run.yaml")?;
    std::fs::write(dir.join("run.yaml"), yaml).context("writing run.yaml")?;
    let dir_path = format!("runs/{}", run_id);
    Ok((meta, dir_path))
}

/// Returns `(result, previous_status)` where `previous_status` is `Some(s)` if a prior result was overwritten.
pub fn record_result(
    repo: &Path,
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
    let run_dir = run_dir_path(repo, run_id);
    if !run_dir.exists() {
        return Err(RepoError::NotFound(format!("run not found: {}", run_id)));
    }
    let yaml_path = run_dir.join("run.yaml");
    let content = std::fs::read_to_string(&yaml_path)
        .with_context(|| format!("reading run.yaml for {}", run_id))?;
    let meta: RunYaml = serde_yaml::from_str(&content).context("parsing run.yaml")?;
    if matches!(meta.status.as_str(), "completed" | "aborted") {
        return Err(RepoError::ClosedRun(format!(
            "run {} is {}; cannot record results in a closed run",
            run_id, meta.status
        )));
    }

    let case_file = case_file_path(repo, case_path);
    if !case_file.exists() {
        return Err(RepoError::NotFound(format!(
            "case not found: {}",
            case_path
        )));
    }
    let result_file = result_file_path(repo, run_id, case_path);
    let previous_status: Option<String> = if result_file.exists() {
        std::fs::read_to_string(&result_file)
            .ok()
            .and_then(|c| parse_fm::<ResultFm>(&c).ok())
            .map(|(fm, _)| fm.status)
    } else {
        None
    };
    write_result_file(&result_file, status, notes)?;
    Ok((
        LoadedResult {
            fm: ResultFm {
                status: status.to_owned(),
            },
            notes: notes.to_owned(),
            case_path: case_path.to_owned(),
        },
        previous_status,
    ))
}

pub fn finalize_run(repo: &Path, run_id: &str, status: &str) -> RResult<RunYaml> {
    if !matches!(status, "completed" | "aborted") {
        return Err(RepoError::InvalidArg(format!(
            "invalid finalize status '{}'; must be one of: completed, aborted",
            status
        )));
    }
    validate_slug_path(run_id, "run")?;
    let dir = run_dir_path(repo, run_id);
    if !dir.exists() {
        return Err(RepoError::NotFound(format!("run not found: {}", run_id)));
    }
    let yaml_path = dir.join("run.yaml");
    let content = std::fs::read_to_string(&yaml_path).context("reading run.yaml")?;
    let mut meta: RunYaml = serde_yaml::from_str(&content).context("parsing run.yaml")?;
    if matches!(meta.status.as_str(), "completed" | "aborted") {
        return Err(RepoError::ClosedRun(format!(
            "run {} is already {}",
            run_id, meta.status
        )));
    }
    meta.status = status.to_owned();
    let yaml = serde_yaml::to_string(&meta).context("serializing run.yaml")?;
    std::fs::write(yaml_path, yaml).context("writing run.yaml")?;
    Ok(meta)
}

/// Return (pending_case_paths, total_in_scope).
/// Scope = suite cases if run has a suite set; otherwise all cases in repo.
pub fn get_pending_cases(repo: &Path, run_id: &str) -> RResult<(Vec<LoadedCase>, usize)> {
    validate_slug_path(run_id, "run")?;
    let run = get_run(repo, run_id)?;
    let recorded: std::collections::HashSet<String> =
        run.results.iter().map(|r| r.case_path.clone()).collect();

    // Build scope as LoadedCase objects for rich metadata.
    let all_cases = list_cases(repo)?;
    let scope: Vec<LoadedCase> = if let Some(ref suite_slug) = run.meta.suite {
        if suite_slug.is_empty() {
            all_cases
        } else {
            match get_suite(repo, suite_slug) {
                Ok(s) => {
                    let suite_set: std::collections::HashSet<&str> =
                        s.cases.iter().map(|p| p.as_str()).collect();
                    all_cases
                        .into_iter()
                        .filter(|c| suite_set.contains(c.case_path.as_str()))
                        .collect()
                }
                Err(RepoError::NotFound(_)) => all_cases,
                Err(e) => return Err(e),
            }
        }
    } else {
        all_cases
    };

    let total = scope.len();
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
        priority_rank(&a.fm.priority)
            .cmp(&priority_rank(&b.fm.priority))
            .then_with(|| a.case_path.cmp(&b.case_path))
    });
    Ok((pending, total))
}

pub fn list_suites(repo: &Path) -> RResult<Vec<(String, SuiteYaml)>> {
    let dir = suites_dir(repo);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .context("reading suites dir")?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("yaml"))
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_owned();
        let content = std::fs::read_to_string(&path).context("reading suite file")?;
        if let Ok(suite) = serde_yaml::from_str::<SuiteYaml>(&content) {
            out.push((slug, suite));
        }
    }
    Ok(out)
}

pub fn get_suite(repo: &Path, slug: &str) -> RResult<SuiteYaml> {
    validate_slug_path(slug, "suite")?;
    let path = suites_dir(repo).join(format!("{}.yaml", slug));
    let content = std::fs::read_to_string(&path)
        .map_err(|_| RepoError::NotFound(format!("suite not found: {}", slug)))?;
    Ok(serde_yaml::from_str(&content).context("parsing suite yaml")?)
}

fn validate_suite_cases(repo: &Path, cases: &[String]) -> RResult<()> {
    for case_path in cases {
        validate_slug_path(case_path, "case")?;
        let file = case_file_path(repo, case_path);
        if !file.exists() {
            return Err(RepoError::NotFound(format!(
                "case not found: {}",
                case_path
            )));
        }
    }
    Ok(())
}

pub fn create_suite(
    repo: &Path,
    slug: &str,
    name: &str,
    description: Option<String>,
    cases: Vec<String>,
) -> RResult<SuiteYaml> {
    validate_slug_path(slug, "suite")?;
    validate_suite_cases(repo, &cases)?;
    let dir = suites_dir(repo);
    std::fs::create_dir_all(&dir).context("creating suites directory")?;
    let path = dir.join(format!("{}.yaml", slug));
    if path.exists() {
        return Err(RepoError::AlreadyExists(format!(
            "suite already exists: {}",
            slug
        )));
    }
    let suite = SuiteYaml {
        name: name.to_owned(),
        description,
        cases,
    };
    let yaml = serde_yaml::to_string(&suite).context("serializing suite")?;
    std::fs::write(path, yaml).context("writing suite file")?;
    Ok(suite)
}

pub fn delete_suite(repo: &Path, slug: &str) -> RResult<()> {
    validate_slug_path(slug, "suite")?;
    let path = suites_dir(repo).join(format!("{}.yaml", slug));
    if !path.exists() {
        return Err(RepoError::NotFound(format!("suite not found: {}", slug)));
    }
    std::fs::remove_file(&path).with_context(|| format!("deleting suite {}", slug))?;
    Ok(())
}

pub fn update_suite(
    repo: &Path,
    slug: &str,
    name: Option<&str>,
    description: Option<Option<String>>,
    cases: Option<Vec<String>>,
) -> RResult<SuiteYaml> {
    validate_slug_path(slug, "suite")?;
    let path = suites_dir(repo).join(format!("{}.yaml", slug));
    if !path.exists() {
        return Err(RepoError::NotFound(format!("suite not found: {}", slug)));
    }
    let content = std::fs::read_to_string(&path).context("reading suite file")?;
    let mut existing: SuiteYaml = serde_yaml::from_str(&content).context("parsing suite yaml")?;
    if let Some(n) = name {
        existing.name = n.to_owned();
    }
    if let Some(d) = description {
        existing.description = d;
    }
    if let Some(c) = cases {
        validate_suite_cases(repo, &c)?;
        existing.cases = c;
    }
    let yaml = serde_yaml::to_string(&existing).context("serializing suite")?;
    std::fs::write(path, yaml).context("writing suite file")?;
    Ok(existing)
}
