use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;

use super::{invalid, stored_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::HandleGitHubCallbackRequest>,
) -> Result<Response<pb::HandleGitHubCallbackResponse>, Status> {
    let req = request.into_inner();
    if req.installation_id.is_empty() {
        return Err(invalid("installation_id is required"));
    }

    let cfg = crate::github::config().ok_or_else(|| {
        Status::failed_precondition(
            "GitHub App not configured (set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY)",
        )
    })?;

    let jwt = crate::github::generate_jwt(&cfg.app_id, &cfg.private_key)
        .map_err(|e| Status::internal(e.to_string()))?;

    let token = crate::github::get_installation_token(&req.installation_id, &jwt)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    let gh_repos = crate::github::list_installation_repos(&token)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let mut result = Vec::new();

    for gh_repo in &gh_repos {
        let stored = crate::repos_store::StoredRepo {
            id: gh_repo.full_name.clone(),
            name: gh_repo.name.clone(),
            full_name: gh_repo.full_name.clone(),
            html_url: gh_repo.html_url.clone(),
            installation_id: req.installation_id.clone(),
            added_at: now.clone(),
        };
        crate::repos_store::add_or_update(&server.pool, &stored)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        result.push(stored_to_pb(&stored));
    }

    Ok(Response::new(pb::HandleGitHubCallbackResponse {
        repositories: result,
    }))
}
