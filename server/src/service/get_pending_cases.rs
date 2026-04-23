use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    case_to_pb, invalid, priority_from_i32, priority_rank, repo_err, result_status_to_i32,
    AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::GetPendingCasesRequest>,
) -> Result<Response<pb::GetPendingCasesResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.run_id.is_empty() {
        return Err(invalid("run_id is required"));
    }
    let (mut pending, total) = repo::get_pending_cases(&server.pool, &req.repo_id, &req.run_id)
        .await
        .map_err(repo_err)?;
    if let Some(pri) = priority_from_i32(req.priority_filter) {
        pending.retain(|c| c.priority.eq_ignore_ascii_case(pri));
    }
    let statuses = repo::get_latest_statuses(&server.pool, &req.repo_id)
        .await
        .unwrap_or_default();
    // Sort: failed/never first, then by case priority (high → low)
    pending.sort_by(|a, b| {
        let status_ord =
            |path: &str| match statuses.get(path).map(String::as_str).unwrap_or("never") {
                "failed" => 0i32,
                "never" => 1,
                "blocked" => 2,
                "skipped" => 3,
                "passed" => 4,
                _ => 5,
            };
        status_ord(&a.case_path)
            .cmp(&status_ord(&b.case_path))
            .then_with(|| priority_rank(&a.priority).cmp(&priority_rank(&b.priority)))
    });
    let entries = pending
        .iter()
        .map(|c| pb::CoverageEntry {
            latest_status: result_status_to_i32(
                statuses
                    .get(&c.case_path)
                    .map(String::as_str)
                    .unwrap_or("never"),
            ),
            last_run_id: String::new(),
            last_run_date: String::new(),
            body: c.body.clone(),
            case: Some(case_to_pb(c)),
        })
        .collect();
    let pending_entries = pending
        .iter()
        .map(|c| pb::PendingEntry {
            case: Some(case_to_pb(c)),
            body: c.body.clone(),
            latest_status: result_status_to_i32(
                statuses
                    .get(&c.case_path)
                    .map(String::as_str)
                    .unwrap_or("never"),
            ),
        })
        .collect();
    Ok(Response::new(pb::GetPendingCasesResponse {
        cases: pending.iter().map(case_to_pb).collect(),
        total_in_scope: i32::try_from(total).unwrap_or(i32::MAX),
        entries,
        pending: pending_entries,
    }))
}
