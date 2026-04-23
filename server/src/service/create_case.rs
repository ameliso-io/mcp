use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    case_to_pb, check_max_len, clean_tags, invalid, priority_from_i32, repo_err, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::CreateCaseRequest>,
) -> Result<Response<pb::CreateCaseResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.case_path.is_empty() {
        return Err(invalid("case_path is required"));
    }
    if req.title.is_empty() {
        return Err(invalid("title is required"));
    }
    check_max_len("case_path", &req.case_path, 200)?;
    check_max_len("title", &req.title, 255)?;
    check_max_len("description", &req.description, 1000)?;
    check_max_len("body", &req.body, 100_000)?;
    let priority = priority_from_i32(req.priority).unwrap_or("medium");
    let body = if req.body.is_empty() {
        None
    } else {
        Some(req.body.as_str())
    };
    let case = repo::create_case(
        &server.pool,
        &req.repo_id,
        &req.case_path,
        &req.title,
        &req.description,
        clean_tags(req.tags),
        priority,
        body,
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
    let file_path = format!(".ameliso/cases/{}.md", req.case_path);
    Ok(Response::new(pb::CreateCaseResponse {
        case: Some(case_to_pb(&case)),
        file_path,
    }))
}
