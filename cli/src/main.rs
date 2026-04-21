use std::path::PathBuf;

use ameliso_server::{git, repo};
use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "ameliso", about = "Manual testing management CLI")]
struct Cli {
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
        #[arg(long, env = "AMELISO_REPO", help = "Path to the test repository")]
        repo: PathBuf,
        #[arg(
            long,
            help = "Filter by status: never | passed | failed | blocked | skipped"
        )]
        status: Option<String>,
    },
    #[command(about = "Show which cases need re-running after recent code changes")]
    Affected {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        #[arg(long, help = "Git ref to compare from (default: last run commit)")]
        since: Option<String>,
    },
}

#[derive(Subcommand)]
enum CasesCmd {
    #[command(about = "List test cases")]
    List {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        #[arg(long, help = "Comma-separated tags to filter by")]
        tags: Option<String>,
        #[arg(
            long,
            help = "Full-text query (searches title, description, body, path)"
        )]
        query: Option<String>,
        #[arg(long, help = "Filter by priority: low | medium | high")]
        priority: Option<String>,
    },
    #[command(about = "Show a single test case")]
    Get {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        case_path: String,
    },
    #[command(about = "Create a new test case")]
    Create {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        case_path: String,
        #[arg(long)]
        title: String,
        #[arg(long)]
        description: String,
        #[arg(long, help = "Comma-separated tags")]
        tags: Option<String>,
        #[arg(long, default_value = "medium", help = "low | medium | high")]
        priority: String,
        #[arg(long, help = "Full markdown body (steps, expected results)")]
        body: Option<String>,
    },
    #[command(about = "Update an existing test case")]
    Update {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        case_path: String,
        #[arg(long)]
        title: String,
        #[arg(long)]
        description: String,
        #[arg(long, help = "Comma-separated tags")]
        tags: Option<String>,
        #[arg(long, default_value = "medium", help = "low | medium | high")]
        priority: String,
        #[arg(long, help = "Replace the full markdown body")]
        body: Option<String>,
    },
    #[command(about = "Delete a test case")]
    Delete {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        case_path: String,
    },
}

#[derive(Subcommand)]
enum RunsCmd {
    #[command(about = "List test runs")]
    List {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        #[arg(
            long,
            value_name = "STATUS",
            help = "Filter by status: in-progress | completed | aborted"
        )]
        status: Option<String>,
    },
    #[command(about = "Show a single run with results")]
    Get {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        run_id: String,
    },
    #[command(about = "Create a new test run")]
    Create {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
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
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        run_id: String,
        case_path: String,
        #[arg(help = "passed | failed | blocked | skipped")]
        status: String,
        #[arg(long)]
        notes: Option<String>,
    },
    #[command(about = "Finalize a test run")]
    Finalize {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        run_id: String,
        #[arg(help = "completed | aborted")]
        status: String,
    },
    #[command(about = "Show cases in a run's scope that have no result yet")]
    Pending {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        run_id: String,
    },
}

#[derive(Subcommand)]
enum SuitesCmd {
    #[command(about = "List test suites")]
    List {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
    },
    #[command(about = "Show a single suite")]
    Get {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        slug: String,
    },
    #[command(about = "Create a new suite")]
    Create {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
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
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        slug: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        description: Option<String>,
        #[arg(long, help = "Comma-separated case paths")]
        cases: String,
    },
    #[command(about = "Delete a suite")]
    Delete {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
        slug: String,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Cases(cmd) => run_cases(cmd),
        Commands::Runs(cmd) => run_runs(cmd),
        Commands::Suites(cmd) => run_suites(cmd),
        Commands::Coverage { repo, status } => run_coverage(&repo, status.as_deref()),
        Commands::Affected { repo, since } => run_affected(&repo, since.as_deref()),
    }
}

fn run_cases(cmd: CasesCmd) -> Result<()> {
    match cmd {
        CasesCmd::List {
            repo,
            tags,
            query,
            priority,
        } => {
            let mut cases = repo::list_cases(&repo)?;
            if let Some(t) = &tags {
                let filter: Vec<&str> = t.split(',').map(|s| s.trim()).collect();
                cases.retain(|c| {
                    filter
                        .iter()
                        .all(|f| c.fm.tags.iter().any(|ct| ct.eq_ignore_ascii_case(f)))
                });
            }
            if let Some(q) = &query {
                let q = q.to_lowercase();
                cases.retain(|c| {
                    c.fm.title.to_lowercase().contains(&q)
                        || c.fm.description.to_lowercase().contains(&q)
                        || c.case_path.to_lowercase().contains(&q)
                        || c.body.to_lowercase().contains(&q)
                });
            }
            if let Some(p) = &priority {
                cases.retain(|c| c.fm.priority.eq_ignore_ascii_case(p));
            }
            if cases.is_empty() {
                println!("No cases found.");
            } else {
                for c in &cases {
                    println!("{:40} {:6}  {}", c.case_path, c.fm.priority, c.fm.title);
                }
                println!("\n{} case(s)", cases.len());
            }
        }
        CasesCmd::Get { repo, case_path } => {
            let c = repo::get_case(&repo, &case_path)?;
            println!("path:        {}", c.case_path);
            println!("title:       {}", c.fm.title);
            println!("description: {}", c.fm.description);
            println!("tags:        {}", c.fm.tags.join(", "));
            println!("priority:    {}", c.fm.priority);
            println!("created_at:  {}", c.fm.created_at);
            println!("updated_at:  {}", c.fm.updated_at);
            println!("\n{}", c.body);
        }
        CasesCmd::Create {
            repo,
            case_path,
            title,
            description,
            tags,
            priority,
            body,
        } => {
            let tag_list = parse_tags(tags.as_deref());
            let c = repo::create_case(
                &repo,
                &case_path,
                &title,
                &description,
                tag_list,
                &priority,
                body.as_deref(),
            )?;
            println!("Created: cases/{}.md", c.case_path);
        }
        CasesCmd::Update {
            repo,
            case_path,
            title,
            description,
            tags,
            priority,
            body,
        } => {
            let tag_list = parse_tags(tags.as_deref());
            let c = repo::update_case(
                &repo,
                &case_path,
                &title,
                &description,
                tag_list,
                &priority,
                body.as_deref(),
            )?;
            println!("Updated: cases/{}.md", c.case_path);
        }
        CasesCmd::Delete { repo, case_path } => {
            repo::delete_case(&repo, &case_path)?;
            println!("Deleted: cases/{}.md", case_path);
        }
    }
    Ok(())
}

fn run_runs(cmd: RunsCmd) -> Result<()> {
    match cmd {
        RunsCmd::List { repo, status } => {
            let all_runs = repo::list_runs(&repo)?;
            let runs: Vec<_> = if let Some(ref s) = status {
                all_runs.into_iter().filter(|r| r.status == *s).collect()
            } else {
                all_runs
            };
            if runs.is_empty() {
                println!("No runs found.");
            } else {
                for r in &runs {
                    let suite_part = r
                        .suite
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .map(|s| format!(" [suite: {s}]"))
                        .unwrap_or_default();
                    println!(
                        "{:30} {:12} tester: {}{}",
                        r.id, r.status, r.tester, suite_part
                    );
                }
                println!("\n{} run(s)", runs.len());
            }
        }
        RunsCmd::Get { repo, run_id } => {
            let run = repo::get_run(&repo, &run_id)?;
            let case_titles: std::collections::HashMap<String, String> = repo::list_cases(&repo)
                .unwrap_or_default()
                .into_iter()
                .map(|c| (c.case_path, c.fm.title))
                .collect();
            println!("id:     {}", run.meta.id);
            println!("date:   {}", run.meta.date);
            println!("tester: {}", run.meta.tester);
            println!("status: {}", run.meta.status);
            if let Some(env) = &run.meta.environment {
                println!("env:    {env}");
            }
            if let Some(ref suite) = run.meta.suite {
                if !suite.is_empty() {
                    println!("suite:  {suite}");
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
                let title = case_titles
                    .get(&r.case_path)
                    .map(|t| format!(" — {t}"))
                    .unwrap_or_default();
                println!("  {:40} {:8}{}", r.case_path, r.fm.status, title);
                if !r.notes.trim().is_empty() {
                    println!("    notes: {}", r.notes.trim());
                }
            }
        }
        RunsCmd::Create {
            repo,
            slug,
            tester,
            environment,
            suite,
        } => {
            let tester = tester
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| std::env::var("USER").unwrap_or_else(|_| "unknown".to_owned()));
            let (meta, dir_path) = repo::create_run(&repo, &slug, &tester, environment, suite)?;
            println!("Created run: {}", meta.id);
            println!("Directory:   {dir_path}");
            if let Ok((_, total)) = repo::get_pending_cases(&repo, &meta.id) {
                println!("Scope:       {total} case(s) to test");
            }
        }
        RunsCmd::Record {
            repo,
            run_id,
            case_path,
            status,
            notes,
        } => {
            let (_, prev) = repo::record_result(
                &repo,
                &run_id,
                &case_path,
                &status,
                notes.as_deref().unwrap_or(""),
            )?;
            if let Some(old) = prev {
                println!("Updated: {case_path} = {status} in run {run_id} (was: {old})");
            } else {
                println!("Recorded: {case_path} = {status} in run {run_id}");
            }
        }
        RunsCmd::Finalize {
            repo,
            run_id,
            status,
        } => {
            let meta = repo::finalize_run(&repo, &run_id, &status)?;
            println!("Finalized run {} as {}", meta.id, meta.status);
        }
        RunsCmd::Pending { repo, run_id } => {
            let (pending, total) = repo::get_pending_cases(&repo, &run_id)?;
            if pending.is_empty() {
                println!("All {} case(s) in scope have results recorded.", total);
            } else {
                println!(
                    "Pending ({}/{} cases still need results):",
                    pending.len(),
                    total
                );
                for c in &pending {
                    let tags = if c.fm.tags.is_empty() {
                        String::new()
                    } else {
                        format!(", tags: {}", c.fm.tags.join(", "))
                    };
                    println!(
                        "  {} — {} (priority: {}{})",
                        c.case_path, c.fm.title, c.fm.priority, tags
                    );
                }
            }
        }
    }
    Ok(())
}

fn run_suites(cmd: SuitesCmd) -> Result<()> {
    match cmd {
        SuitesCmd::List { repo } => {
            let suites = repo::list_suites(&repo)?;
            if suites.is_empty() {
                println!("No suites found.");
            } else {
                for (slug, s) in &suites {
                    println!("{:20} {} ({} cases)", slug, s.name, s.cases.len());
                }
            }
        }
        SuitesCmd::Get { repo, slug } => {
            let s = repo::get_suite(&repo, &slug)?;
            let case_titles: std::collections::HashMap<String, String> = repo::list_cases(&repo)
                .unwrap_or_default()
                .into_iter()
                .map(|c| (c.case_path, c.fm.title))
                .collect();
            println!("slug:        {slug}");
            println!("name:        {}", s.name);
            if let Some(d) = &s.description {
                println!("description: {d}");
            }
            println!("cases ({}):", s.cases.len());
            for path in &s.cases {
                let title = case_titles
                    .get(path)
                    .map(|t| format!(" — {t}"))
                    .unwrap_or_default();
                println!("  {path}{title}");
            }
        }
        SuitesCmd::Create {
            repo,
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
            repo::create_suite(&repo, &slug, &name, description, case_list)?;
            println!("Created: suites/{slug}.yaml");
        }
        SuitesCmd::Update {
            repo,
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
            repo::update_suite(&repo, &slug, &name, description, case_list)?;
            println!("Updated: suites/{slug}.yaml");
        }
        SuitesCmd::Delete { repo, slug } => {
            repo::delete_suite(&repo, &slug)?;
            println!("Deleted: suites/{slug}.yaml");
        }
    }
    Ok(())
}

fn run_coverage(repo: &std::path::Path, status_filter: Option<&str>) -> Result<()> {
    let cases = repo::list_cases(repo)?;
    let runs = repo::list_runs(repo)?;
    let mut latest: std::collections::HashMap<String, (String, String)> =
        std::collections::HashMap::new();
    for run_meta in &runs {
        if let Ok(run) = repo::get_run(repo, &run_meta.id) {
            for result in &run.results {
                latest
                    .entry(result.case_path.clone())
                    .or_insert_with(|| (result.fm.status.clone(), run_meta.id.clone()));
            }
        }
    }
    let mut passed = 0usize;
    let mut failed = 0usize;
    let mut blocked = 0usize;
    let mut skipped = 0usize;
    let mut never_count = 0usize;
    for c in &cases {
        match latest.get(&c.case_path).map(|(s, _)| s.as_str()) {
            Some("passed") => passed += 1,
            Some("failed") => failed += 1,
            Some("blocked") => blocked += 1,
            Some("skipped") => skipped += 1,
            _ => never_count += 1,
        }
    }
    println!(
        "Coverage ({} run(s), {} total: {} passed, {} failed, {} blocked, {} skipped, {} never run)\n",
        runs.len(),
        cases.len(),
        passed,
        failed,
        blocked,
        skipped,
        never_count,
    );
    println!("{:40} {:8} LAST RUN", "CASE", "STATUS");
    println!("{}", "-".repeat(70));
    for c in &cases {
        let (status, run_id) = latest
            .get(&c.case_path)
            .cloned()
            .unwrap_or_else(|| ("never".to_owned(), String::new()));
        if let Some(f) = status_filter {
            if status != f {
                continue;
            }
        }
        println!("{:40} {:8} {}", c.case_path, status, run_id);
    }
    if never_count > 0 && status_filter.is_none() {
        println!("\n{never_count} case(s) never run.");
    }
    Ok(())
}

fn run_affected(repo: &std::path::Path, since: Option<&str>) -> Result<()> {
    let cases = repo::list_cases(repo)?;
    let case_map: std::collections::HashMap<&str, &repo::LoadedCase> =
        cases.iter().map(|c| (c.case_path.as_str(), c)).collect();
    let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
    let result = git::find_affected(repo, since, &known_paths)?;
    println!("Reason: {}", result.reason);
    if result.case_paths.is_empty() {
        println!("No cases need re-running.");
    } else {
        println!("\nCases to re-run ({}):", result.case_paths.len());
        for path in &result.case_paths {
            if let Some(c) = case_map.get(path.as_str()) {
                let tags = if c.fm.tags.is_empty() {
                    String::new()
                } else {
                    format!(", tags: {}", c.fm.tags.join(", "))
                };
                println!(
                    "  {} — {} (priority: {}{})",
                    path, c.fm.title, c.fm.priority, tags
                );
            } else {
                println!("  {path}");
            }
        }
    }
    Ok(())
}

fn parse_tags(s: Option<&str>) -> Vec<String> {
    s.unwrap_or("")
        .split(',')
        .map(|t| t.trim().to_owned())
        .filter(|t| !t.is_empty())
        .collect()
}
