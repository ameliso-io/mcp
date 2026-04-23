use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo::{self, RunRow};

use super::{invalid, repo_err, run_meta_with_counts_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::GetRepoStatusRequest>,
) -> Result<Response<pb::GetRepoStatusResponse>, Status> {
    let repo_id = request.into_inner().repo_id;
    if repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }

    let pool = &server.pool;
    let (cov_res, suites_res, runs_res) = tokio::join!(
        repo::get_coverage_report(pool, &repo_id),
        repo::list_suites(pool, &repo_id),
        repo::list_runs(pool, &repo_id),
    );

    let (cov_entries, _run_count_cov) = cov_res.map_err(repo_err)?;
    let suites = suites_res.map_err(repo_err)?;
    let runs = runs_res.map_err(repo_err)?;

    let mut total_cases = 0i32;
    let mut high_cases = 0i32;
    let mut medium_cases = 0i32;
    let mut low_cases = 0i32;
    let mut passed = 0i32;
    let mut failed = 0i32;
    let mut blocked = 0i32;
    let mut skipped = 0i32;
    let mut never_run = 0i32;

    for e in &cov_entries {
        total_cases += 1;
        match e.priority.as_str() {
            "high" => high_cases += 1,
            "medium" => medium_cases += 1,
            "low" => low_cases += 1,
            _ => {}
        }
        match e.latest_status.as_str() {
            "passed" => passed += 1,
            "failed" => failed += 1,
            "blocked" => blocked += 1,
            "skipped" => skipped += 1,
            _ => never_run += 1,
        }
    }

    let active_runs_meta: Vec<&RunRow> =
        runs.iter().filter(|r| r.status == "in-progress").collect();

    // Fetch pending counts for all active runs in parallel.
    let mut join_set: tokio::task::JoinSet<(String, i32, i32)> = tokio::task::JoinSet::new();
    for run_meta in &active_runs_meta {
        let pool = pool.clone();
        let repo_id = repo_id.clone();
        let run_id = run_meta.run_id.clone();
        join_set.spawn(async move {
            match repo::get_pending_cases(&pool, &repo_id, &run_id).await {
                Ok((cases, total)) => (
                    run_id,
                    i32::try_from(cases.len()).unwrap_or(i32::MAX),
                    i32::try_from(total).unwrap_or(i32::MAX),
                ),
                Err(_) => (run_id, 0, 0),
            }
        });
    }
    let mut pending_map: std::collections::HashMap<String, (i32, i32)> =
        std::collections::HashMap::new();
    while let Some(res) = join_set.join_next().await {
        if let Ok((run_id, pending, total)) = res {
            pending_map.insert(run_id, (pending, total));
        }
    }
    let active_runs: Vec<pb::ActiveRunStatus> = active_runs_meta
        .iter()
        .map(|run_meta| {
            let (pending, total_in_scope) =
                pending_map.get(&run_meta.run_id).copied().unwrap_or((0, 0));
            pb::ActiveRunStatus {
                run_id: run_meta.run_id.clone(),
                tester: run_meta.tester.clone(),
                suite: run_meta.suite.clone().unwrap_or_default(),
                date: run_meta.date.clone(),
                pending_cases: pending,
                total_in_scope,
                commit_sha: run_meta.commit_sha.clone(),
                environment: run_meta.environment.clone().unwrap_or_default(),
            }
        })
        .collect();

    let last_completed_run_row = runs
        .iter()
        .filter(|r| r.status == "completed")
        .max_by(|a, b| a.date.cmp(&b.date).then_with(|| a.run_id.cmp(&b.run_id)));
    let last_completed_run = if let Some(row) = last_completed_run_row {
        let counts: (i64, i64, i64, i64) = sqlx::query_as(
            "SELECT
             COUNT(*) FILTER (WHERE status='passed'),
             COUNT(*) FILTER (WHERE status='failed'),
             COUNT(*) FILTER (WHERE status='blocked'),
             COUNT(*) FILTER (WHERE status='skipped')
             FROM results WHERE repo_id=$1 AND run_id=$2",
        )
        .bind(&repo_id)
        .bind(&row.run_id)
        .fetch_one(pool)
        .await
        .unwrap_or((0, 0, 0, 0));
        let (p, f, b, s) = (
            counts.0 as i32,
            counts.1 as i32,
            counts.2 as i32,
            counts.3 as i32,
        );
        Some(run_meta_with_counts_to_pb(row, p, f, b, s, p + f + b + s))
    } else {
        None
    };

    Ok(Response::new(pb::GetRepoStatusResponse {
        total_cases,
        high_cases,
        medium_cases,
        low_cases,
        passed,
        failed,
        blocked,
        skipped,
        never_run,
        suite_count: i32::try_from(suites.len()).unwrap_or(i32::MAX),
        run_count: i32::try_from(runs.len()).unwrap_or(i32::MAX),
        active_runs,
        last_completed_run,
    }))
}
