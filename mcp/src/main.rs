use std::path::PathBuf;

use ameliso_server::repo;
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
    #[schemars(description = "Full-text query (optional)")]
    query: Option<String>,
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
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RepoPathRequest {
    repo_path: String,
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

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct AmelisoMcp;

#[tool_router(server_handler)]
impl AmelisoMcp {
    #[tool(
        description = "List test cases in a repo. Filter by comma-separated tags or full-text query."
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
                    || c.case_path.to_lowercase().contains(&q)
            });
        }
        if cases.is_empty() {
            return "No cases found.".to_owned();
        }
        cases
            .iter()
            .map(|c| {
                format!(
                    "[{}] {} — {} (priority: {})",
                    c.case_path, c.fm.title, c.fm.description, c.fm.priority
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
        match repo::create_case(
            &repo,
            &req.case_path,
            &req.title,
            &req.description,
            tag_list,
            pri,
        ) {
            Ok(c) => format!("created: cases/{}.md\ntitle: {}", c.case_path, c.fm.title),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Get a coverage report showing the latest test status for every case.")]
    fn coverage_report(&self, Parameters(req): Parameters<RepoPathRequest>) -> String {
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
        let mut lines = vec![format!("Coverage report ({} run(s))", runs.len())];
        for c in &cases {
            let (status, run_id) = latest
                .get(&c.case_path)
                .cloned()
                .unwrap_or_else(|| ("never".to_owned(), String::new()));
            let run_ref = if run_id.is_empty() {
                String::new()
            } else {
                format!(" [{}]", run_id)
            };
            lines.push(format!("  {:40} {:8}{}", c.case_path, status, run_ref));
        }
        lines.join("\n")
    }

    #[tool(description = "List all test runs in the repository.")]
    fn list_runs(&self, Parameters(req): Parameters<RepoPathRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        match repo::list_runs(&repo) {
            Ok(runs) => {
                if runs.is_empty() {
                    return "No runs found.".to_owned();
                }
                runs.iter()
                    .map(|r| {
                        format!(
                            "[{}] {} — tester: {} status: {}",
                            r.id, r.date, r.tester, r.status
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
            Ok((meta, dir_path)) => format!("created run: {}\ndir: {}", meta.id, dir_path),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Record a test result for a case within a run.")]
    fn record_result(&self, Parameters(req): Parameters<RecordResultRequest>) -> String {
        let repo = PathBuf::from(&req.repo_path);
        let notes = req.notes.as_deref().unwrap_or("");
        match repo::record_result(&repo, &req.run_id, &req.case_path, &req.status, notes) {
            Ok(_) => format!(
                "recorded: {} = {} in run {}",
                req.case_path, req.status, req.run_id
            ),
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
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let service = AmelisoMcp.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
