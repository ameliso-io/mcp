use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;

use super::{invalid, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::RemoveRepositoryRequest>,
) -> Result<Response<pb::RemoveRepositoryResponse>, Status> {
    let req = request.into_inner();
    if req.id.is_empty() {
        return Err(invalid("id is required"));
    }
    crate::repos_store::remove(&server.pool, &req.id)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;
    Ok(Response::new(pb::RemoveRepositoryResponse {}))
}
