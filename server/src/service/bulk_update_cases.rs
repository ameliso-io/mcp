use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    case_to_pb, check_max_len, clean_tags, invalid, priority_from_i32, repo_err, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::BulkUpdateCasesRequest>,
) -> Result<Response<pb::BulkUpdateCasesResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.cases.is_empty() {
        return Err(invalid("cases must not be empty"));
    }
    for entry in &req.cases {
        if entry.case_path.is_empty() {
            return Err(invalid("each entry must have a case_path"));
        }
        check_max_len("case_path", &entry.case_path, 200)?;
        check_max_len("title", &entry.title, 255)?;
        check_max_len("description", &entry.description, 1000)?;
        check_max_len("body", &entry.body, 100_000)?;
    }
    let mut updated: Vec<pb::Case> = Vec::new();
    for entry in &req.cases {
        let priority = priority_from_i32(entry.priority);
        let title = if entry.title.is_empty() {
            None
        } else {
            Some(entry.title.as_str())
        };
        let description = if entry.description.is_empty() {
            None
        } else {
            Some(entry.description.as_str())
        };
        let tags = if entry.tags.is_empty() {
            None
        } else {
            let cleaned = clean_tags(entry.tags.clone());
            if cleaned.is_empty() {
                None
            } else {
                Some(cleaned)
            }
        };
        let body = if entry.body.is_empty() {
            None
        } else {
            Some(entry.body.as_str())
        };
        let case = repo::update_case(
            &server.pool,
            &req.repo_id,
            &entry.case_path,
            title,
            description,
            tags,
            priority,
            body,
            None,
        )
        .await
        .map_err(repo_err)?;
        {
            let pool = server.pool.clone();
            let repo_id = req.repo_id.clone();
            let case_clone = case.clone();
            tokio::spawn(async move {
                if let Err(e) = crate::sync::push_case(&pool, &repo_id, &case_clone).await {
                    eprintln!(
                        "warning: github sync failed for {}/{}: {e}",
                        repo_id, case_clone.case_path
                    );
                }
            });
        }
        updated.push(case_to_pb(&case));
    }
    Ok(Response::new(pb::BulkUpdateCasesResponse {
        cases: updated,
    }))
}
