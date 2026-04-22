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
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Show which cases need re-running after recent code changes")]
    Affected {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        #[arg(long, help = "Git ref to compare from (e.g. HEAD~5). If omitted, all cases are flagged.")]
        since: Option<String>,
        #[arg(
            long,
            value_delimiter = ',',
            help = "Comma-separated file paths (from git diff --name-only). Skips GitHub comparison."
        )]
        files: Vec<String>,
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Show a combined repo status snapshot: case counts, coverage, active runs")]
    Status {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(subcommand, about = "Manage connected GitHub repositories")]
    Repos(ReposCmd),
    #[command(about = "Check connectivity to the Ameliso gRPC server")]
    Health {
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
}

#[derive(Subcommand)]
enum ReposCmd {
    #[command(about = "List all connected GitHub repositories and their repo IDs")]
    List {
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Force a full re-sync of case files from GitHub")]
    Sync {
        #[arg(help = "Repository ID, e.g. owner/repo")]
        repo_id: String,
    },
    #[command(about = "Remove a connected GitHub repository and all its synced case data")]
    Remove {
        #[arg(help = "Repository ID, e.g. owner/repo")]
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Show a single test case")]
    Get {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        case_path: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Delete a test case")]
    Delete {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        case_path: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(
        about = "Create multiple test cases at once",
        long_about = "Create multiple test cases in one call.\n\
Each ENTRY is: case_path:title or case_path:title:priority or case_path:title:priority:tags\n\
Example: ameliso cases bulk-create auth/login:\"User Login\":high billing/checkout:Checkout:medium"
    )]
    BulkCreate {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        #[arg(
            required = true,
            help = "ENTRY: case_path:title[:priority[:tags]]  (colon-separated)"
        )]
        entries: Vec<String>,
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Show a single run with results")]
    Get {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Create a new test run")]
    Create {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
        #[arg(long, env = "AMELISO_TESTER")]
        tester: Option<String>,
        #[arg(long, env = "AMELISO_ENVIRONMENT")]
        environment: Option<String>,
        #[arg(long)]
        suite: Option<String>,
        #[arg(
            long,
            value_delimiter = ',',
            help = "Comma-separated case paths to scope the run (alternative to --suite; cannot be used with --suite)"
        )]
        cases: Vec<String>,
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Finalize a test run")]
    Finalize {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
        #[arg(help = "completed | aborted")]
        status: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Show cases in a run's scope that have no result yet")]
    Pending {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        run_id: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
}

#[derive(Subcommand)]
enum SuitesCmd {
    #[command(about = "List test suites")]
    List {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Show a single suite")]
    Get {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    #[command(about = "Delete a suite")]
    Delete {
        #[arg(long, env = "AMELISO_REPO_ID")]
        repo_id: String,
        slug: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
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
        Commands::Coverage { repo_id, status, json } => {
            run_coverage(channel, &repo_id, status.as_deref(), json).await
        }
        Commands::Affected { repo_id, since, files, json } => {
            run_affected(channel, &repo_id, since.as_deref(), files, json).await
        }
        Commands::Status { repo_id, json } => run_status(channel, &repo_id, json).await,
        Commands::Repos(cmd) => run_repos(channel, cmd).await,
        Commands::Health { json } => {
            let mut c = client(channel);
            match c.list_repositories(pb::ListRepositoriesRequest {}).await {
                Ok(_) => {
                    if json {
                        println!("{}", serde_json::json!({"status": "ok"}));
                    } else {
                        println!("ok");
                    }
                }
                Err(e) => {
                    if json {
                        println!("{}", serde_json::json!({"status": "error", "message": e.message()}));
                    } else {
                        eprintln!("error: {}", e.message());
                    }
                    std::process::exit(1);
                }
            }
            Ok(())
        }
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
            json,
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
            if json {
                let arr: Vec<_> = cases
                    .iter()
                    .map(|c| {
                        serde_json::json!({
                            "path": c.path,
                            "title": c.title,
                            "description": c.description,
                            "tags": c.tags,
                            "priority": c.priority,
                            "created_at": c.created_at,
                            "updated_at": c.updated_at,
                        })
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&arr)?);
            } else if cases.is_empty() {
                println!("No cases found.");
            } else {
                for case in &cases {
                    println!("{:40} {:6}  {}", case.path, case.priority, case.title);
                }
                println!("\n{} case(s)", cases.len());
            }
        }
        CasesCmd::Get { repo_id, case_path, json } => {
            let resp = c
                .get_case(pb::GetCaseRequest { repo_id, case_path })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let case = resp.case.as_ref().ok_or_else(|| anyhow::anyhow!("server returned no case"))?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "path": case.path,
                        "title": case.title,
                        "description": case.description,
                        "tags": case.tags,
                        "priority": case.priority,
                        "created_at": case.created_at,
                        "updated_at": case.updated_at,
                        "body": resp.body,
                    }))?
                );
            } else {
                println!("path:        {}", case.path);
                println!("title:       {}", case.title);
                println!("description: {}", case.description);
                println!("tags:        {}", case.tags.join(", "));
                println!("priority:    {}", case.priority);
                println!("created_at:  {}", case.created_at);
                println!("updated_at:  {}", case.updated_at);
                println!("\n{}", resp.body);
            }
        }
        CasesCmd::Create {
            repo_id,
            case_path,
            title,
            description,
            tags,
            priority,
            body,
            json,
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
            let case = resp.case.as_ref().ok_or_else(|| anyhow::anyhow!("server returned no case"))?;
            if json {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "file_path": resp.file_path,
                    "path": case.path,
                    "title": case.title,
                    "description": case.description,
                    "priority": case.priority,
                    "tags": case.tags,
                }))?);
            } else {
                println!("Created: {}", resp.file_path);
                println!("title:       {}", case.title);
                println!("description: {}", case.description);
                println!("priority:    {}", case.priority);
                println!(
                    "tags:        {}",
                    if case.tags.is_empty() { "(none)".to_owned() } else { case.tags.join(", ") }
                );
            }
        }
        CasesCmd::Update {
            repo_id,
            case_path,
            title,
            description,
            tags,
            priority,
            body,
            json,
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
            let case = resp.case.as_ref().ok_or_else(|| anyhow::anyhow!("server returned no case"))?;
            if json {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "file_path": format!("cases/{}.md", case.path),
                    "path": case.path,
                    "title": case.title,
                    "description": case.description,
                    "priority": case.priority,
                    "tags": case.tags,
                }))?);
            } else {
                println!("Updated: cases/{}.md", case.path);
                println!("title:       {}", case.title);
                println!("description: {}", case.description);
                println!("priority:    {}", case.priority);
                println!(
                    "tags:        {}",
                    if case.tags.is_empty() { "(none)".to_owned() } else { case.tags.join(", ") }
                );
            }
        }
        CasesCmd::Delete { repo_id, case_path, json } => {
            let resp = c
                .delete_case(pb::DeleteCaseRequest { repo_id, case_path })
                .await
                .map_err(grpc_err)?
                .into_inner();
            if json {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "file_path": resp.file_path,
                }))?);
            } else {
                println!("Deleted: {}", resp.file_path);
            }
        }
        CasesCmd::BulkCreate { repo_id, entries, json } => {
            let mut parsed_entries: Vec<pb::BulkCaseEntry> = Vec::new();
            for entry in &entries {
                let parts: Vec<&str> = entry.splitn(4, ':').collect();
                let case_path = parts.first().copied().unwrap_or("").to_owned();
                let title = parts.get(1).copied().unwrap_or("").to_owned();
                if case_path.is_empty() || title.is_empty() {
                    return Err(anyhow!(
                        "invalid entry '{}': expected case_path:title[:priority[:tags]]",
                        entry
                    ));
                }
                let priority = priority_str_to_i32(parts.get(2).copied().unwrap_or("medium"));
                let tags: Vec<String> = parts
                    .get(3)
                    .copied()
                    .unwrap_or("")
                    .split(',')
                    .map(|s| s.trim().to_owned())
                    .filter(|s| !s.is_empty())
                    .collect();
                parsed_entries.push(pb::BulkCaseEntry {
                    case_path,
                    title,
                    description: String::new(),
                    tags,
                    priority,
                    body: String::new(),
                });
            }
            let cases = c
                .bulk_create_cases(pb::BulkCreateCasesRequest {
                    repo_id,
                    cases: parsed_entries,
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .cases;
            if json {
                let arr: Vec<_> = cases
                    .iter()
                    .map(|c| serde_json::json!({
                        "case_path": c.path,
                        "title": c.title,
                        "priority": c.priority,
                        "tags": c.tags,
                    }))
                    .collect();
                println!("{}", serde_json::to_string_pretty(&arr)?);
            } else {
                for c in &cases {
                    println!("created: {} ({})", c.path, c.priority);
                }
                println!("total: {} case(s)", cases.len());
            }
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
        RunsCmd::List { repo_id, status, json } => {
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
            if json {
                let arr: Vec<_> = runs
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "id": r.id,
                            "date": r.date,
                            "tester": r.tester,
                            "status": run_status_i32_to_str(r.status),
                            "suite": r.suite,
                            "environment": r.environment,
                        })
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&arr)?);
            } else if runs.is_empty() {
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
        RunsCmd::Get { repo_id, run_id, json } => {
            let run = c
                .get_run(pb::GetRunRequest {
                    repo_id: repo_id.clone(),
                    run_id: run_id.clone(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .run
                .ok_or_else(|| anyhow::anyhow!("server returned no run"))?;
            let meta = run.meta.as_ref().ok_or_else(|| anyhow::anyhow!("server returned no run meta"))?;
            if json {
                let results: Vec<_> = run
                    .results
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "case_path": r.case_path,
                            "status": result_status_i32_to_str(r.status),
                            "notes": r.notes,
                        })
                    })
                    .collect();
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "id": meta.id,
                        "date": meta.date,
                        "tester": meta.tester,
                        "status": run_status_i32_to_str(meta.status),
                        "suite": meta.suite,
                        "environment": meta.environment,
                        "results": results,
                    }))?
                );
            } else {
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
        }
        RunsCmd::Create {
            repo_id,
            slug,
            tester,
            environment,
            suite,
            cases,
            json,
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
                    cases,
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let meta = resp.run.as_ref().ok_or_else(|| anyhow::anyhow!("server returned no run"))?;
            let pending_resp = c
                .get_pending_cases(pb::GetPendingCasesRequest {
                    repo_id,
                    run_id: meta.id.clone(),
                })
                .await
                .ok()
                .map(|r| r.into_inner());
            if json {
                let scope: Vec<_> = pending_resp
                    .as_ref()
                    .map(|p| {
                        p.cases
                            .iter()
                            .map(|c| serde_json::json!({
                                "path": c.path,
                                "title": c.title,
                                "priority": c.priority,
                                "tags": c.tags,
                            }))
                            .collect()
                    })
                    .unwrap_or_default();
                let total_in_scope = pending_resp.as_ref().map(|p| p.total_in_scope).unwrap_or(0);
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "run_id": meta.id,
                    "dir_path": resp.dir_path,
                    "tester": meta.tester,
                    "status": run_status_i32_to_str(meta.status),
                    "total_in_scope": total_in_scope,
                    "scope": scope,
                }))?);
            } else {
                println!("Created run: {}", meta.id);
                println!("Directory:   {}", resp.dir_path);
                if let Some(p) = &pending_resp {
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
        }
        RunsCmd::Record {
            repo_id,
            run_id,
            case_path,
            status,
            notes,
            json,
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
            let pending_resp = c
                .get_pending_cases(pb::GetPendingCasesRequest { repo_id, run_id: run_id.clone() })
                .await
                .ok()
                .map(|r| r.into_inner());
            if json {
                let total = pending_resp.as_ref().map(|p| p.total_in_scope as usize).unwrap_or(0);
                let pending = pending_resp.as_ref().map(|p| p.cases.len()).unwrap_or(0);
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "case_path": case_path,
                    "status": status,
                    "run_id": run_id,
                    "done": total.saturating_sub(pending),
                    "total": total,
                    "remaining": pending,
                }))?);
            } else {
                println!("Recorded: {case_path} = {status} in run {run_id}");
                if let Some(resp) = pending_resp {
                    let total = resp.total_in_scope as usize;
                    let pending = resp.cases.len();
                    if pending == 0 {
                        println!("Progress: {total}/{total} done — all cases recorded");
                    } else {
                        println!("Progress: {}/{total} done, {} remaining", total - pending, pending);
                    }
                }
            }
        }
        RunsCmd::Finalize {
            repo_id,
            run_id,
            status,
            json,
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
                .ok_or_else(|| anyhow::anyhow!("server returned no run"))?;
            let run = c
                .get_run(pb::GetRunRequest { repo_id, run_id: meta.id.clone() })
                .await
                .ok()
                .and_then(|r| r.into_inner().run);
            let (passed, failed, blocked, skipped, total) = run.as_ref().map(|r| {
                let p = r.results.iter().filter(|x| x.status == pb::ResultStatus::Passed as i32).count();
                let f = r.results.iter().filter(|x| x.status == pb::ResultStatus::Failed as i32).count();
                let b = r.results.iter().filter(|x| x.status == pb::ResultStatus::Blocked as i32).count();
                let s = r.results.iter().filter(|x| x.status == pb::ResultStatus::Skipped as i32).count();
                (p, f, b, s, r.results.len())
            }).unwrap_or((0, 0, 0, 0, 0));
            if json {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "run_id": meta.id,
                    "status": run_status_i32_to_str(meta.status),
                    "passed": passed,
                    "failed": failed,
                    "blocked": blocked,
                    "skipped": skipped,
                    "total": total,
                }))?);
            } else {
                println!("Finalized run {} as {}", meta.id, run_status_i32_to_str(meta.status));
                if total > 0 {
                    println!("Summary: {passed} passed, {failed} failed, {blocked} blocked, {skipped} skipped ({total} total)");
                }
            }
        }
        RunsCmd::Pending { repo_id, run_id, json } => {
            let resp = c
                .get_pending_cases(pb::GetPendingCasesRequest { repo_id, run_id })
                .await
                .map_err(grpc_err)?
                .into_inner();
            let total = resp.total_in_scope as usize;
            let pending = &resp.cases;
            if json {
                let cases_json: Vec<serde_json::Value> = pending
                    .iter()
                    .map(|c| {
                        serde_json::json!({
                            "path": c.path,
                            "title": c.title,
                            "priority": c.priority,
                            "tags": c.tags,
                        })
                    })
                    .collect();
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "pending_count": pending.len(),
                        "total_in_scope": total,
                        "done": total.saturating_sub(pending.len()),
                        "cases": cases_json,
                    }))
                    .unwrap_or_default()
                );
            } else if pending.is_empty() {
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
            json,
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
            let pending = resp.pending_count as usize;
            let total = resp.total_in_scope as usize;
            if json {
                let results_json: Vec<serde_json::Value> = resp
                    .results
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "case_path": r.case_path,
                            "status": result_status_i32_to_str(r.status),
                        })
                    })
                    .collect();
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "results": results_json,
                        "pending_count": pending,
                        "total_in_scope": total,
                        "done": total.saturating_sub(pending),
                    }))
                    .unwrap_or_default()
                );
            } else {
                for r in &resp.results {
                    println!("recorded: {}", r.case_path);
                }
                if pending == 0 {
                    println!(
                        "progress: {total}/{total} done — all cases recorded; ready to finalize"
                    );
                } else {
                    println!(
                        "progress: {}/{total} done, {pending} remaining",
                        total - pending
                    );
                }
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
        SuitesCmd::List { repo_id, json } => {
            let suites = c
                .list_suites(pb::ListSuitesRequest { repo_id })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .suites;
            if json {
                let arr: Vec<_> = suites
                    .iter()
                    .map(|s| {
                        serde_json::json!({
                            "slug": s.slug,
                            "name": s.name,
                            "description": s.description,
                            "cases": s.cases,
                        })
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&arr)?);
            } else if suites.is_empty() {
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
        SuitesCmd::Get { repo_id, slug, json } => {
            let suite = c
                .get_suite(pb::GetSuiteRequest {
                    repo_id,
                    slug: slug.clone(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .suite
                .ok_or_else(|| anyhow::anyhow!("server returned no suite"))?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "slug": slug,
                        "name": suite.name,
                        "description": suite.description,
                        "cases": suite.cases,
                    }))?
                );
            } else {
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
        }
        SuitesCmd::Create {
            repo_id,
            slug,
            name,
            description,
            cases,
            json,
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
            let suite = resp.suite.as_ref().ok_or_else(|| anyhow::anyhow!("server returned no suite"))?;
            if json {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "file_path": resp.file_path,
                    "slug": suite.slug,
                    "name": suite.name,
                    "case_count": suite.cases.len(),
                }))?);
            } else {
                println!("Created: {}", resp.file_path);
            }
        }
        SuitesCmd::Update {
            repo_id,
            slug,
            name,
            description,
            cases,
            json,
        } => {
            let replace_cases = cases.is_some();
            let case_list: Vec<String> = parse_tags(cases.as_deref().unwrap_or(""));
            let resp = c.update_suite(pb::UpdateSuiteRequest {
                repo_id,
                slug: slug.clone(),
                name: name.unwrap_or_default(),
                description: description.unwrap_or_default(),
                cases: case_list,
                replace_cases,
            })
            .await
            .map_err(grpc_err)?
            .into_inner();
            if json {
                let suite = resp.suite.as_ref().ok_or_else(|| anyhow::anyhow!("server returned no suite"))?;
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "file_path": format!("suites/{slug}.yaml"),
                    "slug": suite.slug,
                    "name": suite.name,
                    "case_count": suite.cases.len(),
                }))?);
            } else {
                println!("Updated: suites/{slug}.yaml");
            }
        }
        SuitesCmd::Delete { repo_id, slug, json } => {
            let resp = c
                .delete_suite(pb::DeleteSuiteRequest {
                    repo_id,
                    slug: slug.clone(),
                })
                .await
                .map_err(grpc_err)?
                .into_inner();
            if json {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "file_path": resp.file_path,
                }))?);
            } else {
                println!("Deleted: {}", resp.file_path);
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Coverage report
// ---------------------------------------------------------------------------

async fn run_coverage(
    channel: Channel,
    repo_id: &str,
    status_filter: Option<&str>,
    json: bool,
) -> Result<()> {
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

    if json {
        let entries: Vec<_> = resp
            .entries
            .iter()
            .map(|e| {
                serde_json::json!({
                    "path": e.case.as_ref().map(|c| c.path.as_str()).unwrap_or(""),
                    "title": e.case.as_ref().map(|c| c.title.as_str()).unwrap_or(""),
                    "priority": e.case.as_ref().map(|c| c.priority.as_str()).unwrap_or(""),
                    "status": result_status_i32_to_str(e.latest_status),
                    "last_run_id": e.last_run_id,
                    "last_run_date": e.last_run_date,
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "run_count": resp.run_count,
                "entries": entries,
            }))?
        );
        return Ok(());
    }

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

async fn run_affected(
    channel: Channel,
    repo_id: &str,
    since: Option<&str>,
    files: Vec<String>,
    json: bool,
) -> Result<()> {
    let mut c = client(channel);
    let resp = c
        .get_affected_cases(pb::GetAffectedCasesRequest {
            repo_id: repo_id.to_owned(),
            since_ref: since.unwrap_or("").to_owned(),
            changed_files: files,
        })
        .await
        .map_err(grpc_err)?
        .into_inner();

    if json {
        let cases: Vec<_> = resp
            .cases
            .iter()
            .filter_map(|ac| {
                ac.case.as_ref().map(|case| {
                    serde_json::json!({
                        "path": case.path,
                        "title": case.title,
                        "priority": case.priority,
                        "tags": case.tags,
                        "reason": ac.reason,
                    })
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "reason": resp.reason,
                "cases": cases,
            }))?
        );
        return Ok(());
    }

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

async fn run_status(channel: Channel, repo_id: &str, json: bool) -> Result<()> {
    let mut c = client(channel);
    let s = c
        .get_repo_status(pb::GetRepoStatusRequest {
            repo_id: repo_id.to_owned(),
        })
        .await
        .map_err(grpc_err)?
        .into_inner();

    if json {
        let active_json: Vec<_> = s
            .active_runs
            .iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.run_id,
                    "tester": r.tester,
                    "suite": r.suite,
                    "date": r.date,
                    "pending": r.pending_cases,
                    "total_in_scope": r.total_in_scope,
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "cases": {
                    "total": s.total_cases,
                    "high": s.high_cases,
                    "medium": s.medium_cases,
                    "low": s.low_cases,
                },
                "coverage": {
                    "passed": s.passed,
                    "failed": s.failed,
                    "blocked": s.blocked,
                    "skipped": s.skipped,
                    "never": s.never_run,
                },
                "suite_count": s.suite_count,
                "run_count": s.run_count,
                "active_runs": active_json,
            }))?
        );
        return Ok(());
    }

    println!(
        "Cases:    {} total  ({} high, {} medium, {} low)",
        s.total_cases, s.high_cases, s.medium_cases, s.low_cases
    );
    println!(
        "Coverage: {} passed, {} failed, {} blocked, {} skipped, {} never run",
        s.passed, s.failed, s.blocked, s.skipped, s.never_run
    );
    println!("Suites:   {}", s.suite_count);
    println!("Runs:     {} total", s.run_count);

    if s.active_runs.is_empty() {
        println!("Active:   none");
    } else {
        println!("Active runs ({}):", s.active_runs.len());
        for r in &s.active_runs {
            let suite_part = if r.suite.is_empty() {
                String::new()
            } else {
                format!("  suite: {}", r.suite)
            };
            let pending = r.pending_cases as usize;
            let total = r.total_in_scope as usize;
            let done = total.saturating_sub(pending);
            let pending_part = format!("  {done}/{total} done, {pending} pending");
            println!(
                "  [{}]  tester: {}{}{}",
                r.run_id, r.tester, suite_part, pending_part
            );
        }
    }
    Ok(())
}

async fn run_repos(channel: Channel, cmd: ReposCmd) -> Result<()> {
    match cmd {
        ReposCmd::List { json } => {
            let mut c = client(channel);
            let repos = c
                .list_repositories(pb::ListRepositoriesRequest {})
                .await
                .map_err(grpc_err)?
                .into_inner()
                .repositories;
            if json {
                let arr: Vec<_> = repos
                    .iter()
                    .map(|r| {
                        serde_json::json!({
                            "repo_id": r.full_name,
                            "name": r.name,
                            "url": r.html_url,
                            "added_at": r.added_at,
                        })
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&arr)?);
            } else if repos.is_empty() {
                println!("No repositories connected.");
            } else {
                for r in &repos {
                    println!("{:<40}  {}", r.full_name, r.html_url);
                }
            }
        }
        ReposCmd::Sync { repo_id } => {
            let mut c = client(channel);
            let repo = c
                .sync_repository(pb::SyncRepositoryRequest { id: repo_id })
                .await
                .map_err(grpc_err)?
                .into_inner()
                .repository
                .ok_or_else(|| anyhow!("server returned empty repository"))?;
            println!("synced: {}", repo.full_name);
        }
        ReposCmd::Remove { repo_id } => {
            let mut c = client(channel);
            c.remove_repository(pb::RemoveRepositoryRequest { id: repo_id.clone() })
                .await
                .map_err(grpc_err)?;
            println!("removed: {repo_id}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    // -----------------------------------------------------------------------
    // Clap argument parsing
    // -----------------------------------------------------------------------

    #[test]
    fn cli_cases_list_parses_repo_id() {
        let cli = Cli::try_parse_from(["ameliso", "cases", "list", "--repo-id", "owner/repo"])
            .expect("should parse");
        assert!(matches!(cli.command, Commands::Cases(CasesCmd::List { .. })));
    }

    #[test]
    fn cli_cases_get_parses_path() {
        let cli =
            Cli::try_parse_from(["ameliso", "cases", "get", "--repo-id", "owner/repo", "auth/login"])
                .expect("should parse");
        if let Commands::Cases(CasesCmd::Get { case_path, .. }) = cli.command {
            assert_eq!(case_path, "auth/login");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_cases_create_parses_required_fields() {
        let cli = Cli::try_parse_from([
            "ameliso", "cases", "create",
            "--repo-id", "owner/repo",
            "auth/login",
            "--title", "Login Flow",
        ])
        .expect("should parse");
        if let Commands::Cases(CasesCmd::Create { case_path, title, priority, .. }) = cli.command {
            assert_eq!(case_path, "auth/login");
            assert_eq!(title, "Login Flow");
            assert_eq!(priority, "medium");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_cases_create_accepts_priority_flag() {
        let cli = Cli::try_parse_from([
            "ameliso", "cases", "create",
            "--repo-id", "owner/repo",
            "auth/login",
            "--title", "T",
            "--priority", "high",
        ])
        .expect("should parse");
        if let Commands::Cases(CasesCmd::Create { priority, .. }) = cli.command {
            assert_eq!(priority, "high");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_cases_delete_parses_path() {
        let cli = Cli::try_parse_from([
            "ameliso", "cases", "delete", "--repo-id", "owner/repo", "auth/login",
        ])
        .expect("should parse");
        assert!(matches!(cli.command, Commands::Cases(CasesCmd::Delete { .. })));
    }

    #[test]
    fn cli_cases_bulk_create_parses_entries() {
        let cli = Cli::try_parse_from([
            "ameliso", "cases", "bulk-create",
            "--repo-id", "owner/repo",
            "auth/login:User Login:high",
            "billing/checkout:Checkout:medium",
        ])
        .expect("should parse");
        if let Commands::Cases(CasesCmd::BulkCreate { entries, json, .. }) = cli.command {
            assert_eq!(entries.len(), 2);
            assert!(!json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_cases_bulk_create_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "cases", "bulk-create",
            "--repo-id", "owner/repo",
            "--json",
            "auth/login:Login:high",
        ])
        .expect("should parse");
        if let Commands::Cases(CasesCmd::BulkCreate { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_list_parses_repo_id() {
        let cli = Cli::try_parse_from(["ameliso", "runs", "list", "--repo-id", "owner/repo"])
            .expect("should parse");
        assert!(matches!(cli.command, Commands::Runs(RunsCmd::List { .. })));
    }

    #[test]
    fn cli_runs_create_parses_slug() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "create", "--repo-id", "owner/repo", "2026-01-01-smoke",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Create { slug, .. }) = cli.command {
            assert_eq!(slug, "2026-01-01-smoke");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_create_with_cases_parses() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "create",
            "--repo-id", "owner/repo",
            "--cases", "auth/login,billing/checkout",
            "2026-01-01-affected",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Create { cases, slug, .. }) = cli.command {
            assert_eq!(slug, "2026-01-01-affected");
            assert_eq!(cases, vec!["auth/login", "billing/checkout"]);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_record_parses_status() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "record",
            "--repo-id", "owner/repo",
            "2026-01-01-smoke", "auth/login", "passed",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Record { status, .. }) = cli.command {
            assert_eq!(status, "passed");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_finalize_parses_status() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "finalize",
            "--repo-id", "owner/repo",
            "2026-01-01-smoke", "completed",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Finalize { status, .. }) = cli.command {
            assert_eq!(status, "completed");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_bulk_record_parses_entries() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "bulk-record",
            "--repo-id", "owner/repo",
            "2026-01-01-smoke",
            "auth/login:passed",
            "auth/logout:failed:broken",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::BulkRecord { entries, .. }) = cli.command {
            assert_eq!(entries.len(), 2);
            assert_eq!(entries[0], "auth/login:passed");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_bulk_record_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "bulk-record",
            "--repo-id", "owner/repo",
            "--json",
            "2026-01-01-smoke",
            "auth/login:passed",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::BulkRecord { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_suites_list_parses_repo_id() {
        let cli = Cli::try_parse_from(["ameliso", "suites", "list", "--repo-id", "owner/repo"])
            .expect("should parse");
        assert!(matches!(cli.command, Commands::Suites(SuitesCmd::List { .. })));
    }

    #[test]
    fn cli_suites_create_parses_required_fields() {
        let cli = Cli::try_parse_from([
            "ameliso", "suites", "create",
            "--repo-id", "owner/repo",
            "smoke",
            "--name", "Smoke Tests",
            "--cases", "auth/login,auth/logout",
        ])
        .expect("should parse");
        if let Commands::Suites(SuitesCmd::Create { slug, name, cases, .. }) = cli.command {
            assert_eq!(slug, "smoke");
            assert_eq!(name, "Smoke Tests");
            assert_eq!(cases, "auth/login,auth/logout");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_list_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "list", "--repo-id", "owner/repo", "--json",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::List { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_suites_list_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "suites", "list", "--repo-id", "owner/repo", "--json",
        ])
        .expect("should parse");
        if let Commands::Suites(SuitesCmd::List { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_coverage_parses_repo_id() {
        let cli = Cli::try_parse_from(["ameliso", "coverage", "--repo-id", "owner/repo"])
            .expect("should parse");
        assert!(matches!(cli.command, Commands::Coverage { .. }));
    }

    #[test]
    fn cli_affected_parses_with_since() {
        let cli = Cli::try_parse_from([
            "ameliso", "affected", "--repo-id", "owner/repo", "--since", "abc123",
        ])
        .expect("should parse");
        if let Commands::Affected { since, .. } = cli.command {
            assert_eq!(since, Some("abc123".to_owned()));
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_status_parses_repo_id() {
        let cli = Cli::try_parse_from(["ameliso", "status", "--repo-id", "owner/repo"])
            .expect("should parse");
        assert!(matches!(cli.command, Commands::Status { .. }));
    }

    #[test]
    fn cli_cases_list_json_flag_defaults_false() {
        let cli = Cli::try_parse_from(["ameliso", "cases", "list", "--repo-id", "owner/repo"])
            .expect("should parse");
        if let Commands::Cases(CasesCmd::List { json, .. }) = cli.command {
            assert!(!json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_cases_get_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "cases", "get", "--repo-id", "owner/repo", "--json", "auth/login",
        ])
        .expect("should parse");
        if let Commands::Cases(CasesCmd::Get { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_get_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "get", "--repo-id", "owner/repo", "--json", "2026-01-01-smoke",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Get { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_suites_get_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "suites", "get", "--repo-id", "owner/repo", "--json", "smoke",
        ])
        .expect("should parse");
        if let Commands::Suites(SuitesCmd::Get { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_cases_list_json_flag_set() {
        let cli =
            Cli::try_parse_from(["ameliso", "cases", "list", "--repo-id", "owner/repo", "--json"])
                .expect("should parse");
        if let Commands::Cases(CasesCmd::List { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_coverage_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "coverage", "--repo-id", "owner/repo", "--json",
        ])
        .expect("should parse");
        if let Commands::Coverage { json, .. } = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_affected_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "affected", "--repo-id", "owner/repo", "--json",
        ])
        .expect("should parse");
        if let Commands::Affected { json, .. } = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_affected_files_flag_parses() {
        let cli = Cli::try_parse_from([
            "ameliso", "affected", "--repo-id", "owner/repo",
            "--files", "src/auth.ts,src/login.tsx",
        ])
        .expect("should parse");
        if let Commands::Affected { files, .. } = cli.command {
            assert_eq!(files, vec!["src/auth.ts", "src/login.tsx"]);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_status_json_flag_set() {
        let cli =
            Cli::try_parse_from(["ameliso", "status", "--repo-id", "owner/repo", "--json"])
                .expect("should parse");
        if let Commands::Status { json, .. } = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_missing_required_arg_fails() {
        let result = Cli::try_parse_from(["ameliso", "cases", "get", "--repo-id", "owner/repo"]);
        assert!(result.is_err(), "missing positional arg should fail");
    }

    #[test]
    fn cli_server_flag_overrides_default() {
        let cli = Cli::try_parse_from([
            "ameliso", "--server", "http://localhost:9090",
            "coverage", "--repo-id", "owner/repo",
        ])
        .expect("should parse");
        assert_eq!(cli.server, "http://localhost:9090");
    }

    #[test]
    fn priority_str_to_i32_known_values() {
        assert_eq!(priority_str_to_i32("low"), pb::Priority::Low as i32);
        assert_eq!(priority_str_to_i32("medium"), pb::Priority::Medium as i32);
        assert_eq!(priority_str_to_i32("high"), pb::Priority::High as i32);
    }

    #[test]
    fn priority_str_to_i32_case_insensitive() {
        assert_eq!(priority_str_to_i32("LOW"), pb::Priority::Low as i32);
        assert_eq!(priority_str_to_i32("HIGH"), pb::Priority::High as i32);
    }

    #[test]
    fn priority_str_to_i32_unknown_returns_unspecified() {
        assert_eq!(
            priority_str_to_i32("extreme"),
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
        // in_progress → replaces '_' with '-' → "in-progress"
        assert_eq!(
            run_status_str_to_i32("in_progress"),
            pb::RunStatus::InProgress as i32
        );
    }

    #[test]
    fn run_status_str_to_i32_unknown_returns_unspecified() {
        assert_eq!(
            run_status_str_to_i32("running"),
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
    fn parse_tags_comma_separated() {
        assert_eq!(
            parse_tags("auth,smoke,regression"),
            vec!["auth", "smoke", "regression"]
        );
    }

    #[test]
    fn parse_tags_trims_whitespace() {
        assert_eq!(
            parse_tags("auth , smoke , regression"),
            vec!["auth", "smoke", "regression"]
        );
    }

    #[test]
    fn parse_tags_filters_empty_segments() {
        // Trailing comma or double comma creates empty segment — filtered out.
        assert_eq!(parse_tags("auth,,smoke,"), vec!["auth", "smoke"]);
    }

    #[test]
    fn parse_tags_empty_string_returns_empty() {
        let result: Vec<String> = parse_tags("");
        assert!(result.is_empty());
    }

    #[test]
    fn parse_tags_single_tag() {
        assert_eq!(parse_tags("smoke"), vec!["smoke"]);
    }

    #[test]
    fn grpc_err_formats_code_and_message() {
        let status = tonic::Status::not_found("resource not found");
        let err = grpc_err(status);
        let msg = err.to_string();
        assert!(msg.contains("not found"), "expected code in: {msg}");
        assert!(msg.contains("resource not found"), "expected message in: {msg}");
    }

    #[test]
    fn grpc_err_internal_status() {
        let status = tonic::Status::internal("db unreachable");
        let err = grpc_err(status);
        let msg = err.to_string();
        assert!(
            msg.to_lowercase().contains("internal"),
            "expected code in: {msg}"
        );
        assert!(msg.contains("db unreachable"), "expected message in: {msg}");
    }

    #[test]
    fn cli_repos_list_parses() {
        let cli = Cli::try_parse_from(["ameliso", "repos", "list"])
            .expect("should parse");
        assert!(matches!(cli.command, Commands::Repos(ReposCmd::List { .. })));
    }

    #[test]
    fn cli_repos_list_json_flag_set() {
        let cli = Cli::try_parse_from(["ameliso", "repos", "list", "--json"])
            .expect("should parse");
        if let Commands::Repos(ReposCmd::List { json }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_repos_sync_parses_repo_id() {
        let cli = Cli::try_parse_from(["ameliso", "repos", "sync", "owner/repo"])
            .expect("should parse");
        if let Commands::Repos(ReposCmd::Sync { repo_id }) = cli.command {
            assert_eq!(repo_id, "owner/repo");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_repos_remove_parses_repo_id() {
        let cli = Cli::try_parse_from(["ameliso", "repos", "remove", "owner/repo"])
            .expect("should parse");
        if let Commands::Repos(ReposCmd::Remove { repo_id }) = cli.command {
            assert_eq!(repo_id, "owner/repo");
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_health_parses() {
        let cli = Cli::try_parse_from(["ameliso", "health"]).expect("should parse");
        assert!(matches!(cli.command, Commands::Health { .. }));
    }

    #[test]
    fn cli_health_json_flag_set() {
        let cli = Cli::try_parse_from(["ameliso", "health", "--json"]).expect("should parse");
        if let Commands::Health { json } = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_cases_create_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "cases", "create",
            "--repo-id", "owner/repo",
            "--title", "Login test",
            "--json",
            "auth/login",
        ])
        .expect("should parse");
        if let Commands::Cases(CasesCmd::Create { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_create_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "create",
            "--repo-id", "owner/repo",
            "--json",
            "smoke",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Create { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_finalize_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "finalize",
            "--repo-id", "owner/repo",
            "--json",
            "2026-01-01-smoke", "completed",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Finalize { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_suites_create_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "suites", "create",
            "--repo-id", "owner/repo",
            "--name", "Smoke",
            "--cases", "auth/login",
            "--json",
            "smoke",
        ])
        .expect("should parse");
        if let Commands::Suites(SuitesCmd::Create { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn cli_runs_pending_json_flag_set() {
        let cli = Cli::try_parse_from([
            "ameliso", "runs", "pending",
            "--repo-id", "owner/repo",
            "--json",
            "2026-04-22-smoke",
        ])
        .expect("should parse");
        if let Commands::Runs(RunsCmd::Pending { json, .. }) = cli.command {
            assert!(json);
        } else {
            panic!("wrong variant");
        }
    }
}
