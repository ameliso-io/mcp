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
        #[arg(long, help = "Full-text query")]
        query: Option<String>,
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
}

#[derive(Subcommand)]
enum RunsCmd {
    #[command(about = "List test runs")]
    List {
        #[arg(long, env = "AMELISO_REPO")]
        repo: PathBuf,
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
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Cases(cmd) => run_cases(cmd),
        Commands::Runs(cmd) => run_runs(cmd),
        Commands::Suites(cmd) => run_suites(cmd),
        Commands::Coverage { repo } => run_coverage(&repo),
        Commands::Affected { repo, since } => run_affected(&repo, since.as_deref()),
    }
}

fn run_cases(cmd: CasesCmd) -> Result<()> {
    match cmd {
        CasesCmd::List { repo, tags, query } => {
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
                });
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
    }
    Ok(())
}

fn run_runs(cmd: RunsCmd) -> Result<()> {
    match cmd {
        RunsCmd::List { repo } => {
            let runs = repo::list_runs(&repo)?;
            if runs.is_empty() {
                println!("No runs found.");
            } else {
                for r in &runs {
                    println!("{:30} {:12} tester: {}", r.id, r.status, r.tester);
                }
                println!("\n{} run(s)", runs.len());
            }
        }
        RunsCmd::Get { repo, run_id } => {
            let run = repo::get_run(&repo, &run_id)?;
            println!("id:     {}", run.meta.id);
            println!("date:   {}", run.meta.date);
            println!("tester: {}", run.meta.tester);
            println!("status: {}", run.meta.status);
            if let Some(env) = &run.meta.environment {
                println!("env:    {env}");
            }
            println!("\nResults ({}):", run.results.len());
            for r in &run.results {
                println!("  {:40} {}", r.case_path, r.fm.status);
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
        }
        RunsCmd::Record {
            repo,
            run_id,
            case_path,
            status,
            notes,
        } => {
            repo::record_result(
                &repo,
                &run_id,
                &case_path,
                &status,
                notes.as_deref().unwrap_or(""),
            )?;
            println!("Recorded: {case_path} = {status} in run {run_id}");
        }
        RunsCmd::Finalize {
            repo,
            run_id,
            status,
        } => {
            let meta = repo::finalize_run(&repo, &run_id, &status)?;
            println!("Finalized run {} as {}", meta.id, meta.status);
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
            println!("slug:        {slug}");
            println!("name:        {}", s.name);
            if let Some(d) = &s.description {
                println!("description: {d}");
            }
            println!("cases ({}):", s.cases.len());
            for c in &s.cases {
                println!("  {c}");
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
    }
    Ok(())
}

fn run_coverage(repo: &std::path::Path) -> Result<()> {
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
    println!(
        "Coverage ({} run(s), {} case(s))\n",
        runs.len(),
        cases.len()
    );
    println!("{:40} {:8} LAST RUN", "CASE", "STATUS");
    println!("{}", "-".repeat(70));
    let mut never_count = 0usize;
    for c in &cases {
        let (status, run_id) = latest
            .get(&c.case_path)
            .cloned()
            .unwrap_or_else(|| ("never".to_owned(), String::new()));
        if status == "never" {
            never_count += 1;
        }
        println!("{:40} {:8} {}", c.case_path, status, run_id);
    }
    if never_count > 0 {
        println!("\n{never_count} case(s) never run.");
    }
    Ok(())
}

fn run_affected(repo: &std::path::Path, since: Option<&str>) -> Result<()> {
    let cases = repo::list_cases(repo)?;
    let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
    let result = git::find_affected(repo, since, &known_paths)?;
    println!("Reason: {}", result.reason);
    if result.case_paths.is_empty() {
        println!("No cases need re-running.");
    } else {
        println!("\nCases to re-run ({}):", result.case_paths.len());
        for path in &result.case_paths {
            println!("  {path}");
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
