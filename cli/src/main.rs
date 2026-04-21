use ameliso_server::proto::ameliso_v1 as pb;
use ameliso_server::proto::ameliso_v1::ameliso_service_client::AmelisoServiceClient;
use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
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

fn run_status_i32_to_str(v: i32) -> &'static str {
    match v {
        x if x == pb::RunStatus::InProgress as i32 => "in-progress",
        x if x == pb::RunStatus::Completed as i32 => "completed",
        x if x == pb::RunStatus::Aborted as i32 => "aborted",
        _ => "unspecified",
    }
}

fn parse_tags(s: &str) -> Vec<String> {
    s.split(',')
        .map(|t| t.trim().to_owned())
        .filter(|t| !t.is_empty())
        .collect()
}

fn grpc_err(e: tonic::Status) -> anyhow::Error {
    anyhow!("{}: {}", e.code(), e.message())
}

fn client(channel: Channel) -> AmelisoServiceClient<Channel> {
    AmelisoServiceClient::new(channel)
}

// ---------------------------------------------------------------------------
// CLI types
// ---------------------------------------------------------------------------

#[derive(Parser)]
#[command(name = "ameliso", about = "Manual testing management CLI")]
struct Cli {
    #[arg(
        long,
        env = "AMELISO_SERVER_URL",
        default_value = "http://[::1]:50052",
        global = true,
        help = "URL of the Ameliso gRPC server"
    )]
    server: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(subcommand, about = "Manage test cases")]
    Cases(CasesCmd),
    #[command(subcommand, about = "Manage test runs")]
    Runs(RunsCmd),
    #[command(subcommand, about = "Manage test suites")]
    Suites(SuitesCmd),
    #[command(about = "Show coverage report")]
    Coverage {
        #[arg(long, env = "AMELISO_REPO_ID", help = "Repository ID, e.g. owner/repo")]
        repo_id: String,
        #[arg(
            long,
            help = "Filter by status: never | passed | failed | blocked | skipped"
        )]
        status: Option<String>,
    },
    #[command(about = "Show which cases need re-running after recent code changes")]
    Affected {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        #[arg(long, help = "Git ref to compare from (default: last completed run)")]
        since: Option<String>,
    },
    #[command(about = "Show a combined repo status snapshot: case counts, coverage, active runs")]
    Status {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
    },
}

#[derive(Subcommand)]
enum CasesCmd {
    #[command(about = "List test cases")]
    List {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        #[arg(long, help = "Comma-separated tags to filter by")]
        tags: Option<String>,
        #[arg(
            long,
            help = "Full-text query (searches title, description, body, path)"
        )]
        query: Option<String>,
        #[arg(long, help = "Filter by priority: low | medium | high")]
        priority: Option<String>,
        #[arg(long, help = "Filter to cases in this suite slug")]
        suite: Option<String>,
    },
    #[command(about = "Show a single test case")]
    Get {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        case_path: String,
    },
    #[command(about = "Create a new test case")]
    Create {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        case_path: String,
        #[arg(long)]
        title: String,
        #[arg(long, help = "One-line description (optional)")]
        description: Option<String>,
        #[arg(long, help = "Comma-separated tags")]
        tags: Option<String>,
        #[arg(long, default_value = "medium", help = "low | medium | high")]
        priority: String,
        #[arg(long, help = "Full markdown body (steps, expected results)")]
        body: Option<String>,
    },
    #[command(about = "Update an existing test case")]
    Update {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        case_path: String,
        #[arg(long, help = "New title (omit to keep existing)")]
        title: Option<String>,
        #[arg(long, help = "New description (omit to keep existing)")]
        description: Option<String>,
        #[arg(
            long,
            help = "Comma-separated tags (omit to keep existing; pass empty to clear)"
        )]
        tags: Option<String>,
        #[arg(long, help = "low | medium | high (omit to keep existing)")]
        priority: Option<String>,
        #[arg(long, help = "Replace the full markdown body (omit to keep existing)")]
        body: Option<String>,
    },
    #[command(about = "Delete a test case")]
    Delete {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        case_path: String,
    },
}

#[derive(Subcommand)]
enum RunsCmd {
    #[command(about = "List test runs")]
    List {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        #[arg(
            long,
            value_name = "STATUS",
            help = "Filter by status: in-progress | completed | aborted"
        )]
        status: Option<String>,
    },
    #[command(about = "Show a single run with results")]
    Get {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
    },
    #[command(about = "Create a new test run")]
    Create {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
        #[arg(long)]
        tester: Option<String>,
        #[arg(long)]
        environment: Option<String>,
        #[arg(long)]
        suite: Option<String>,
    },
    #[command(about = "Record a test result")]
    Record {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
        case_path: String,
        #[arg(help = "passed | failed | blocked | skipped")]
        status: String,
        #[arg(long, help = "Notes (required when status is failed or blocked)")]
        notes: Option<String>,
    },
    #[command(about = "Finalize a test run")]
    Finalize {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
        #[arg(help = "completed | aborted")]
        status: String,
    },
    #[command(about = "Show cases in a run's scope that have no result yet")]
    Pending {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
    },
    #[command(about = "Delete a run directory entirely (removes all recorded results)")]
    Delete {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
    },
    #[command(
        about = "Record multiple results in one call",
        long_about = "Record multiple results in one gRPC call. Each entry is case_path:status[:notes]. \
Status must be one of: passed, failed, blocked, skipped. Notes are required for failed/blocked."
    )]
    BulkRecord {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
        #[arg(
            required = true,
            help = "Results in format case_path:status or case_path:status:notes"
        )]
        entries: Vec<String>,
    },
}

#[derive(Subcommand)]
enum SuitesCmd {
    #[command(about = "List test suites")]
    List {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
    },
    #[command(about = "Show a single suite")]
    Get {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
    },
    #[command(about = "Create a new suite")]
    Create {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        description: Option<String>,
        #[arg(long, help = "Comma-separated case paths")]
        cases: String,
    },
    #[command(about = "Update an existing suite")]
    Update {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
        #[arg(long, help = "New name (omit to keep existing)")]
        name: Option<String>,
        #[arg(long, help = "New description (omit to keep existing)")]
        description: Option<String>,
        #[arg(
            long,
            help = "Comma-separated case paths — replaces full list (omit to keep existing)"
        )]
        cases: Option<String>,
    },
    #[command(about = "Delete a suite")]
    Delete {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
    },
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let channel = Channel::from_shared(cli.server.clone())
        .map_err(|e| anyhow!("invalid server URL '{}': {e}", cli.server))?
        .connect_lazy();
    match cli.command {
        Commands::Cases(cmd) => run_cases(channel, cmd).await,
        Commands::Runs(cmd) => run_runs(channel, cmd).await,
        Commands::Suites(cmd) => run_suites(channel, cmd).await,
        Commands::Coverage { repo_id, status } => {
            run_coverage(channel, &repo_id, status.as_deref()).await
        }
        Commands::Affected { repo_id, since } => {
            run_affected(channel, &repo_id, since.as_deref()).await
        }
        Commands::Status { repo_id } => run_status(channel, &repo_id).await,
    }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

async fn run_cases(channel: Channel, cmd: CasesCmd) -> Result<()> {
    let mut c = client(channel);
    match cmd {
        CasesCmd::List {
            repo_id,
            tags,
            query,
            priority,
            suite,
        } => {
            let tag_vec = parse_tags(tags.as_deref().unwrap_or(""));
            let pri = priority
                .as_deref()
                .map(priority_str_to_i32)
                .unwrap_or(pb::Priority::Unspecified as i32);
            let cases = c
                .list_cases(pb::ListCasesRequest {
                    repo_id,
                    tags: tag_vec,
                    priority: pri,
                    query: query.unwrap_or_default(),
                    suite: suite.unwrap_or_default(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .cases;
            if cases.is_empty() {
                println!("No cases found.");
            } else {
                for case in &cases {
                    println!("{:40} {:6}  {}", case.path, case.priority, case.title);
                }
                println!("\n{} case(s)", cases.len());
            }
        }
        CasesCmd::Get { repo_id, case_path } => {
            let resp = c
                .get_case(pb::GetCaseRequest { repo_id, case_path })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let case = resp.case.as_ref().unwrap();
            println!("path:        {}", case.path);
            println!("title:       {}", case.title);
            println!("description: {}", case.description);
            println!("tags:        {}", case.tags.join(", "));
            println!("priority:    {}", case.priority);
            println!("created_at:  {}", case.created_at);
            println!("updated_at:  {}", case.updated_at);
            println!("\n{}", resp.body);
        }
        CasesCmd::Create {
            repo_id,
            case_path,
            title,
            description,
            tags,
            priority,
            body,
        } => {
            let resp = c
                .create_case(pb::CreateCaseRequest {
                    repo_id,
                    case_path,
                    title,
                    description: description.unwrap_or_default(),
                    tags: parse_tags(tags.as_deref().unwrap_or("")),
                    priority: priority_str_to_i32(&priority),
                    body: body.unwrap_or_default(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let case = resp.case.as_ref().unwrap();
            println!("Created: {}", resp.file_path);
            println!("title:       {}", case.title);
            println!("description: {}", case.description);
            println!("priority:    {}", case.priority);
            println!(
                "tags:        {}",
                if case.tags.is_empty() {
                    "(none)".to_owned()
                } else {
                    case.tags.join(", ")
                }
            );
        }
        CasesCmd::Update {
            repo_id,
            case_path,
            title,
            description,
            tags,
            priority,
            body,
        } => {
            let tag_vec = parse_tags(tags.as_deref().unwrap_or(""));
            let pri = priority
                .as_deref()
                .map(priority_str_to_i32)
                .unwrap_or(pb::Priority::Unspecified as i32);
            let resp = c
                .update_case(pb::UpdateCaseRequest {
                    repo_id,
                    case_path,
                    title: title.unwrap_or_default(),
                    description: description.unwrap_or_default(),
                    tags: tag_vec,
                    priority: pri,
                    body: body.unwrap_or_default(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let case = resp.case.as_ref().unwrap();
            println!("Updated: cases/{}.md", case.path);
            println!("title:       {}", case.title);
            println!("description: {}", case.description);
            println!("priority:    {}", case.priority);
            println!(
                "tags:        {}",
                if case.tags.is_empty() {
                    "(none)".to_owned()
                } else {
                    case.tags.join(", ")
                }
            );
        }
        CasesCmd::Delete { repo_id, case_path } => {
            let resp = c
                .delete_case(pb::DeleteCaseRequest { repo_id, case_path })
                .await
                .map_err(grpc_err)?
                .into_inner();
            println!("Deleted: {}", resp.file_path);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

async fn run_runs(channel: Channel, cmd: RunsCmd) -> Result<()> {
    let mut c = client(channel);
    match cmd {
        RunsCmd::List { repo_id, status } => {
            let status_i32 = status
                .as_deref()
                .map(run_status_str_to_i32)
                .unwrap_or(pb::RunStatus::Unspecified as i32);
            let runs = c
                .list_runs(pb::ListRunsRequest {
                    repo_id,
                    status: status_i32,
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .runs;
            if runs.is_empty() {
                println!("No runs found.");
            } else {
                for r in &runs {
                    let suite_part = if r.suite.is_empty() {
                        String::new()
                    } else {
                        format!(" [suite: {}]", r.suite)
                    };
                    let env_part = if r.environment.is_empty() {
                        String::new()
                    } else {
                        format!(" [env: {}]", r.environment)
                    };
                    println!(
                        "{:30} {:12} tester: {}{}{}",
                        r.id,
                        run_status_i32_to_str(r.status),
                        r.tester,
                        suite_part,
                        env_part
                    );
                }
                println!("\n{} run(s)", runs.len());
            }
        }
        RunsCmd::Get { repo_id, run_id } => {
            let run = c
                .get_run(pb::GetRunRequest {
                    repo_id: repo_id.clone(),
                    run_id: run_id.clone(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .run
                .unwrap();
            let meta = run.meta.as_ref().unwrap();
            println!("id:     {}", meta.id);
            println!("date:   {}", meta.date);
            println!("tester: {}", meta.tester);
            println!("status: {}", run_status_i32_to_str(meta.status));
            if !meta.environment.is_empty() {
                println!("env:    {}", meta.environment);
            }
            if !meta.suite.is_empty() {
                println!("suite:  {}", meta.suite);
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
            println!(
                "summary: {} passed, {} failed, {} blocked, {} skipped ({} total)",
                passed,
                failed,
                blocked,
                skipped,
                run.results.len()
            );
            println!("\nResults ({}):", run.results.len());
            for r in &run.results {
                println!(
                    "  {:40} {}",
                    r.case_path,
                    result_status_i32_to_str(r.status)
                );
                if !r.notes.trim().is_empty() {
                    println!("    notes: {}", r.notes.trim());
                }
            }
        }
        RunsCmd::Create {
            repo_id,
            slug,
            tester,
            environment,
            suite,
        } => {
            let tester = tester
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| std::env::var("USER").unwrap_or_else(|_| "unknown".to_owned()));
            let resp = c
                .create_run(pb::CreateRunRequest {
                    repo_id: repo_id.clone(),
                    slug,
                    tester,
                    environment: environment.unwrap_or_default(),
                    suite: suite.unwrap_or_default(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let meta = resp.run.as_ref().unwrap();
            println!("Created run: {}", meta.id);
            println!("Directory:   {}", resp.dir_path);
            if let Ok(pending_resp) = c
                .get_pending_cases(pb::GetPendingCasesRequest {
                    repo_id,
                    run_id: meta.id.clone(),
                })
                .await
            {
                let p = pending_resp.into_inner();
                println!("Scope:       {} case(s) to test:", p.total_in_scope);
                for case in &p.cases {
                    let tags = if case.tags.is_empty() {
                        String::new()
                    } else {
                        format!(", tags: {}", case.tags.join(", "))
                    };
                    println!(
                        "  {} — {} (priority: {}{})",
                        case.path, case.title, case.priority, tags
                    );
                }
            }
        }
        RunsCmd::Record {
            repo_id,
            run_id,
            case_path,
            status,
            notes,
        } => {
            let status_i32 = result_status_str_to_i32(&status);
            c.record_result(pb::RecordResultRequest {
                repo_id: repo_id.clone(),
                run_id: run_id.clone(),
                case_path: case_path.clone(),
                status: status_i32,
                notes: notes.unwrap_or_default(),
            })
            .await
            .map_err(grpc_err)?;
            println!("Recorded: {case_path} = {status} in run {run_id}");
            if let Ok(resp) = c
                .get_pending_cases(pb::GetPendingCasesRequest {
                    repo_id,
                    run_id,
                })
                .await
            {
                let resp = resp.into_inner();
                let total = resp.total_in_scope as usize;
                let pending = resp.cases.len();
                if pending == 0 {
                    println!("Progress: {total}/{total} done — all cases recorded");
                } else {
                    println!(
                        "Progress: {}/{total} done, {} remaining",
                        total - pending,
                        pending
                    );
                }
            }
        }
        RunsCmd::Finalize {
            repo_id,
            run_id,
            status,
        } => {
            let status_i32 = run_status_str_to_i32(&status);
            let meta = c
                .finalize_run(pb::FinalizeRunRequest {
                    repo_id: repo_id.clone(),
                    run_id: run_id.clone(),
                    status: status_i32,
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .run
                .unwrap();
            println!(
                "Finalized run {} as {}",
                meta.id,
                run_status_i32_to_str(meta.status)
            );
            if let Ok(run_resp) = c
                .get_run(pb::GetRunRequest {
                    repo_id,
                    run_id: meta.id.clone(),
                })
                .await
            {
                let run = run_resp.into_inner().run.unwrap();
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
                println!(
                    "Summary: {} passed, {} failed, {} blocked, {} skipped ({} total)",
                    passed,
                    failed,
                    blocked,
                    skipped,
                    run.results.len()
                );
            }
        }
        RunsCmd::Pending { repo_id, run_id } => {
            let resp = c
                .get_pending_cases(pb::GetPendingCasesRequest { repo_id, run_id })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let total = resp.total_in_scope as usize;
            let pending = &resp.cases;
            if pending.is_empty() {
                println!("All {total} case(s) in scope have results recorded.");
            } else {
                println!(
                    "Pending ({}/{} cases still need results):",
                    pending.len(),
                    total
                );
                for case in pending {
                    let tags = if case.tags.is_empty() {
                        String::new()
                    } else {
                        format!(", tags: {}", case.tags.join(", "))
                    };
                    println!(
                        "  {} — {} (priority: {}{})",
                        case.path, case.title, case.priority, tags
                    );
                }
            }
        }
        RunsCmd::Delete { repo_id, run_id } => {
            let resp = c
                .delete_run(pb::DeleteRunRequest { repo_id, run_id })
                .await
                .map_err(grpc_err)?
                .into_inner();
            println!("Deleted: {}", resp.dir_path);
        }
        RunsCmd::BulkRecord {
            repo_id,
            run_id,
            entries,
        } => {
            let mut grpc_entries: Vec<pb::BulkResultEntry> = Vec::new();
            for raw in &entries {
                let parts: Vec<&str> = raw.splitn(3, ':').collect();
                if parts.len() < 2 {
                    anyhow::bail!(
                        "invalid entry {:?}: expected case_path:status[:notes]",
                        raw
                    );
                }
                let case_path = parts[0].to_owned();
                let status_str = parts[1];
                let notes = parts.get(2).map(|s| s.to_string()).unwrap_or_default();
                grpc_entries.push(pb::BulkResultEntry {
                    case_path,
                    status: result_status_str_to_i32(status_str),
                    notes,
                });
            }
            let resp = c
                .bulk_record_results(pb::BulkRecordResultsRequest {
                    repo_id,
                    run_id,
                    results: grpc_entries,
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            for r in &resp.results {
                println!("recorded: {}", r.case_path);
            }
            let pending = resp.pending_count as usize;
            let total = resp.total_in_scope as usize;
            if pending == 0 {
                println!("progress: {total}/{total} done — all cases recorded; ready to finalize");
            } else {
                println!(
                    "progress: {}/{total} done, {pending} remaining",
                    total - pending
                );
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

async fn run_suites(channel: Channel, cmd: SuitesCmd) -> Result<()> {
    let mut c = client(channel);
    match cmd {
        SuitesCmd::List { repo_id } => {
            let suites = c
                .list_suites(pb::ListSuitesRequest { repo_id })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .suites;
            if suites.is_empty() {
                println!("No suites found.");
            } else {
                for s in &suites {
                    let desc = if s.description.is_empty() {
                        String::new()
                    } else {
                        format!(" — {}", s.description)
                    };
                    println!("{:20} {} ({} cases){}", s.slug, s.name, s.cases.len(), desc);
                }
            }
        }
        SuitesCmd::Get { repo_id, slug } => {
            let suite = c
                .get_suite(pb::GetSuiteRequest {
                    repo_id,
                    slug: slug.clone(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .suite
                .unwrap();
            println!("slug:        {slug}");
            println!("name:        {}", suite.name);
            if !suite.description.is_empty() {
                println!("description: {}", suite.description);
            }
            println!("cases ({}):", suite.cases.len());
            for path in &suite.cases {
                println!("  {path}");
            }
        }
        SuitesCmd::Create {
            repo_id,
            slug,
            name,
            description,
            cases,
        } => {
            let case_list: Vec<String> = cases
                .split(',')
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty())
                .collect();
            let resp = c
                .create_suite(pb::CreateSuiteRequest {
                    repo_id,
                    slug,
                    name,
                    description: description.unwrap_or_default(),
                    cases: case_list,
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            println!("Created: {}", resp.file_path);
        }
        SuitesCmd::Update {
            repo_id,
            slug,
            name,
            description,
            cases,
        } => {
            let case_list: Vec<String> = parse_tags(cases.as_deref().unwrap_or(""));
            c.update_suite(pb::UpdateSuiteRequest {
                repo_id,
                slug: slug.clone(),
                name: name.unwrap_or_default(),
                description: description.unwrap_or_default(),
                cases: case_list,
            })
            .await
            .map_err(grpc_err)?;
            println!("Updated: suites/{slug}.yaml");
        }
        SuitesCmd::Delete { repo_id, slug } => {
            let resp = c
                .delete_suite(pb::DeleteSuiteRequest {
                    repo_id,
                    slug: slug.clone(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            println!("Deleted: {}", resp.file_path);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Coverage report
// ---------------------------------------------------------------------------

async fn run_coverage(channel: Channel, repo_id: &str, status_filter: Option<&str>) -> Result<()> {
    let mut c = client(channel);
    let status_i32 = status_filter
        .map(result_status_str_to_i32)
        .unwrap_or(pb::ResultStatus::Unspecified as i32);
    let resp = c
        .get_coverage_report(pb::GetCoverageReportRequest {
            repo_id: repo_id.to_owned(),
            status_filter: status_i32,
        })
        .await
        .map_err(grpc_err)?
        .into_inner();

    let total = resp.entries.len();
    let mut counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for e in &resp.entries {
        *counts
            .entry(result_status_i32_to_str(e.latest_status))
            .or_insert(0) += 1;
    }

    println!(
        "Coverage ({} run(s), {} total: {} passed, {} failed, {} blocked, {} skipped, {} never run)\n",
        resp.run_count,
        total,
        counts.get("passed").copied().unwrap_or(0),
        counts.get("failed").copied().unwrap_or(0),
        counts.get("blocked").copied().unwrap_or(0),
        counts.get("skipped").copied().unwrap_or(0),
        counts.get("never").copied().unwrap_or(0),
    );

    let status_rank = |s: &str| match s {
        "failed" => 0u8,
        "blocked" => 1,
        "never" => 2,
        "skipped" => 3,
        "passed" => 4,
        _ => 5,
    };
    let priority_rank = |p: &str| match p {
        "high" => 0u8,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    };

    let mut entries: Vec<_> = resp.entries.iter().collect();
    entries.sort_by(|a, b| {
        let a_s = result_status_i32_to_str(a.latest_status);
        let b_s = result_status_i32_to_str(b.latest_status);
        status_rank(a_s)
            .cmp(&status_rank(b_s))
            .then_with(|| {
                let ap = a.case.as_ref().map(|c| c.priority.as_str()).unwrap_or("");
                let bp = b.case.as_ref().map(|c| c.priority.as_str()).unwrap_or("");
                priority_rank(ap).cmp(&priority_rank(bp))
            })
            .then_with(|| {
                let ap = a.case.as_ref().map(|c| c.path.as_str()).unwrap_or("");
                let bp = b.case.as_ref().map(|c| c.path.as_str()).unwrap_or("");
                ap.cmp(bp)
            })
    });

    println!("{:40} {:8} LAST RUN", "CASE", "STATUS");
    println!("{}", "-".repeat(70));
    for e in &entries {
        let status = result_status_i32_to_str(e.latest_status);
        let path = e.case.as_ref().map(|c| c.path.as_str()).unwrap_or("");
        let title = e.case.as_ref().map(|c| c.title.as_str()).unwrap_or("");
        println!(
            "{:40} {:8} {} — {}",
            path, status, e.last_run_id, title
        );
    }

    let never = counts.get("never").copied().unwrap_or(0);
    if never > 0 && status_filter.is_none() {
        println!("\n{never} case(s) never run.");
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Affected cases
// ---------------------------------------------------------------------------

async fn run_affected(channel: Channel, repo_id: &str, since: Option<&str>) -> Result<()> {
    let mut c = client(channel);
    let resp = c
        .get_affected_cases(pb::GetAffectedCasesRequest {
            repo_id: repo_id.to_owned(),
            since_ref: since.unwrap_or("").to_owned(),
        })
        .await
        .map_err(grpc_err)?
        .into_inner();

    println!("Reason: {}", resp.reason);
    if resp.cases.is_empty() {
        println!("No cases need re-running.");
    } else {
        println!("\nCases to re-run ({}, high priority first):", resp.cases.len());
        for ac in &resp.cases {
            if let Some(case) = &ac.case {
                let tags = if case.tags.is_empty() {
                    String::new()
                } else {
                    format!(", tags: {}", case.tags.join(", "))
                };
                println!(
                    "  {} — {} (priority: {}{})",
                    case.path, case.title, case.priority, tags
                );
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async fn run_status(channel: Channel, repo_id: &str) -> Result<()> {
    let mut c1 = client(channel.clone());
    let mut c2 = client(channel.clone());
    let mut c3 = client(channel.clone());
    let (cov_res, suites_res, runs_res) = tokio::join!(
        c1.get_coverage_report(pb::GetCoverageReportRequest {
            repo_id: repo_id.to_owned(),
            status_filter: pb::ResultStatus::Unspecified as i32,
        }),
        c2.list_suites(pb::ListSuitesRequest {
            repo_id: repo_id.to_owned(),
        }),
        c3.list_runs(pb::ListRunsRequest {
            repo_id: repo_id.to_owned(),
            status: pb::RunStatus::Unspecified as i32,
        }),
    );
    let cov = cov_res.map_err(grpc_err)?.into_inner();
    let suites = suites_res.map_err(grpc_err)?.into_inner().suites;
    let runs = runs_res.map_err(grpc_err)?.into_inner().runs;

    let total = cov.entries.len();
    let mut high = 0usize;
    let mut medium = 0usize;
    let mut low = 0usize;
    let mut counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for e in &cov.entries {
        if let Some(case) = &e.case {
            match case.priority.as_str() {
                "high" => high += 1,
                "medium" => medium += 1,
                "low" => low += 1,
                _ => {}
            }
        }
        *counts
            .entry(result_status_i32_to_str(e.latest_status))
            .or_insert(0) += 1;
    }

    println!(
        "Cases:    {} total  ({high} high, {medium} medium, {low} low)",
        total
    );
    println!(
        "Coverage: {} passed, {} failed, {} blocked, {} skipped, {} never run",
        counts.get("passed").copied().unwrap_or(0),
        counts.get("failed").copied().unwrap_or(0),
        counts.get("blocked").copied().unwrap_or(0),
        counts.get("skipped").copied().unwrap_or(0),
        counts.get("never").copied().unwrap_or(0),
    );
    println!("Suites:   {}", suites.len());
    println!("Runs:     {} total", runs.len());

    let active: Vec<&pb::RunMeta> = runs
        .iter()
        .filter(|r| r.status == pb::RunStatus::InProgress as i32)
        .collect();
    if active.is_empty() {
        println!("Active:   none");
    } else {
        println!("Active runs ({}):", active.len());
        let pending_futures: Vec<_> = active
            .iter()
            .map(|r| {
                let mut c = client(channel.clone());
                let repo_id = repo_id.to_owned();
                let run_id = r.id.clone();
                async move {
                    c.get_pending_cases(pb::GetPendingCasesRequest { repo_id, run_id })
                        .await
                }
            })
            .collect();
        let pending_results = futures::future::join_all(pending_futures).await;
        for (r, pend_res) in active.iter().zip(pending_results) {
            let suite_part = if r.suite.is_empty() {
                String::new()
            } else {
                format!("  suite: {}", r.suite)
            };
            let pending_part = match pend_res {
                Ok(resp) => {
                    let resp = resp.into_inner();
                    let pending = resp.cases.len();
                    let total = resp.total_in_scope as usize;
                    let done = total.saturating_sub(pending);
                    format!("  {done}/{total} done, {pending} pending")
                }
                Err(_) => String::new(),
            };
            println!(
                "  [{}]  tester: {}{}{}",
                r.id, r.tester, suite_part, pending_part
            );
        }
    }
    Ok(())
}
