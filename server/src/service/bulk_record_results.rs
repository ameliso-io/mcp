use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    build_pending_entries, invalid, repo_err, result_status_from_i32, result_to_pb, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::BulkRecordResultsRequest>,
) -> Result<Response<pb::BulkRecordResultsResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.run_id.is_empty() {
        return Err(invalid("run_id is required"));
    }
    if req.results.is_empty() {
        return Err(invalid("results must not be empty"));
    }
    // Validate all entries before touching the DB.
    for entry in &req.results {
        if entry.case_path.is_empty() {
            return Err(invalid("each result must have a case_path"));
        }
        let status = result_status_from_i32(entry.status);
        if !matches!(status, "passed" | "failed" | "blocked" | "skipped") {
            return Err(invalid(
                "status must be one of: passed, failed, blocked, skipped",
            ));
        }
        if matches!(status, "failed" | "blocked") && entry.notes.trim().is_empty() {
            return Err(invalid(
                "notes are required when status is failed or blocked",
            ));
        }
    }
    let mut recorded: Vec<pb::CaseResult> = Vec::new();
    for entry in &req.results {
        let status = result_status_from_i32(entry.status);
        let (result, _) = repo::record_result(
            &server.pool,
            &req.repo_id,
            &req.run_id,
            &entry.case_path,
            status,
            &entry.notes,
        )
        .await
        .map_err(repo_err)?;
        {
            let pool = server.pool.clone();
            let repo_id = req.repo_id.clone();
            let run_id = req.run_id.clone();
            let result_clone = result.clone();
            tokio::spawn(async move {
                if let Err(e) =
                    crate::sync::push_result(&pool, &repo_id, &run_id, &result_clone).await
                {
                    eprintln!(
                        "warning: github sync failed for result {}/{}: {e}",
                        run_id, result_clone.case_path
                    );
                }
            });
        }
        recorded.push(result_to_pb(&result));
    }
    let ((pending_cases, total_in_scope), statuses) = tokio::join!(
        async {
            repo::get_pending_cases(&server.pool, &req.repo_id, &req.run_id)
                .await
                .unwrap_or_default()
        },
        async {
            repo::get_latest_statuses(&server.pool, &req.repo_id)
                .await
                .unwrap_or_default()
        },
    );
    Ok(Response::new(pb::BulkRecordResultsResponse {
        results: recorded,
        pending_count: i32::try_from(pending_cases.len()).unwrap_or(i32::MAX),
        total_in_scope: i32::try_from(total_in_scope).unwrap_or(i32::MAX),
        pending: build_pending_entries(&pending_cases, &statuses),
    }))
}
