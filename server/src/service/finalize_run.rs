use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    invalid, repo_err, result_status_to_i32, run_meta_with_counts_to_pb, run_status_from_i32,
    AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::FinalizeRunRequest>,
) -> Result<Response<pb::FinalizeRunResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.run_id.is_empty() {
        return Err(invalid("run_id is required"));
    }
    let status = run_status_from_i32(req.status);
    if status == "in-progress" {
        return Err(invalid("status must be completed or aborted"));
    }
    // For UNSPECIFIED, fetch results to auto-detect status; reuse them for the response.
    let pre_results = if matches!(status, "completed" | "aborted") {
        None
    } else {
        let run = repo::get_run(&server.pool, &req.repo_id, &req.run_id)
            .await
            .map_err(repo_err)?;
        Some(run.results)
    };
    let resolved_status = if matches!(status, "completed" | "aborted") {
        status
    } else {
        if pre_results
            .as_ref()
            .is_some_and(|rs| rs.iter().any(|r| r.status == "failed"))
        {
            "aborted"
        } else {
            "completed"
        }
    };
    let meta = repo::finalize_run(&server.pool, &req.repo_id, &req.run_id, resolved_status)
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
    // Get results: reuse pre-fetched ones (UNSPECIFIED path) or fetch now (explicit status).
    let results = match pre_results {
        Some(rs) => rs,
        None => repo::get_run(&server.pool, &req.repo_id, &req.run_id)
            .await
            .map(|r| r.results)
            .unwrap_or_default(),
    };
    let (p, f, b, s) = results
        .iter()
        .fold((0i32, 0i32, 0i32, 0i32), |(p, f, b, s), r| {
            match r.status.as_str() {
                "passed" => (p + 1, f, b, s),
                "failed" => (p, f + 1, b, s),
                "blocked" => (p, f, b + 1, s),
                "skipped" => (p, f, b, s + 1),
                _ => (p, f, b, s),
            }
        });
    let pb_results: Vec<pb::CaseResult> = results
        .into_iter()
        .map(|r| pb::CaseResult {
            case_path: r.case_path,
            status: result_status_to_i32(&r.status),
            notes: r.notes,
        })
        .collect();
    Ok(Response::new(pb::FinalizeRunResponse {
        run: Some(run_meta_with_counts_to_pb(&meta, p, f, b, s, p + f + b + s)),
        results: pb_results,
    }))
}
