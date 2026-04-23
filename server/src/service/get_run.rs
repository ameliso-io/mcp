use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;
use sqlx;

use super::{case_to_pb, invalid, repo_err, result_to_pb, run_meta_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::GetRunRequest>,
) -> Result<Response<pb::GetRunResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.run_id.is_empty() {
        return Err(invalid("run_id is required"));
    }
    let run = repo::get_run(&server.pool, &req.repo_id, &req.run_id)
        .await
        .map_err(repo_err)?;
    let pb_run = pb::Run {
        meta: Some(run_meta_to_pb(&run.meta)),
        results: run.results.iter().map(result_to_pb).collect(),
    };
    // Return in-scope cases so callers skip a separate ListCases call.
    let inline_paths: Vec<String> = sqlx::query_scalar(
        "SELECT case_path FROM run_cases WHERE repo_id=$1 AND run_id=$2 ORDER BY case_path",
    )
    .bind(&req.repo_id)
    .bind(&req.run_id)
    .fetch_all(&server.pool)
    .await
    .unwrap_or_default();
    let run_cases = if inline_paths.is_empty() {
        repo::list_cases(&server.pool, &req.repo_id)
            .await
            .unwrap_or_default()
    } else {
        let path_set: std::collections::HashSet<String> = inline_paths.into_iter().collect();
        repo::list_cases(&server.pool, &req.repo_id)
            .await
            .unwrap_or_default()
            .into_iter()
            .filter(|c| path_set.contains(&c.case_path))
            .collect()
    };
    Ok(Response::new(pb::GetRunResponse {
        run: Some(pb_run),
        cases: run_cases.iter().map(case_to_pb).collect(),
    }))
}
