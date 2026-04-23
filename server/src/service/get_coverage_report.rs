use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    invalid, priority_rank, repo_err, result_status_from_i32, result_status_rank,
    result_status_to_i32, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::GetCoverageReportRequest>,
) -> Result<Response<pb::GetCoverageReportResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    let status_filter = req.status_filter;
    let (entries, run_count) = repo::get_coverage_report(&server.pool, &req.repo_id)
        .await
        .map_err(repo_err)?;

    let mut pb_entries: Vec<pb::CoverageEntry> = entries
        .into_iter()
        .filter_map(|row| {
            let status_i32 = result_status_to_i32(&row.latest_status);
            if status_filter != pb::ResultStatus::Unspecified as i32 && status_i32 != status_filter
            {
                return None;
            }
            let case = pb::Case {
                path: row.case_path,
                title: row.title,
                description: row.description,
                tags: row.tags,
                priority: row.priority,
                created_at: row.created_at,
                updated_at: row.updated_at,
                body: row.body.clone(),
            };
            Some(pb::CoverageEntry {
                case: Some(case),
                latest_status: status_i32,
                last_run_id: row.last_run_id,
                last_run_date: row.last_run_date,
                body: row.body,
            })
        })
        .collect();
    pb_entries.sort_by(|a, b| {
        let sa = result_status_rank(result_status_from_i32(a.latest_status));
        let sb = result_status_rank(result_status_from_i32(b.latest_status));
        let pa = a.case.as_ref().map_or(3, |c| priority_rank(&c.priority));
        let pb_rank = b.case.as_ref().map_or(3, |c| priority_rank(&c.priority));
        sa.cmp(&sb).then_with(|| pa.cmp(&pb_rank))
    });

    Ok(Response::new(pb::GetCoverageReportResponse {
        entries: pb_entries,
        run_count: i32::try_from(run_count).unwrap_or(i32::MAX),
    }))
}
