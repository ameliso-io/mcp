use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    build_pending_entries, check_max_len, invalid, repo_err, run_meta_to_pb, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::UpdateRunRequest>,
) -> Result<Response<pb::UpdateRunResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.run_id.is_empty() {
        return Err(invalid("run_id is required"));
    }
    let has_slug = !req.new_slug.is_empty();
    let has_meta = req.commit_sha.is_some() || req.tester.is_some() || req.environment.is_some();
    let has_add_cases = !req.add_cases.is_empty();
    if !has_slug && !has_meta && !has_add_cases {
        return Err(invalid(
            "at least one of new_slug, commit_sha, tester, environment, or add_cases is required",
        ));
    }
    for cp in &req.add_cases {
        check_max_len("add_cases case_path", cp, 200)?;
    }
    // Apply metadata patch first (before rename changes run_id).
    if has_meta {
        repo::patch_run_meta(
            &server.pool,
            &req.repo_id,
            &req.run_id,
            req.commit_sha.as_deref(),
            req.tester.as_deref(),
            req.environment.as_deref(),
        )
        .await
        .map_err(repo_err)?;
    }
    if has_add_cases {
        repo::add_cases_to_run(&server.pool, &req.repo_id, &req.run_id, &req.add_cases)
            .await
            .map_err(repo_err)?;
    }
    let old_run_id = req.run_id.clone();
    let old_result_paths: Vec<String> = if has_slug {
        repo::get_run(&server.pool, &req.repo_id, &req.run_id)
            .await
            .map(|r| r.results.into_iter().map(|res| res.case_path).collect())
            .unwrap_or_default()
    } else {
        vec![]
    };
    let run = if has_slug {
        repo::update_run(&server.pool, &req.repo_id, &req.run_id, &req.new_slug)
            .await
            .map_err(repo_err)?
    } else {
        repo::get_run(&server.pool, &req.repo_id, &req.run_id)
            .await
            .map_err(repo_err)?
            .meta
    };
    {
        let pool = server.pool.clone();
        let repo_id = req.repo_id.clone();
        let run_clone = run.clone();
        let renamed = has_slug;
        tokio::spawn(async move {
            if renamed {
                if let Err(e) =
                    crate::sync::delete_run_files(&pool, &repo_id, &old_run_id, &old_result_paths)
                        .await
                {
                    eprintln!("warning: github sync failed deleting old run {old_run_id}: {e}");
                }
                // Re-push all results under new run_id.
                let results = repo::get_run(&pool, &repo_id, &run_clone.run_id)
                    .await
                    .map(|r| r.results)
                    .unwrap_or_default();
                for result in &results {
                    if let Err(e) =
                        crate::sync::push_result(&pool, &repo_id, &run_clone.run_id, result).await
                    {
                        eprintln!(
                            "warning: github sync failed pushing result {}/{}: {e}",
                            run_clone.run_id, result.case_path
                        );
                    }
                }
            }
            if let Err(e) = crate::sync::push_run_meta(&pool, &repo_id, &run_clone).await {
                eprintln!(
                    "warning: github sync failed for run {}: {e}",
                    run_clone.run_id
                );
            }
        });
    }
    let new_dir_path = format!(".ameliso/runs/{}", run.run_id);
    let pending = if has_add_cases {
        let ((pending_cases, _), statuses) = tokio::join!(
            async {
                repo::get_pending_cases(&server.pool, &req.repo_id, &run.run_id)
                    .await
                    .unwrap_or_default()
            },
            async {
                repo::get_latest_statuses(&server.pool, &req.repo_id)
                    .await
                    .unwrap_or_default()
            },
        );
        build_pending_entries(&pending_cases, &statuses)
    } else {
        vec![]
    };
    Ok(Response::new(pb::UpdateRunResponse {
        run: Some(run_meta_to_pb(&run)),
        new_dir_path,
        pending,
    }))
}
