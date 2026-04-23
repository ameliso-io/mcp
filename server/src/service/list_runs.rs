use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;
use sqlx;

use super::{invalid, repo_err, run_meta_with_counts_to_pb, run_status_to_i32, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::ListRunsRequest>,
) -> Result<Response<pb::ListRunsResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    let status_filter = req.status;
    let runs = repo::list_runs(&server.pool, &req.repo_id)
        .await
        .map_err(repo_err)?;
    // Fetch per-run result counts in one GROUP BY query.
    let raw_counts: Vec<(String, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT run_id,
         COUNT(*) FILTER (WHERE status='passed'),
         COUNT(*) FILTER (WHERE status='failed'),
         COUNT(*) FILTER (WHERE status='blocked'),
         COUNT(*) FILTER (WHERE status='skipped')
         FROM results WHERE repo_id=$1 GROUP BY run_id",
    )
    .bind(&req.repo_id)
    .fetch_all(&server.pool)
    .await
    .unwrap_or_default();
    let counts_map: std::collections::HashMap<&str, (i32, i32, i32, i32, i32)> = raw_counts
        .iter()
        .map(|(id, p, f, b, s)| {
            let (p, f, b, s) = (*p as i32, *f as i32, *b as i32, *s as i32);
            (id.as_str(), (p, f, b, s, p + f + b + s))
        })
        .collect();
    let pb_runs = runs
        .iter()
        .filter(|r| {
            status_filter == pb::RunStatus::Unspecified as i32
                || run_status_to_i32(&r.status) == status_filter
        })
        .map(|r| {
            let (p, f, b, s, t) = counts_map
                .get(r.run_id.as_str())
                .copied()
                .unwrap_or_default();
            run_meta_with_counts_to_pb(r, p, f, b, s, t)
        })
        .collect();
    Ok(Response::new(pb::ListRunsResponse { runs: pb_runs }))
}
