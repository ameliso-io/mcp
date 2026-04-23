use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    build_pending_entries, check_max_len, find_uncovered_files, invalid, repo_err,
    resolve_affected_case_paths, run_meta_to_pb, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::CreateRunRequest>,
) -> Result<Response<pb::CreateRunResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    let slug = if req.slug.is_empty() {
        let micros = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_micros();
        format!("run-{micros:x}")
    } else {
        req.slug.clone()
    };
    check_max_len("slug", &slug, 100)?;
    check_max_len("tester", &req.tester, 255)?;
    check_max_len("environment", &req.environment, 255)?;
    check_max_len("suite", &req.suite, 100)?;
    let env = if req.environment.is_empty() {
        None
    } else {
        Some(req.environment)
    };
    let suite = if req.suite.is_empty() {
        None
    } else {
        Some(req.suite)
    };
    let tester = if req.tester.is_empty() {
        "unknown".to_owned()
    } else {
        req.tester
    };
    let has_since_ref = !req.since_ref.is_empty();
    let has_changed_files = !req.changed_files.is_empty();
    let use_last_run = req.use_last_run;
    if use_last_run && (has_since_ref || has_changed_files) {
        return Err(invalid(
            "use_last_run and since_ref/changed_files are mutually exclusive",
        ));
    }
    if use_last_run && !req.cases.is_empty() {
        return Err(invalid("use_last_run and cases are mutually exclusive"));
    }
    if use_last_run && suite.is_some() {
        return Err(invalid("use_last_run and suite are mutually exclusive"));
    }
    if (has_since_ref || has_changed_files) && !req.cases.is_empty() {
        return Err(invalid(
            "since_ref/changed_files and cases are mutually exclusive",
        ));
    }
    if (has_since_ref || has_changed_files) && suite.is_some() {
        return Err(invalid(
            "since_ref/changed_files and suite are mutually exclusive",
        ));
    }
    let (inline_cases, diff_files) = if use_last_run {
        let runs = repo::list_runs(&server.pool, &req.repo_id)
            .await
            .unwrap_or_default();
        let last_sha = runs
            .iter()
            .filter(|r| r.status == "completed")
            .max_by(|a, b| a.date.cmp(&b.date).then_with(|| a.run_id.cmp(&b.run_id)))
            .and_then(|r| {
                if r.commit_sha.is_empty() {
                    None
                } else {
                    Some(r.commit_sha.as_str())
                }
            })
            .unwrap_or("");
        resolve_affected_case_paths(&server.pool, &req.repo_id, last_sha, &[]).await?
    } else if has_since_ref || has_changed_files {
        resolve_affected_case_paths(
            &server.pool,
            &req.repo_id,
            &req.since_ref,
            &req.changed_files,
        )
        .await?
    } else {
        (req.cases, vec![])
    };
    let commit_sha = req.commit_sha;
    let meta = repo::create_run(
        &server.pool,
        &req.repo_id,
        &slug,
        &tester,
        env,
        suite,
        inline_cases,
        commit_sha,
    )
    .await
    .map_err(repo_err)?;
    {
        let pool = server.pool.clone();
        let repo_id = req.repo_id.clone();
        let run_clone = meta.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::sync::push_run_meta(&pool, &repo_id, &run_clone).await {
                eprintln!(
                    "warning: github sync failed for run {}: {e}",
                    run_clone.run_id
                );
            }
        });
    }
    let dir_path = format!(".ameliso/runs/{}", meta.run_id);
    let ((pending_cases, _), statuses, all_cases) = tokio::join!(
        async {
            repo::get_pending_cases(&server.pool, &req.repo_id, &meta.run_id)
                .await
                .unwrap_or_default()
        },
        async {
            repo::get_latest_statuses(&server.pool, &req.repo_id)
                .await
                .unwrap_or_default()
        },
        async {
            repo::list_cases(&server.pool, &req.repo_id)
                .await
                .unwrap_or_default()
        },
    );
    let all_known_paths: Vec<String> = all_cases.iter().map(|c| c.case_path.clone()).collect();
    let uncovered_files: Vec<String> = find_uncovered_files(&diff_files, &all_known_paths)
        .into_iter()
        .map(str::to_owned)
        .collect();
    let pending_entries = build_pending_entries(&pending_cases, &statuses);
    Ok(Response::new(pb::CreateRunResponse {
        run: Some(run_meta_to_pb(&meta)),
        dir_path,
        pending: pending_entries,
        total_repo_cases: i32::try_from(all_cases.len()).unwrap_or(i32::MAX),
        uncovered_files,
    }))
}
