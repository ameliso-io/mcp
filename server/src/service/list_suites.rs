use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{invalid, repo_err, suite_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::ListSuitesRequest>,
) -> Result<Response<pb::ListSuitesResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    let suites = repo::list_suites(&server.pool, &req.repo_id)
        .await
        .map_err(repo_err)?;
    Ok(Response::new(pb::ListSuitesResponse {
        suites: suites.iter().map(suite_to_pb).collect(),
    }))
}
