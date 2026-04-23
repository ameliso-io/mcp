use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;

use super::{invalid, stored_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::SyncRepositoryRequest>,
) -> Result<Response<pb::SyncRepositoryResponse>, Status> {
    let req = request.into_inner();
    if req.id.is_empty() {
        return Err(invalid("id is required"));
    }

    let stored = crate::repos_store::get(&server.pool, &req.id)
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .ok_or_else(|| Status::not_found(format!("repository {} not found", req.id)))?;

    // Verify the repo still exists in GitHub and refresh metadata.
    let cfg = crate::github::config()
        .ok_or_else(|| Status::failed_precondition("GitHub App not configured"))?;
    let jwt = crate::github::generate_jwt(&cfg.app_id, &cfg.private_key)
        .map_err(|e| Status::internal(e.to_string()))?;
    let token = crate::github::get_installation_token(&stored.installation_id, &jwt)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    let gh_repo = crate::github::get_repo(&stored.full_name, &token)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    let updated = crate::repos_store::StoredRepo {
        id: stored.id.clone(),
        name: gh_repo.name,
        full_name: gh_repo.full_name,
        html_url: gh_repo.html_url,
        installation_id: stored.installation_id.clone(),
        added_at: stored.added_at.clone(),
    };
    crate::repos_store::add_or_update(&server.pool, &updated)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    Ok(Response::new(pb::SyncRepositoryResponse {
        repository: Some(stored_to_pb(&updated)),
    }))
}
