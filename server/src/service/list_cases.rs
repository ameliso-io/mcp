use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{case_to_pb, invalid, priority_from_i32, priority_rank, repo_err, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::ListCasesRequest>,
) -> Result<Response<pb::ListCasesResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    let mut cases = repo::list_cases(&server.pool, &req.repo_id)
        .await
        .map_err(repo_err)?;

    if !req.tags.is_empty() {
        cases.retain(|c| {
            req.tags
                .iter()
                .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
        });
    }
    if let Some(pri) = priority_from_i32(req.priority) {
        cases.retain(|c| c.priority.eq_ignore_ascii_case(pri));
    }
    if !req.query.is_empty() {
        let q = req.query.to_lowercase();
        cases.retain(|c| {
            c.title.to_lowercase().contains(&q)
                || c.description.to_lowercase().contains(&q)
                || c.body.to_lowercase().contains(&q)
                || c.case_path.to_lowercase().contains(&q)
        });
    }
    if !req.suite.is_empty() {
        match repo::get_suite(&server.pool, &req.repo_id, &req.suite).await {
            Ok(suite) => {
                let suite_set: std::collections::HashSet<&str> =
                    suite.cases.iter().map(String::as_str).collect();
                cases.retain(|c| suite_set.contains(c.case_path.as_str()));
            }
            Err(e) => return Err(repo_err(e)),
        }
    }

    cases.sort_by(|a, b| {
        priority_rank(&a.priority)
            .cmp(&priority_rank(&b.priority))
            .then_with(|| a.case_path.cmp(&b.case_path))
    });

    Ok(Response::new(pb::ListCasesResponse {
        cases: cases.iter().map(case_to_pb).collect(),
    }))
}
