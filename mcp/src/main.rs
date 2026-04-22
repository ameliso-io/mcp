use ameliso_server::proto::ameliso_v1 as pb;
use ameliso_server::proto::ameliso_v1::ameliso_service_client::AmelisoServiceClient;
use rmcp::schemars;
use rmcp::transport::stdio;
use rmcp::{handler::server::wrapper::Parameters, tool, tool_router, ServiceExt};
use serde::Deserialize;
use tonic::transport::Channel;

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

fn priority_str_to_i32(s: &str) -> i32 {
    match s.to_lowercase().as_str() {
        "low" => pb::Priority::Low as i32,
        "medium" => pb::Priority::Medium as i32,
        "high" => pb::Priority::High as i32,
        _ => pb::Priority::Unspecified as i32,
    }
}

fn run_status_str_to_i32(s: &str) -> i32 {
    match s.to_lowercase().replace('_', "-").as_str() {
        "in-progress" => pb::RunStatus::InProgress as i32,
        "completed" => pb::RunStatus::Completed as i32,
        "aborted" => pb::RunStatus::Aborted as i32,
        _ => pb::RunStatus::Unspecified as i32,
    }
}

fn result_status_str_to_i32(s: &str) -> i32 {
    match s.to_lowercase().as_str() {
        "passed" => pb::ResultStatus::Passed as i32,
        "failed" => pb::ResultStatus::Failed as i32,
        "blocked" => pb::ResultStatus::Blocked as i32,
        "skipped" => pb::ResultStatus::Skipped as i32,
        _ => pb::ResultStatus::Unspecified as i32,
    }
}

fn run_status_i32_to_str(v: i32) -> &'static str {
    match v {
        x if x == pb::RunStatus::InProgress as i32 => "in-progress",
        x if x == pb::RunStatus::Completed as i32 => "completed",
        x if x == pb::RunStatus::Aborted as i32 => "aborted",
        _ => "unspecified",
    }
}

fn result_status_i32_to_str(v: i32) -> &'static str {
    match v {
        x if x == pb::ResultStatus::Passed as i32 => "passed",
        x if x == pb::ResultStatus::Failed as i32 => "failed",
        x if x == pb::ResultStatus::Blocked as i32 => "blocked",
        x if x == pb::ResultStatus::Skipped as i32 => "skipped",
        x if x == pb::ResultStatus::Never as i32 => "never",
        _ => "unspecified",
    }
}

fn priority_rank(p: &str) -> u8 {
    match p {
        "high" => 0,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    }
}

fn status_rank(s: &str) -> u8 {
    match s {
        "failed" => 0,
        "blocked" => 1,
        "never" => 2,
        "skipped" => 3,
        "passed" => 4,
        _ => 5,
    }
}

fn fmt_case(c: &pb::Case) -> String {
    let tags = if c.tags.is_empty() {
        String::new()
    } else {
        format!(", tags: {}", c.tags.join(", "))
    };
    format!(
        "[{}] {} — {} (priority: {}{})",
        c.path, c.title, c.description, c.priority, tags
    )
}

fn fmt_run_meta(r: &pb::RunMeta) -> String {
    let suite = if r.suite.is_empty() {
        String::new()
    } else {
        format!(" suite: {}", r.suite)
    };
    let env = if r.environment.is_empty() {
        String::new()
    } else {
        format!(" env: {}", r.environment)
    };
    format!(
        "[{}] {} — tester: {} status: {}{}{}",
        r.id,
        r.date,
        r.tester,
        run_status_i32_to_str(r.status),
        suite,
        env
    )
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RepoIdRequest {
    #[schemars(description = "Repository identifier, e.g. owner/repo")]
    repo_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListCasesRequest {
    repo_id: String,
    #[schemars(description = "Comma-separated tag filter (optional)")]
    tags: Option<String>,
    #[schemars(
        description = "Full-text query against title, description, body, and path (optional)"
    )]
    query: Option<String>,
    #[schemars(description = "Filter by priority: low | medium | high (optional)")]
    priority: Option<String>,
    #[schemars(description = "Suite slug to restrict results to cases in that suite (optional)")]
    suite: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetCaseRequest {
    repo_id: String,
    #[schemars(description = "Case path, e.g. auth/login")]
    case_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateCaseRequest {
    repo_id: String,
    case_path: String,
    title: String,
    #[schemars(description = "One-line description (optional)")]
    description: Option<String>,
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
struct BulkCaseEntryInput {
    case_path: String,
    title: String,
    #[schemars(description = "One-line description (optional)")]
    description: Option<String>,
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
struct BulkCreateCasesRequest {
    repo_id: String,
    #[schemars(description = "List of cases to create")]
    cases: Vec<BulkCaseEntryInput>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateCaseRequest {
    repo_id: String,
    case_path: String,
    #[schemars(description = "New title. Omit to keep existing.")]
    title: Option<String>,
    #[schemars(description = "New one-line description. Omit to keep existing.")]
    description: Option<String>,
    #[schemars(
        description = "Comma-separated tags. Omit to keep existing; pass empty string to clear."
    )]
    tags: Option<String>,
    #[schemars(description = "low | medium | high. Omit to keep existing.")]
    priority: Option<String>,
    #[schemars(description = "Replace the full markdown body. Omit to keep existing.")]
    body: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListRunsRequest {
    repo_id: String,
    #[schemars(
        description = "Optional status filter: in-progress | completed | aborted. Omit to return all."
    )]
    status: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateRunRequest {
    repo_id: String,
    #[schemars(description = "Short slug, e.g. smoke or regression")]
    slug: String,
    #[schemars(description = "Who is running the tests (defaults to $USER)")]
    tester: Option<String>,
    #[schemars(description = "Environment being tested, e.g. staging or production (optional)")]
    environment: Option<String>,
    #[schemars(
        description = "Suite slug to scope this run to a subset of cases (optional; must exist). Mutually exclusive with `cases`."
    )]
    suite: Option<String>,
    #[schemars(
        description = "Inline case path list to scope the run without a named suite — e.g. use with get_affected_cases output. Comma-separated string. Mutually exclusive with `suite`."
    )]
    cases: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RecordResultRequest {
    repo_id: String,
    run_id: String,
    case_path: String,
    #[schemars(description = "passed | failed | blocked | skipped")]
    status: String,
    #[schemars(
        description = "Notes explaining failures or observations. Required when status is failed or blocked."
    )]
    notes: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct BulkResultEntry {
    case_path: String,
    #[schemars(description = "passed | failed | blocked | skipped")]
    status: String,
    #[schemars(
        description = "Notes for this result. Required when status is failed or blocked."
    )]
    notes: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct BulkRecordResultsRequest {
    repo_id: String,
    run_id: String,
    #[schemars(description = "List of results to record")]
    results: Vec<BulkResultEntry>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct FinalizeRunRequest {
    repo_id: String,
    run_id: String,
    #[schemars(description = "completed | aborted")]
    status: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RunIdRequest {
    repo_id: String,
    run_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SuiteSlugRequest {
    repo_id: String,
    slug: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateSuiteRequest {
    repo_id: String,
    slug: String,
    name: String,
    description: Option<String>,
    #[schemars(description = "Comma-separated case paths")]
    cases: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateSuiteRequest {
    repo_id: String,
    slug: String,
    #[schemars(description = "New name. Omit to keep existing.")]
    name: Option<String>,
    #[schemars(description = "New description. Omit to keep existing.")]
    description: Option<String>,
    #[schemars(
        description = "Comma-separated case paths (full replacement). Omit to keep existing list."
    )]
    cases: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct AffectedRequest {
    repo_id: String,
    #[schemars(description = "Git ref to compare from (e.g. HEAD~5, a commit SHA). Required unless changed_files is provided — if both omitted, ALL cases are flagged.")]
    since_ref: Option<String>,
    #[schemars(description = "Comma-separated file paths from `git diff --name-only`. When set, skips GitHub comparison and matches these files against known case paths. Useful for local workflows without GitHub integration.")]
    changed_files: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CoverageReportRequest {
    repo_id: String,
    #[schemars(
        description = "Optional status filter: never | passed | failed | blocked | skipped. Omit to return all."
    )]
    status_filter: Option<String>,
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct AmelisoMcp {
    channel: Channel,
}

impl AmelisoMcp {
    fn client(&self) -> AmelisoServiceClient<Channel> {
        AmelisoServiceClient::new(self.channel.clone())
    }
}

#[tool_router(server_handler)]
impl AmelisoMcp {
    #[tool(
        description = "Get an overview of the test repo: total cases by priority, coverage stats (never/passed/failed/blocked/skipped), active in-progress runs with pending counts, and suite count. Use this first to understand the testing state before diving into details."
    )]
    async fn repo_status(&self, Parameters(req): Parameters<RepoIdRequest>) -> String {
        let mut c = self.client();
        let s = match c
            .get_repo_status(pb::GetRepoStatusRequest {
                repo_id: req.repo_id.clone(),
            })
            .await
        {
            Ok(r) => r.into_inner(),
            Err(e) => return format!("error: {e}"),
        };

        let mut lines = vec![
            format!(
                "Cases: {} total ({} high, {} medium, {} low priority)",
                s.total_cases, s.high_cases, s.medium_cases, s.low_cases
            ),
            format!(
                "Coverage: {} passed, {} failed, {} blocked, {} skipped, {} never run",
                s.passed, s.failed, s.blocked, s.skipped, s.never_run
            ),
            format!("Suites: {}", s.suite_count),
            format!("Runs: {} total", s.run_count),
        ];

        if s.active_runs.is_empty() {
            lines.push("Active runs: none".to_owned());
        } else {
            lines.push(format!("Active runs ({}):", s.active_runs.len()));
            for r in &s.active_runs {
                let suite_part = if r.suite.is_empty() {
                    String::new()
                } else {
                    format!(" suite: {}", r.suite)
                };
                let pending = r.pending_cases as usize;
                let total = r.total_in_scope as usize;
                let done = total.saturating_sub(pending);
                let pending_part = format!(" ({done}/{total} done, {pending} pending)");
                lines.push(format!(
                    "  [{}] tester: {}{}{}",
                    r.run_id, r.tester, suite_part, pending_part
                ));
            }
        }

        lines.join("\n")
    }

    #[tool(
        description = "List test cases in a repo. Filter by tags, priority, full-text query, or suite slug. Results sorted high→medium→low priority."
    )]
    async fn list_cases(&self, Parameters(req): Parameters<ListCasesRequest>) -> String {
        let mut client = self.client();
        let tags: Vec<String> = req
            .tags
            .as_deref()
            .unwrap_or("")
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        let priority = req
            .priority
            .as_deref()
            .map(priority_str_to_i32)
            .unwrap_or(pb::Priority::Unspecified as i32);
        let cases = match client
            .list_cases(pb::ListCasesRequest {
                repo_id: req.repo_id,
                tags,
                priority,
                query: req.query.unwrap_or_default(),
                suite: req.suite.unwrap_or_default(),
            })
            .await
        {
            Ok(r) => r.into_inner().cases,
            Err(e) => return format!("error: {e}"),
        };
        if cases.is_empty() {
            return "No cases found.".to_owned();
        }
        cases.iter().map(fmt_case).collect::<Vec<_>>().join("\n")
    }

    #[tool(
        description = "Get full details of a single test case including steps and expected result."
    )]
    async fn get_case(&self, Parameters(req): Parameters<GetCaseRequest>) -> String {
        let mut client = self.client();
        match client
            .get_case(pb::GetCaseRequest {
                repo_id: req.repo_id,
                case_path: req.case_path,
            })
            .await
        {
            Ok(r) => {
                let r = r.into_inner();
                let c = match r.case.as_ref() {
                    Some(c) => c,
                    None => return "error: server returned empty case".to_owned(),
                };
                format!(
                    "path: {}\ntitle: {}\ndescription: {}\ntags: {}\npriority: {}\ncreated_at: {}\nupdated_at: {}\n\n{}",
                    c.path,
                    c.title,
                    c.description,
                    c.tags.join(", "),
                    c.priority,
                    c.created_at,
                    c.updated_at,
                    r.body
                )
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Create a new test case. case_path is slash-separated (e.g. auth/login); each segment must be [a-z0-9-_] only — no spaces, uppercase, or special chars. priority must be low|medium|high (default: medium)."
    )]
    async fn create_case(&self, Parameters(req): Parameters<CreateCaseRequest>) -> String {
        let mut client = self.client();
        let tags: Vec<String> = req
            .tags
            .as_deref()
            .unwrap_or("")
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        let priority = priority_str_to_i32(req.priority.as_deref().unwrap_or("medium"));
        match client
            .create_case(pb::CreateCaseRequest {
                repo_id: req.repo_id,
                case_path: req.case_path.clone(),
                title: req.title,
                description: req.description.unwrap_or_default(),
                tags,
                priority,
                body: req.body.unwrap_or_default(),
            })
            .await
        {
            Ok(r) => {
                let r = r.into_inner();
                let c = match r.case.as_ref() {
                    Some(c) => c,
                    None => return "error: server returned empty case".to_owned(),
                };
                format!(
                    "created: {}\ntitle: {}\ndescription: {}\npriority: {}\ntags: {}",
                    r.file_path,
                    c.title,
                    c.description,
                    c.priority,
                    if c.tags.is_empty() {
                        "(none)".to_owned()
                    } else {
                        c.tags.join(", ")
                    }
                )
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Create multiple test cases in a single call. More efficient than calling create_case N times when setting up a new project or adding a batch of cases. Returns one line per created case."
    )]
    async fn bulk_create_cases(
        &self,
        Parameters(req): Parameters<BulkCreateCasesRequest>,
    ) -> String {
        let mut client = self.client();
        let entries: Vec<pb::BulkCaseEntry> = req
            .cases
            .into_iter()
            .map(|e| {
                let tags: Vec<String> = e
                    .tags
                    .as_deref()
                    .unwrap_or("")
                    .split(',')
                    .map(|s| s.trim().to_owned())
                    .filter(|s| !s.is_empty())
                    .collect();
                let priority = priority_str_to_i32(e.priority.as_deref().unwrap_or("medium"));
                pb::BulkCaseEntry {
                    case_path: e.case_path,
                    title: e.title,
                    description: e.description.unwrap_or_default(),
                    tags,
                    priority,
                    body: e.body.unwrap_or_default(),
                }
            })
            .collect();
        match client
            .bulk_create_cases(pb::BulkCreateCasesRequest {
                repo_id: req.repo_id,
                cases: entries,
            })
            .await
        {
            Ok(r) => {
                let cases = r.into_inner().cases;
                if cases.is_empty() {
                    return "created: 0 cases".to_owned();
                }
                let lines: Vec<String> = cases
                    .iter()
                    .map(|c| format!("created: {} ({})", c.case_path, c.priority))
                    .collect();
                format!("{}\ntotal: {} case(s)", lines.join("\n"), cases.len())
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Update an existing test case. All fields are optional — omit any field to preserve its current value. Useful for changing just priority or tags without re-specifying title/description."
    )]
    async fn update_case(&self, Parameters(req): Parameters<UpdateCaseRequest>) -> String {
        let mut client = self.client();
        let tags: Vec<String> = req
            .tags
            .as_deref()
            .map(|raw| {
                raw.split(',')
                    .map(|s| s.trim().to_owned())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        let priority = req
            .priority
            .as_deref()
            .map(priority_str_to_i32)
            .unwrap_or(pb::Priority::Unspecified as i32);
        match client
            .update_case(pb::UpdateCaseRequest {
                repo_id: req.repo_id,
                case_path: req.case_path,
                title: req.title.unwrap_or_default(),
                description: req.description.unwrap_or_default(),
                tags,
                priority,
                body: req.body.unwrap_or_default(),
            })
            .await
        {
            Ok(r) => {
                let c = match r.into_inner().case {
                    Some(c) => c,
                    None => return "error: server returned empty case".to_owned(),
                };
                format!(
                    "updated: cases/{}.md\ntitle: {}\ndescription: {}\npriority: {}\ntags: {}",
                    c.path,
                    c.title,
                    c.description,
                    c.priority,
                    if c.tags.is_empty() {
                        "(none)".to_owned()
                    } else {
                        c.tags.join(", ")
                    }
                )
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Delete a test case. Returns the deleted file path.")]
    async fn delete_case(&self, Parameters(req): Parameters<GetCaseRequest>) -> String {
        let mut client = self.client();
        match client
            .delete_case(pb::DeleteCaseRequest {
                repo_id: req.repo_id,
                case_path: req.case_path,
            })
            .await
        {
            Ok(r) => format!("deleted: {}", r.into_inner().file_path),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Get a coverage report: latest test status for every case with title. Results sorted by actionability: failed → blocked → never → skipped → passed, then by priority. Optionally filter by status: never | passed | failed | blocked | skipped."
    )]
    async fn coverage_report(&self, Parameters(req): Parameters<CoverageReportRequest>) -> String {
        let mut client = self.client();
        let status_filter = req
            .status_filter
            .as_deref()
            .map(result_status_str_to_i32)
            .unwrap_or(pb::ResultStatus::Unspecified as i32);
        let resp = match client
            .get_coverage_report(pb::GetCoverageReportRequest {
                repo_id: req.repo_id,
                status_filter,
            })
            .await
        {
            Ok(r) => r.into_inner(),
            Err(e) => return format!("error: {e}"),
        };

        let total = resp.entries.len();
        let mut counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for e in &resp.entries {
            *counts
                .entry(result_status_i32_to_str(e.latest_status))
                .or_insert(0) += 1;
        }

        let mut entries: Vec<_> = resp
            .entries
            .iter()
            .map(|e| {
                let status = result_status_i32_to_str(e.latest_status);
                let run_ref = if e.last_run_id.is_empty() {
                    String::new()
                } else {
                    format!(" [{}]", e.last_run_id)
                };
                (e, status, run_ref)
            })
            .collect();

        entries.sort_by(|(a_e, a_s, _), (b_e, b_s, _)| {
            status_rank(a_s)
                .cmp(&status_rank(b_s))
                .then_with(|| {
                    let ap = a_e.case.as_ref().map(|c| c.priority.as_str()).unwrap_or("");
                    let bp = b_e.case.as_ref().map(|c| c.priority.as_str()).unwrap_or("");
                    priority_rank(ap).cmp(&priority_rank(bp))
                })
                .then_with(|| {
                    let ap = a_e.case.as_ref().map(|c| c.path.as_str()).unwrap_or("");
                    let bp = b_e.case.as_ref().map(|c| c.path.as_str()).unwrap_or("");
                    ap.cmp(bp)
                })
        });

        let entry_lines: Vec<String> = entries
            .iter()
            .map(|(e, status, run_ref)| {
                let title = e.case.as_ref().map(|c| c.title.as_str()).unwrap_or("");
                let path = e.case.as_ref().map(|c| c.path.as_str()).unwrap_or("");
                format!("  {:40} {:8}{} — {}", path, status, run_ref, title)
            })
            .collect();

        let summary = format!(
            "Coverage report ({} run(s), {} total: {} passed, {} failed, {} blocked, {} skipped, {} never run)",
            resp.run_count,
            total,
            counts.get("passed").copied().unwrap_or(0),
            counts.get("failed").copied().unwrap_or(0),
            counts.get("blocked").copied().unwrap_or(0),
            counts.get("skipped").copied().unwrap_or(0),
            counts.get("never").copied().unwrap_or(0),
        );

        std::iter::once(summary)
            .chain(entry_lines)
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[tool(
        description = "List all test runs in the repository. Optionally filter by status: in-progress | completed | aborted."
    )]
    async fn list_runs(&self, Parameters(req): Parameters<ListRunsRequest>) -> String {
        let mut client = self.client();
        let status = req
            .status
            .as_deref()
            .map(run_status_str_to_i32)
            .unwrap_or(pb::RunStatus::Unspecified as i32);
        match client
            .list_runs(pb::ListRunsRequest {
                repo_id: req.repo_id,
                status,
            })
            .await
        {
            Ok(r) => {
                let runs = r.into_inner().runs;
                if runs.is_empty() {
                    return "No runs found.".to_owned();
                }
                runs.iter().map(fmt_run_meta).collect::<Vec<_>>().join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Create a new test run. If suite is provided it must already exist (validated). Returns the run ID and the full list of cases to test sorted by priority — no need to call get_pending_cases afterward."
    )]
    async fn create_run(&self, Parameters(req): Parameters<CreateRunRequest>) -> String {
        let mut client = self.client();
        let tester = req
            .tester
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| std::env::var("USER").unwrap_or_else(|_| "unknown".to_owned()));
        let inline_cases: Vec<String> = req
            .cases
            .as_deref()
            .map(|s| {
                s.split(',')
                    .map(|c| c.trim().to_owned())
                    .filter(|c| !c.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        let created = match client
            .create_run(pb::CreateRunRequest {
                repo_id: req.repo_id.clone(),
                slug: req.slug,
                tester,
                environment: req.environment.unwrap_or_default(),
                suite: req.suite.unwrap_or_default(),
                cases: inline_cases,
            })
            .await
        {
            Ok(r) => r.into_inner(),
            Err(e) => return format!("error: {e}"),
        };
        let meta = match created.run.as_ref() {
            Some(m) => m,
            None => return "error: server returned empty run".to_owned(),
        };
        let scope_msg = match client
            .get_pending_cases(pb::GetPendingCasesRequest {
                repo_id: req.repo_id,
                run_id: meta.id.clone(),
            })
            .await
        {
            Ok(resp) => {
                let resp = resp.into_inner();
                let mut lines =
                    vec![format!("\nscope: {} case(s) to test (in priority order):", resp.total_in_scope)];
                for c in &resp.cases {
                    lines.push(format!("  {}", fmt_case(c)));
                }
                lines.join("\n")
            }
            Err(_) => String::new(),
        };
        format!(
            "created run: {}\ndir: {}{}",
            meta.id, created.dir_path, scope_msg
        )
    }

    #[tool(
        description = "Record a test result (passed|failed|blocked|skipped) for a case in a run. Case must exist and run must be in-progress. Notes are required when status is failed or blocked. Returns confirmation with progress."
    )]
    async fn record_result(&self, Parameters(req): Parameters<RecordResultRequest>) -> String {
        let mut client = self.client();
        let status_i32 = result_status_str_to_i32(&req.status);
        let notes = req.notes.unwrap_or_default();
        let run_id = req.run_id.clone();
        let repo_id = req.repo_id.clone();
        match client
            .record_result(pb::RecordResultRequest {
                repo_id: repo_id.clone(),
                run_id: run_id.clone(),
                case_path: req.case_path.clone(),
                status: status_i32,
                notes,
            })
            .await
        {
            Ok(_) => {
                let base = format!(
                    "recorded: {} = {} in run {}",
                    req.case_path, req.status, run_id
                );
                let progress = match client
                    .get_pending_cases(pb::GetPendingCasesRequest {
                        repo_id,
                        run_id,
                    })
                    .await
                {
                    Ok(resp) => {
                        let resp = resp.into_inner();
                        let total = resp.total_in_scope as usize;
                        let pending = resp.cases.len();
                        if pending == 0 {
                            format!("\nprogress: {total}/{total} done — all cases recorded; ready to finalize")
                        } else {
                            format!(
                                "\nprogress: {}/{total} done, {} remaining",
                                total - pending,
                                pending
                            )
                        }
                    }
                    Err(_) => String::new(),
                };
                format!("{base}{progress}")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Record multiple test results in a single gRPC call. Returns a summary of recorded results and remaining pending count. Prefer this over N sequential record_result calls."
    )]
    async fn bulk_record_results(
        &self,
        Parameters(req): Parameters<BulkRecordResultsRequest>,
    ) -> String {
        let mut client = self.client();
        let grpc_results: Vec<pb::BulkResultEntry> = req
            .results
            .iter()
            .map(|e| pb::BulkResultEntry {
                case_path: e.case_path.clone(),
                status: result_status_str_to_i32(&e.status),
                notes: e.notes.clone().unwrap_or_default(),
            })
            .collect();
        match client
            .bulk_record_results(pb::BulkRecordResultsRequest {
                repo_id: req.repo_id,
                run_id: req.run_id,
                results: grpc_results,
            })
            .await
        {
            Ok(r) => {
                let r = r.into_inner();
                let recorded = r.results.len();
                let pending = r.pending_count as usize;
                let total = r.total_in_scope as usize;
                let mut lines: Vec<String> = r
                    .results
                    .iter()
                    .map(|res| format!("recorded: {}", res.case_path))
                    .collect();
                if pending == 0 {
                    lines.push(format!(
                        "\n{recorded} recorded. progress: {total}/{total} done — all cases recorded; ready to finalize"
                    ));
                } else {
                    lines.push(format!(
                        "\n{recorded} recorded. progress: {}/{total} done, {pending} remaining",
                        total - pending
                    ));
                }
                lines.join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Mark a test run completed or aborted. Returns a pass/fail/blocked/skipped summary. Warns if cases in scope have no result recorded (pending cases remain)."
    )]
    async fn finalize_run(&self, Parameters(req): Parameters<FinalizeRunRequest>) -> String {
        let mut client = self.client();
        let status_i32 = run_status_str_to_i32(&req.status);
        let run_id = req.run_id.clone();
        let repo_id = req.repo_id.clone();
        match client
            .finalize_run(pb::FinalizeRunRequest {
                repo_id: repo_id.clone(),
                run_id: run_id.clone(),
                status: status_i32,
            })
            .await
        {
            Ok(r) => {
                let meta = match r.into_inner().run {
                    Some(m) => m,
                    None => return "error: server returned empty run".to_owned(),
                };
                let status_str = run_status_i32_to_str(meta.status);
                // Fetch run details and pending count concurrently.
                let mut c2 = self.client();
                let mut c3 = self.client();
                let (run_res, pending_res) = tokio::join!(
                    c2.get_run(pb::GetRunRequest {
                        repo_id: repo_id.clone(),
                        run_id: run_id.clone(),
                    }),
                    c3.get_pending_cases(pb::GetPendingCasesRequest {
                        repo_id,
                        run_id: run_id.clone(),
                    }),
                );
                let summary = match run_res {
                    Ok(resp) => {
                        let run = match resp.into_inner().run {
                            Some(r) => r,
                            None => return "error: server returned empty run details".to_owned(),
                        };
                        let passed = run
                            .results
                            .iter()
                            .filter(|r| r.status == pb::ResultStatus::Passed as i32)
                            .count();
                        let failed = run
                            .results
                            .iter()
                            .filter(|r| r.status == pb::ResultStatus::Failed as i32)
                            .count();
                        let blocked = run
                            .results
                            .iter()
                            .filter(|r| r.status == pb::ResultStatus::Blocked as i32)
                            .count();
                        let skipped = run
                            .results
                            .iter()
                            .filter(|r| r.status == pb::ResultStatus::Skipped as i32)
                            .count();
                        format!(
                            "\nsummary: {} passed, {} failed, {} blocked, {} skipped ({} total)",
                            passed,
                            failed,
                            blocked,
                            skipped,
                            run.results.len()
                        )
                    }
                    Err(_) => String::new(),
                };
                let pending_warn = if status_str == "completed" {
                    match pending_res {
                        Ok(resp) => {
                            let resp = resp.into_inner();
                            let total = resp.total_in_scope as usize;
                            let paths: Vec<&str> =
                                resp.cases.iter().map(|c| c.path.as_str()).collect();
                            if !paths.is_empty() {
                                format!(
                                    "\nwarning: {}/{} case(s) have no result recorded: {}",
                                    paths.len(),
                                    total,
                                    paths.join(", ")
                                )
                            } else {
                                String::new()
                            }
                        }
                        Err(_) => String::new(),
                    }
                } else {
                    String::new()
                };
                format!(
                    "finalized run {} as {}{}{}",
                    run_id, status_str, summary, pending_warn
                )
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Return cases in a run's scope that have no result recorded yet, sorted high→medium→low priority. Scope = suite cases if the run references a suite; otherwise all repo cases. Returns case path, title, priority, and tags for each pending case."
    )]
    async fn get_pending_cases(&self, Parameters(req): Parameters<RunIdRequest>) -> String {
        let mut client = self.client();
        match client
            .get_pending_cases(pb::GetPendingCasesRequest {
                repo_id: req.repo_id,
                run_id: req.run_id,
            })
            .await
        {
            Ok(resp) => {
                let resp = resp.into_inner();
                let total = resp.total_in_scope as usize;
                let pending = &resp.cases;
                if pending.is_empty() {
                    format!("All {} case(s) in scope have results recorded.", total)
                } else {
                    let mut lines = vec![format!(
                        "Pending ({}/{} cases still need results):",
                        pending.len(),
                        total
                    )];
                    for c in pending {
                        lines.push(format!("  {}", fmt_case(c)));
                    }
                    lines.join("\n")
                }
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Get full details of a test run: metadata, pass/fail/blocked/skipped summary, result list with case titles and notes. For in-progress runs, also shows how many cases are still pending."
    )]
    async fn get_run(&self, Parameters(req): Parameters<RunIdRequest>) -> String {
        let mut client = self.client();
        let run = match client
            .get_run(pb::GetRunRequest {
                repo_id: req.repo_id.clone(),
                run_id: req.run_id.clone(),
            })
            .await
        {
            Ok(r) => match r.into_inner().run {
                Some(run) => run,
                None => return "error: server returned empty run".to_owned(),
            },
            Err(e) => return format!("error: {e}"),
        };
        let meta = match run.meta.as_ref() {
            Some(m) => m,
            None => return "error: server returned run with no metadata".to_owned(),
        };
        let mut lines = vec![
            format!("id:     {}", meta.id),
            format!("date:   {}", meta.date),
            format!("tester: {}", meta.tester),
            format!("status: {}", run_status_i32_to_str(meta.status)),
        ];
        if !meta.environment.is_empty() {
            lines.push(format!("env:    {}", meta.environment));
        }
        if !meta.suite.is_empty() {
            lines.push(format!("suite:  {}", meta.suite));
        }

        let passed = run
            .results
            .iter()
            .filter(|r| r.status == pb::ResultStatus::Passed as i32)
            .count();
        let failed = run
            .results
            .iter()
            .filter(|r| r.status == pb::ResultStatus::Failed as i32)
            .count();
        let blocked = run
            .results
            .iter()
            .filter(|r| r.status == pb::ResultStatus::Blocked as i32)
            .count();
        let skipped = run
            .results
            .iter()
            .filter(|r| r.status == pb::ResultStatus::Skipped as i32)
            .count();
        lines.push(format!(
            "summary: {} passed, {} failed, {} blocked, {} skipped ({} total)",
            passed,
            failed,
            blocked,
            skipped,
            run.results.len()
        ));

        if meta.status == pb::RunStatus::InProgress as i32 {
            if let Ok(resp) = client
                .get_pending_cases(pb::GetPendingCasesRequest {
                    repo_id: req.repo_id,
                    run_id: req.run_id,
                })
                .await
            {
                let resp = resp.into_inner();
                lines.push(format!(
                    "pending: {}/{} cases still need results",
                    resp.cases.len(),
                    resp.total_in_scope
                ));
            }
        }

        lines.push(format!("\nResults ({}):", run.results.len()));
        for r in &run.results {
            lines.push(format!(
                "  {:40} {}",
                r.case_path,
                result_status_i32_to_str(r.status)
            ));
            if !r.notes.trim().is_empty() {
                lines.push(format!("    notes: {}", r.notes.trim()));
            }
        }
        lines.join("\n")
    }

    #[tool(description = "Delete a run and all its recorded results. Returns the deleted directory path.")]
    async fn delete_run(&self, Parameters(req): Parameters<RunIdRequest>) -> String {
        let mut client = self.client();
        match client
            .delete_run(pb::DeleteRunRequest {
                repo_id: req.repo_id,
                run_id: req.run_id,
            })
            .await
        {
            Ok(r) => format!("deleted: {}", r.into_inner().dir_path),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "List all test suites with their case counts and descriptions.")]
    async fn list_suites(&self, Parameters(req): Parameters<RepoIdRequest>) -> String {
        let mut client = self.client();
        match client
            .list_suites(pb::ListSuitesRequest {
                repo_id: req.repo_id,
            })
            .await
        {
            Ok(r) => {
                let suites = r.into_inner().suites;
                if suites.is_empty() {
                    return "No suites found.".to_owned();
                }
                suites
                    .iter()
                    .map(|s| {
                        let desc = if s.description.is_empty() {
                            String::new()
                        } else {
                            format!(" — {}", s.description)
                        };
                        format!("[{}] {} ({} cases){}", s.slug, s.name, s.cases.len(), desc)
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Get a suite by slug — shows name, description, and case list with paths."
    )]
    async fn get_suite(&self, Parameters(req): Parameters<SuiteSlugRequest>) -> String {
        let mut client = self.client();
        match client
            .get_suite(pb::GetSuiteRequest {
                repo_id: req.repo_id,
                slug: req.slug.clone(),
            })
            .await
        {
            Ok(r) => {
                let s = match r.into_inner().suite {
                    Some(s) => s,
                    None => return "error: server returned empty suite".to_owned(),
                };
                let mut lines = vec![format!("slug: {}", req.slug), format!("name: {}", s.name)];
                if !s.description.is_empty() {
                    lines.push(format!("description: {}", s.description));
                }
                lines.push(format!("\ncases ({}):", s.cases.len()));
                for path in &s.cases {
                    lines.push(format!("  {path}"));
                }
                lines.join("\n")
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Create a test suite grouping existing cases. All case paths in cases must already exist (validated). cases is comma-separated."
    )]
    async fn create_suite(&self, Parameters(req): Parameters<CreateSuiteRequest>) -> String {
        let mut client = self.client();
        let case_list: Vec<String> = req
            .cases
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        match client
            .create_suite(pb::CreateSuiteRequest {
                repo_id: req.repo_id,
                slug: req.slug,
                name: req.name,
                description: req.description.unwrap_or_default(),
                cases: case_list,
            })
            .await
        {
            Ok(r) => {
                let r = r.into_inner();
                let s = match r.suite {
                    Some(s) => s,
                    None => return "error: server returned empty suite".to_owned(),
                };
                format!("created: {} ({} cases)", r.file_path, s.cases.len())
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Update an existing test suite. All fields optional — omit any to preserve current value. To replace the full case list, pass comma-separated case paths in cases. Cases must already exist."
    )]
    async fn update_suite(&self, Parameters(req): Parameters<UpdateSuiteRequest>) -> String {
        let mut client = self.client();
        let replace_cases = req.cases.is_some();
        let cases: Vec<String> = req
            .cases
            .as_deref()
            .map(|raw| {
                raw.split(',')
                    .map(|s| s.trim().to_owned())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        match client
            .update_suite(pb::UpdateSuiteRequest {
                repo_id: req.repo_id,
                slug: req.slug,
                name: req.name.unwrap_or_default(),
                description: req.description.unwrap_or_default(),
                cases,
                replace_cases,
            })
            .await
        {
            Ok(r) => {
                let s = match r.into_inner().suite {
                    Some(s) => s,
                    None => return "error: server returned empty suite".to_owned(),
                };
                format!("updated: suites/{}.yaml ({} cases)", s.slug, s.cases.len())
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(description = "Delete a test suite. Returns the deleted file path.")]
    async fn delete_suite(&self, Parameters(req): Parameters<SuiteSlugRequest>) -> String {
        let mut client = self.client();
        match client
            .delete_suite(pb::DeleteSuiteRequest {
                repo_id: req.repo_id,
                slug: req.slug,
            })
            .await
        {
            Ok(r) => format!("deleted: {}", r.into_inner().file_path),
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Show test cases that may need re-running given recent git changes. Pass since_ref (GitHub API comparison) or changed_files (comma-separated paths from git diff --name-only, for local workflows without GitHub). If neither is provided, ALL cases are returned. Source files that don't explicitly reference a case path cause ALL cases to be flagged."
    )]
    async fn get_affected_cases(&self, Parameters(req): Parameters<AffectedRequest>) -> String {
        let mut client = self.client();
        match client
            .get_affected_cases(pb::GetAffectedCasesRequest {
                repo_id: req.repo_id,
                since_ref: req.since_ref.unwrap_or_default(),
                changed_files: req
                    .changed_files
                    .as_deref()
                    .map(|s| s.split(',').map(|f| f.trim().to_owned()).filter(|f| !f.is_empty()).collect())
                    .unwrap_or_default(),
            })
            .await
        {
            Ok(r) => {
                let resp = r.into_inner();
                if resp.cases.is_empty() {
                    format!("No cases need re-running.\nReason: {}", resp.reason)
                } else {
                    let lines: Vec<String> = resp
                        .cases
                        .iter()
                        .filter_map(|ac| ac.case.as_ref().map(|c| format!("  {}", fmt_case(c))))
                        .collect();
                    format!(
                        "Cases to re-run ({}, high priority first):\n{}\n\nReason: {}",
                        resp.cases.len(),
                        lines.join("\n"),
                        resp.reason
                    )
                }
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Trigger a full re-sync of all case files from GitHub for a connected repository. Use this after pushing case file changes to git when you want the server to pick them up immediately rather than waiting for the webhook. Returns the updated repository info."
    )]
    async fn sync_repository(&self, Parameters(req): Parameters<RepoIdRequest>) -> String {
        let mut client = self.client();
        match client
            .sync_repository(pb::SyncRepositoryRequest {
                id: req.repo_id.clone(),
            })
            .await
        {
            Ok(r) => {
                let repo = match r.into_inner().repository {
                    Some(repo) => repo,
                    None => return "error: server returned empty repository".to_owned(),
                };
                format!(
                    "synced: {}\nurl: {}",
                    repo.full_name, repo.html_url
                )
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "List all GitHub repositories connected to this Ameliso installation. Returns repo_id (use as `repo_id` in all other tools), name, and URL for each repo."
    )]
    async fn list_repositories(&self) -> String {
        let mut client = self.client();
        match client
            .list_repositories(pb::ListRepositoriesRequest {})
            .await
        {
            Ok(r) => {
                let repos = r.into_inner().repositories;
                if repos.is_empty() {
                    "No repositories connected. Use the web UI to connect a GitHub repository via the GitHub App.".to_owned()
                } else {
                    let lines: Vec<String> = repos
                        .iter()
                        .map(|repo| {
                            format!("  repo_id: {}  url: {}", repo.full_name, repo.html_url)
                        })
                        .collect();
                    format!("Connected repositories ({}):\n{}", repos.len(), lines.join("\n"))
                }
            }
            Err(e) => format!("error: {e}"),
        }
    }

    #[tool(
        description = "Remove a connected GitHub repository from this Ameliso installation. All synced case data for the repo will be deleted. Use list_repositories to find the repo_id."
    )]
    async fn remove_repository(&self, Parameters(req): Parameters<RepoIdRequest>) -> String {
        let mut client = self.client();
        match client
            .remove_repository(pb::RemoveRepositoryRequest {
                id: req.repo_id.clone(),
            })
            .await
        {
            Ok(_) => format!("removed: {}", req.repo_id),
            Err(e) => format!("error: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_str_to_i32_known_values() {
        assert_eq!(priority_str_to_i32("low"), pb::Priority::Low as i32);
        assert_eq!(priority_str_to_i32("medium"), pb::Priority::Medium as i32);
        assert_eq!(priority_str_to_i32("high"), pb::Priority::High as i32);
    }

    #[test]
    fn priority_str_to_i32_case_insensitive() {
        assert_eq!(priority_str_to_i32("HIGH"), pb::Priority::High as i32);
        assert_eq!(priority_str_to_i32("Low"), pb::Priority::Low as i32);
    }

    #[test]
    fn priority_str_to_i32_unknown_returns_unspecified() {
        assert_eq!(
            priority_str_to_i32("critical"),
            pb::Priority::Unspecified as i32
        );
    }

    #[test]
    fn run_status_str_to_i32_known_values() {
        assert_eq!(
            run_status_str_to_i32("in-progress"),
            pb::RunStatus::InProgress as i32
        );
        assert_eq!(
            run_status_str_to_i32("completed"),
            pb::RunStatus::Completed as i32
        );
        assert_eq!(
            run_status_str_to_i32("aborted"),
            pb::RunStatus::Aborted as i32
        );
    }

    #[test]
    fn run_status_str_to_i32_underscore_alias() {
        assert_eq!(
            run_status_str_to_i32("in_progress"),
            pb::RunStatus::InProgress as i32
        );
    }

    #[test]
    fn run_status_str_to_i32_unknown_returns_unspecified() {
        assert_eq!(
            run_status_str_to_i32("paused"),
            pb::RunStatus::Unspecified as i32
        );
    }

    #[test]
    fn result_status_str_to_i32_known_values() {
        assert_eq!(
            result_status_str_to_i32("passed"),
            pb::ResultStatus::Passed as i32
        );
        assert_eq!(
            result_status_str_to_i32("failed"),
            pb::ResultStatus::Failed as i32
        );
        assert_eq!(
            result_status_str_to_i32("blocked"),
            pb::ResultStatus::Blocked as i32
        );
        assert_eq!(
            result_status_str_to_i32("skipped"),
            pb::ResultStatus::Skipped as i32
        );
    }

    #[test]
    fn result_status_str_to_i32_unknown_returns_unspecified() {
        assert_eq!(
            result_status_str_to_i32("pending"),
            pb::ResultStatus::Unspecified as i32
        );
    }

    #[test]
    fn result_status_i32_to_str_known_values() {
        assert_eq!(
            result_status_i32_to_str(pb::ResultStatus::Passed as i32),
            "passed"
        );
        assert_eq!(
            result_status_i32_to_str(pb::ResultStatus::Failed as i32),
            "failed"
        );
        assert_eq!(
            result_status_i32_to_str(pb::ResultStatus::Blocked as i32),
            "blocked"
        );
        assert_eq!(
            result_status_i32_to_str(pb::ResultStatus::Skipped as i32),
            "skipped"
        );
        assert_eq!(
            result_status_i32_to_str(pb::ResultStatus::Never as i32),
            "never"
        );
    }

    #[test]
    fn result_status_i32_to_str_unknown_returns_unspecified() {
        assert_eq!(result_status_i32_to_str(999), "unspecified");
    }

    #[test]
    fn run_status_i32_to_str_known_values() {
        assert_eq!(
            run_status_i32_to_str(pb::RunStatus::InProgress as i32),
            "in-progress"
        );
        assert_eq!(
            run_status_i32_to_str(pb::RunStatus::Completed as i32),
            "completed"
        );
        assert_eq!(
            run_status_i32_to_str(pb::RunStatus::Aborted as i32),
            "aborted"
        );
    }

    #[test]
    fn run_status_i32_to_str_unknown_returns_unspecified() {
        assert_eq!(run_status_i32_to_str(999), "unspecified");
    }

    #[test]
    fn priority_rank_ordering() {
        // high < medium < low < unknown — lower rank = higher priority
        assert!(priority_rank("high") < priority_rank("medium"));
        assert!(priority_rank("medium") < priority_rank("low"));
        assert!(priority_rank("low") < priority_rank("other"));
    }

    #[test]
    fn status_rank_ordering() {
        // failed < blocked < never < skipped < passed < unknown
        assert!(status_rank("failed") < status_rank("blocked"));
        assert!(status_rank("blocked") < status_rank("never"));
        assert!(status_rank("never") < status_rank("skipped"));
        assert!(status_rank("skipped") < status_rank("passed"));
        assert!(status_rank("passed") < status_rank("other"));
    }

    #[test]
    fn fmt_case_no_tags() {
        let c = pb::Case {
            path: "auth/login".to_owned(),
            title: "Login Flow".to_owned(),
            description: "Tests login".to_owned(),
            priority: "high".to_owned(),
            tags: vec![],
            ..Default::default()
        };
        let s = fmt_case(&c);
        assert!(s.contains("auth/login"));
        assert!(s.contains("Login Flow"));
        assert!(s.contains("high"));
        assert!(!s.contains("tags:"));
    }

    #[test]
    fn fmt_case_with_tags() {
        let c = pb::Case {
            path: "auth/login".to_owned(),
            title: "Login".to_owned(),
            description: "".to_owned(),
            priority: "medium".to_owned(),
            tags: vec!["smoke".to_owned(), "auth".to_owned()],
            ..Default::default()
        };
        let s = fmt_case(&c);
        assert!(s.contains("tags: smoke, auth"));
    }

    #[test]
    fn fmt_run_meta_no_suite_no_env() {
        let r = pb::RunMeta {
            id: "2026-04-21-smoke".to_owned(),
            date: "2026-04-21".to_owned(),
            tester: "alice".to_owned(),
            status: pb::RunStatus::InProgress as i32,
            suite: "".to_owned(),
            environment: "".to_owned(),
        };
        let s = fmt_run_meta(&r);
        assert!(s.contains("2026-04-21-smoke"));
        assert!(s.contains("alice"));
        assert!(s.contains("in-progress"));
        assert!(!s.contains("suite:"));
        assert!(!s.contains("env:"));
    }

    #[test]
    fn fmt_run_meta_with_suite_and_env() {
        let r = pb::RunMeta {
            id: "2026-04-21-smoke".to_owned(),
            date: "2026-04-21".to_owned(),
            tester: "bob".to_owned(),
            status: pb::RunStatus::Completed as i32,
            suite: "regression".to_owned(),
            environment: "staging".to_owned(),
        };
        let s = fmt_run_meta(&r);
        assert!(s.contains("suite: regression"));
        assert!(s.contains("env: staging"));
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let url = std::env::var("AMELISO_SERVER_URL")
        .unwrap_or_else(|_| "http://[::1]:50052".to_owned());
    let channel = tonic::transport::Channel::from_shared(url)
        .map_err(|e| anyhow::anyhow!("invalid server URL: {e}"))?
        .connect_lazy();
    let service = AmelisoMcp { channel }.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
