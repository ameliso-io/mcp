use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{case_to_pb, invalid, repo_err, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::GetCaseRequest>,
) -> Result<Response<pb::GetCaseResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    let case = repo::get_case(&server.pool, &req.repo_id, &req.case_path)
        .await
        .map_err(repo_err)?;
    let body = case.body.clone();
    Ok(Response::new(pb::GetCaseResponse {
        case: Some(case_to_pb(&case)),
        body,
    }))
}
