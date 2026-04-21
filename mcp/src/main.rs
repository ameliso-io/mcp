use std::path::PathBuf;

use ameliso_server::{git, repo};
use rmcp::schemars;
use rmcp::transport::stdio;
use rmcp::{handler::server::wrapper::Parameters, tool, tool_router, ServiceExt};
use serde::Deserialize;

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListCasesRequest {
    #[schemars(description = "Absolute path to the controlled test repository")]
    repo_path: String,
    #[schemars(description = "Comma-separated tag filter (optional)")]
    tags: Option<String>,
    #[schemars(
        description = "Full-text query against title, description, body, and path (optional)"
    )]
    query: Option<String>,
    #[schemars(description = "Filter by priority: low | medium | high (optional)")]
    priority: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetCaseRequest {
    repo_path: String,
    #[schemars(description = "Case path, e.g. auth/login")]
    case_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateCaseRequest {
    repo_path: String,
    case_path: String,
    title: String,
    description: String,
    #[schemars(description = "Comma-separated tags (optional)")]
    tags: Option<String>,
    #[schemars(description = "low | medium | high (default: medium)")]
    priority: Option<String>,
    #[schemars(
        description = "Full markdown body (steps, expected results). Defaults to a template."
    )]
    body: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RepoPathRequest {
    repo_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListRunsRequest {
    repo_path: String,
    #[schemars(
        description = "Optional status filter: in-progress | completed | aborted. Omit to return all."
    )]
    status: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateRunRequest {
    repo_path: String,
    #[schemars(description = "Short slug, e.g. smoke or regression")]
    slug: String,
    tester: Option<String>,
    environment: Option<String>,
    suite: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RecordResultRequest {
    repo_path: String,
    run_id: String,
    case_path: String,
    #[schemars(description = "passed | failed | blocked | skipped")]
    status: String,
    notes: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct FinalizeRunRequest {
    repo_path: String,
    run_id: String,
    #[schemars(description = "completed | aborted")]
    status: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateCaseRequest {
    repo_path: String,
    case_path: String,
    title: String,
    description: String,
    #[schemars(description = "Comma-separated tags (optional)")]
    tags: Option<String>,
    #[schemars(description = "low | medium | high (default: medium)")]
    priority: Option<String>,
    #[schemars(
        description = "Replace the full markdown body. If omitted, existing body is preserved."
    )]
    body: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RunIdRequest {
    repo_path: String,
    run_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SuiteSlugRequest {
    repo_path: String,
    slug: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateSuiteRequest {
    repo_path: String,
    slug: String,
    name: String,
    description: Option<String>,
    #[schemars(description = "Comma-separated case paths")]
    cases: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct AffectedRequest {
    repo_path: String,
    #[schemars(description = "Git ref to compare from (default: last run commit)")]
    since_ref: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CoverageReportRequest {
    repo_path: String,
    #[schemars(
        description = "Optional status filter: never | passed | failed | blocked | skipped. Omit to return all."
    )]
    status_filter: Option<String>,
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct AmelisoMcp;

#[tool_router(server_handler)]
impl AmelisoMcp {
    #[tool(
        description = "List test cases in a repo. Filter by tags, priority, or full-text query."
    )]
    fn list_cases(&self, Parameters(req): Parameters<ListCasesRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let mut cases = match repo::list_cases(&repo) {
            Ok(c) => c,
            Err(e) => return format!("error: {e}"),
        };
        if let Some(t) = &req.tags {
            let filter: Vec<&str> = t.split(',').map(|s| s.trim()).collect();
            cases.retain(|c| {
                filter
                    .iter()
                    .all(|f| c.fm.tags.iter().any(|ct| ct.eq_ignore_ascii_case(f)))
            });
        }
        if let Some(q) = &req.query {
            let q = q.to_lowercase();
            cases.retain(|c| {
                c.fm.title.to_lowercase().contains(&q)
                    || c.fm.description.to_lowercase().contains(&q)
                    || c.body.to_lowercase().contains(&q)
                    || c.case_path.to_lowercase().contains(&q)
            });
        }
        if let Some(p) = &req.priority {
            cases.retain(|c| c.fm.priority.eq_ignore_ascii_case(p));
        }
        if cases.is_empty() {
            return "No cases found.".to_owned();
        }
        cases
            .iter()
            .map(|c| {
                format!(
                    "[{}] {} — {} (priority: {}{})",
                    c.case_path,
                    c.fm.title,
                    c.fm.description,
                    c.fm.priority,
                    if c.fm.tags.is_empty() {
                        String::new()
                    } else {
                        format!(", tags: {}", c.fm.tags.join(", "))
                    }
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[tool(
        description = "Get full details of a single test case including steps and expected result."
    )]
    fn get_case(&self, Parameters(req): Parameters<GetCaseRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::get_case(&repo, &req.case_path) {
            Ok(c) => format!(
                "path: {}\ntitle: {}\ndescription: {}\ntags: {}\npriority: {}\ncreated_at: {}\nupdated_at: {}\n\n{}",
                c.case_path,
                c.fm.title,
                c.fm.description,
                c.fm.tags.join(", "),
                c.fm.priority,
                c.fm.created_at,
                c.fm.updated_at,
                c.body
            ),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Create a new test case. case_path uses slash-separated identifiers, e.g. auth/login."
    )]
    fn create_case(&self, Parameters(req): Parameters<CreateCaseRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let tag_list: Vec<String> = req
            .tags
            .as_deref()
            .unwrap_or("")
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        let pri = req.priority.as_deref().unwrap_or("medium");
        let body = req.body.as_deref();
        match repo::create_case(
            &repo,
            &req.case_path,
            &req.title,
            &req.description,
            tag_list,
            pri,
            body,
        ) {
            Ok(c) => format!("created: cases/{}.md\ntitle: {}", c.case_path, c.fm.title),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Get a coverage report showing the latest test status for every case. Optionally filter by status: never | passed | failed | blocked | skipped."
    )]
    fn coverage_report(&self, Parameters(req): Parameters<CoverageReportRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let cases = match repo::list_cases(&repo) {
            Ok(c) => c,
            Err(e) => return format!("error listing cases: {e}"),
        };
        let runs = match repo::list_runs(&repo) {
            Ok(r) => r,
            Err(e) => return format!("error listing runs: {e}"),
        };
        let mut latest: std::collections::HashMap<String, (String, String)> =
            std::collections::HashMap::new();
        for run_meta in &runs {
            if let Ok(run) = repo::get_run(&repo, &run_meta.id) {
                for result in &run.results {
                    latest
                        .entry(result.case_path.clone())
                        .or_insert_with(|| (result.fm.status.clone(), run_meta.id.clone()));
                }
            }
        }
        let mut entry_lines = Vec::new();
        let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for c in &cases {
            let (status, run_id) = latest
                .get(&c.case_path)
                .cloned()
                .unwrap_or_else(|| ("never".to_owned(), String::new()));
            *counts.entry(status.clone()).or_insert(0) += 1;
            if let Some(ref f) = req.status_filter {
                if status != *f {
                    continue;
                }
            }
            let run_ref = if run_id.is_empty() {
                String::new()
            } else {
                format!(" [{}]", run_id)
            };
            entry_lines.push(format!("  {:40} {:8}{}", c.case_path, status, run_ref));
        }
        let total = cases.len();
        let never = counts.get("never").copied().unwrap_or(0);
        let passed = counts.get("passed").copied().unwrap_or(0);
        let failed = counts.get("failed").copied().unwrap_or(0);
        let blocked = counts.get("blocked").copied().unwrap_or(0);
        let skipped = counts.get("skipped").copied().unwrap_or(0);
        let summary = format!(
            "Coverage report ({} run(s), {} total: {} passed, {} failed, {} blocked, {} skipped, {} never run)",
            runs.len(),
            total,
            passed,
            failed,
            blocked,
            skipped,
            never
        );
        let mut lines = vec![summary];
        lines.extend(entry_lines);
        lines.join("\n")
    }

    #[tool(
        description = "List all test runs in the repository. Optionally filter by status: in-progress | completed | aborted."
    )]
    fn list_runs(&self, Parameters(req): Parameters<ListRunsRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::list_runs(&repo) {
            Ok(runs) => {
                let runs: Vec<_> = if let Some(ref s) = req.status {
                    runs.into_iter().filter(|r| r.status == *s).collect()
                } else {
                    runs
                };
                if runs.is_empty() {
                    return "No runs found.".to_owned();
                }
                runs.iter()
                    .map(|r| {
                        let suite_part = r
                            .suite
                            .as_deref()
                            .filter(|s| !s.is_empty())
                            .map(|s| format!(" suite: {s}"))
                            .unwrap_or_default();
                        format!(
                            "[{}] {} — tester: {} status: {}{}",
                            r.id, r.date, r.tester, r.status, suite_part
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Create a new test run. Returns the run ID and directory path.")]
    fn create_run(&self, Parameters(req): Parameters<CreateRunRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let tester = req
            .tester
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| std::env::var("USER").unwrap_or_else(|_| "unknown".to_owned()));
        let env = req.environment.filter(|s| !s.is_empty());
        let suite = req.suite.filter(|s| !s.is_empty());
        match repo::create_run(&repo, &req.slug, &tester, env, suite) {
            Ok((meta, dir_path)) => {
                let scope_msg = match repo::get_pending_cases(&repo, &meta.id) {
                    Ok((_, total)) => format!("\nscope: {total} case(s) to test"),
                    Err(_) => String::new(),
                };
                format!("created run: {}\ndir: {}{}", meta.id, dir_path, scope_msg)
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Record a test result for a case within a run.")]
    fn record_result(&self, Parameters(req): Parameters<RecordResultRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let notes = req.notes.as_deref().unwrap_or("");
        match repo::record_result(&repo, &req.run_id, &req.case_path, &req.status, notes) {
            Ok((_, prev)) => {
                if let Some(old) = prev {
                    format!(
                        "updated: {} = {} in run {} (was: {})",
                        req.case_path, req.status, req.run_id, old
                    )
                } else {
                    format!(
                        "recorded: {} = {} in run {}",
                        req.case_path, req.status, req.run_id
                    )
                }
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Finalize a test run, marking it completed or aborted.")]
    fn finalize_run(&self, Parameters(req): Parameters<FinalizeRunRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::finalize_run(&repo, &req.run_id, &req.status) {
            Ok(meta) => format!("finalized run {} as {}", meta.id, meta.status),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Return case paths in a run's scope that have no result recorded yet. \
                       Scope = suite cases if the run references a suite; otherwise all repo cases. \
                       Use this to know which cases still need record_result calls."
    )]
    fn get_pending_cases(&self, Parameters(req): Parameters<RunIdRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::get_pending_cases(&repo, &req.run_id) {
            Ok((pending, total)) => {
                if pending.is_empty() {
                    format!("All {} case(s) in scope have results recorded.", total)
                } else {
                    let mut lines = vec![format!(
                        "Pending ({}/{} cases still need results):",
                        pending.len(),
                        total
                    )];
                    for c in &pending {
                        let tags = if c.fm.tags.is_empty() {
                            String::new()
                        } else {
                            format!(", tags: {}", c.fm.tags.join(", "))
                        };
                        lines.push(format!(
                            "  {} — {} (priority: {}{})",
                            c.case_path, c.fm.title, c.fm.priority, tags
                        ));
                    }
                    lines.join("\n")
                }
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Update an existing test case's metadata and optionally replace its body."
    )]
    fn update_case(&self, Parameters(req): Parameters<UpdateCaseRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let tag_list: Vec<String> = req
            .tags
            .as_deref()
            .unwrap_or("")
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        let pri = req.priority.as_deref().unwrap_or("medium");
        let body = req.body.as_deref();
        match repo::update_case(
            &repo,
            &req.case_path,
            &req.title,
            &req.description,
            tag_list,
            pri,
            body,
        ) {
            Ok(c) => format!("updated: cases/{}.md", c.case_path),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Delete a test case file from the repository.")]
    fn delete_case(&self, Parameters(req): Parameters<GetCaseRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::delete_case(&repo, &req.case_path) {
            Ok(()) => format!("deleted: cases/{}.md", req.case_path),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Get full details of a test run including all results and a summary of pass/fail counts."
    )]
    fn get_run(&self, Parameters(req): Parameters<RunIdRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::get_run(&repo, &req.run_id) {
            Ok(run) => {
                let case_titles: std::collections::HashMap<String, String> =
                    repo::list_cases(&repo)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|c| (c.case_path, c.fm.title))
                        .collect();
                let mut lines = vec![
                    format!("id:     {}", run.meta.id),
                    format!("date:   {}", run.meta.date),
                    format!("tester: {}", run.meta.tester),
                    format!("status: {}", run.meta.status),
                ];
                if let Some(env) = &run.meta.environment {
                    lines.push(format!("env:    {env}"));
                }
                if let Some(ref suite) = run.meta.suite {
                    if !suite.is_empty() {
                        lines.push(format!("suite:  {suite}"));
                    }
                }
                let passed = run
                    .results
                    .iter()
                    .filter(|r| r.fm.status == "passed")
                    .count();
                let failed = run
                    .results
                    .iter()
                    .filter(|r| r.fm.status == "failed")
                    .count();
                let blocked = run
                    .results
                    .iter()
                    .filter(|r| r.fm.status == "blocked")
                    .count();
                let skipped = run
                    .results
                    .iter()
                    .filter(|r| r.fm.status == "skipped")
                    .count();
                lines.push(format!(
                    "summary: {} passed, {} failed, {} blocked, {} skipped ({} total)",
                    passed,
                    failed,
                    blocked,
                    skipped,
                    run.results.len()
                ));
                lines.push(format!("\nResults ({}):", run.results.len()));
                for r in &run.results {
                    let title = case_titles
                        .get(&r.case_path)
                        .map(|t| format!(" — {t}"))
                        .unwrap_or_default();
                    lines.push(format!("  {:40} {:8}{}", r.case_path, r.fm.status, title));
                    if !r.notes.trim().is_empty() {
                        lines.push(format!("    notes: {}", r.notes.trim()));
                    }
                }
                lines.join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "List all test suites.")]
    fn list_suites(&self, Parameters(req): Parameters<RepoPathRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::list_suites(&repo) {
            Ok(suites) => {
                if suites.is_empty() {
                    return "No suites found.".to_owned();
                }
                suites
                    .iter()
                    .map(|(slug, s)| format!("[{}] {} ({} cases)", slug, s.name, s.cases.len()))
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Get details of a test suite by slug.")]
    fn get_suite(&self, Parameters(req): Parameters<SuiteSlugRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::get_suite(&repo, &req.slug) {
            Ok(s) => {
                let case_titles: std::collections::HashMap<String, String> =
                    repo::list_cases(&repo)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|c| (c.case_path, c.fm.title))
                        .collect();
                let mut lines = vec![format!("slug: {}", req.slug), format!("name: {}", s.name)];
                if let Some(d) = &s.description {
                    lines.push(format!("description: {d}"));
                }
                lines.push(format!("\ncases ({}):", s.cases.len()));
                for path in &s.cases {
                    let title = case_titles
                        .get(path)
                        .map(|t| format!(" — {t}"))
                        .unwrap_or_default();
                    lines.push(format!("  {path}{title}"));
                }
                lines.join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Create a new test suite grouping related cases.")]
    fn create_suite(&self, Parameters(req): Parameters<CreateSuiteRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let case_list: Vec<String> = req
            .cases
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        let desc = req.description.filter(|s| !s.is_empty());
        match repo::create_suite(&repo, &req.slug, &req.name, desc, case_list) {
            Ok(_) => format!("created: suites/{}.yaml", req.slug),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Update an existing test suite's name, description, or case list.")]
    fn update_suite(&self, Parameters(req): Parameters<CreateSuiteRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let case_list: Vec<String> = req
            .cases
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        let desc = req.description.filter(|s| !s.is_empty());
        match repo::update_suite(&repo, &req.slug, &req.name, desc, case_list) {
            Ok(_) => format!("updated: suites/{}.yaml", req.slug),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Delete a test suite file from the repository.")]
    fn delete_suite(&self, Parameters(req): Parameters<SuiteSlugRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::delete_suite(&repo, &req.slug) {
            Ok(()) => format!("deleted: suites/{}.yaml", req.slug),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Show which test cases need re-running after recent code changes.")]
    fn get_affected_cases(&self, Parameters(req): Parameters<AffectedRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let cases = match repo::list_cases(&repo) {
            Ok(c) => c,
            Err(e) => return format!("error listing cases: {e}"),
        };
        let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
        let since = req.since_ref.as_deref().filter(|s| !s.is_empty());
        let case_map: std::collections::HashMap<String, &repo::LoadedCase> =
            cases.iter().map(|c| (c.case_path.clone(), c)).collect();
        match git::find_affected(&repo, since, &known_paths) {
            Ok(result) => {
                if result.case_paths.is_empty() {
                    format!("No cases need re-running.\nReason: {}", result.reason)
                } else {
                    let lines: Vec<String> = result
                        .case_paths
                        .iter()
                        .map(|p| {
                            if let Some(c) = case_map.get(p) {
                                let tags = if c.fm.tags.is_empty() {
                                    String::new()
                                } else {
                                    format!(", tags: {}", c.fm.tags.join(", "))
                                };
                                format!(
                                    "  {} — {} (priority: {}{})",
                                    p, c.fm.title, c.fm.priority, tags
                                )
                            } else {
                                format!("  {p}")
                            }
                        })
                        .collect();
                    format!(
                        "Cases to re-run ({}):\n{}\n\nReason: {}",
                        result.case_paths.len(),
                        lines.join("\n"),
                        result.reason
                    )
                }
            }
            Err(e) => format!("error: {e}"),
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let service = AmelisoMcp.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
