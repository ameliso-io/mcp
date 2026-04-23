use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{invalid, repo_err, suite_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::GetSuiteRequest>,
) -> Result<Response<pb::GetSuiteResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.slug.is_empty() {
        return Err(invalid("slug is required"));
    }
    let suite = repo::get_suite(&server.pool, &req.repo_id, &req.slug)
        .await
        .map_err(repo_err)?;
    Ok(Response::new(pb::GetSuiteResponse {
        suite: Some(suite_to_pb(&suite)),
    }))
}
