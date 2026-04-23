use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{check_max_len, invalid, repo_err, suite_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::UpdateSuiteRequest>,
) -> Result<Response<pb::UpdateSuiteResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.slug.is_empty() {
        return Err(invalid("slug is required"));
    }
    check_max_len("slug", &req.slug, 100)?;
    check_max_len("new_slug", &req.new_slug, 100)?;
    check_max_len("name", &req.name, 255)?;
    check_max_len("description", &req.description, 1000)?;
    let name = if req.name.is_empty() {
        None
    } else {
        Some(req.name.as_str())
    };
    let description = if req.description.is_empty() {
        None
    } else {
        Some(Some(req.description.clone()))
    };
    let cases = if req.replace_cases || !req.cases.is_empty() {
        Some(req.cases)
    } else {
        None
    };
    let new_slug = if req.new_slug.is_empty() {
        None
    } else {
        Some(req.new_slug.as_str())
    };
    let old_slug = req.slug.clone();
    let slug_changed = !req.new_slug.is_empty();
    let suite = repo::update_suite(
        &server.pool,
        &req.repo_id,
        &req.slug,
        name,
        description,
        cases,
        new_slug,
    )
    .await
    .map_err(repo_err)?;
    {
        let pool = server.pool.clone();
        let repo_id = req.repo_id.clone();
        let suite_clone = suite.clone();
        tokio::spawn(async move {
            if slug_changed {
                if let Err(e) = crate::sync::delete_suite_file(&pool, &repo_id, &old_slug).await {
                    eprintln!("warning: github sync failed deleting suite {old_slug}: {e}");
                }
            }
            if let Err(e) = crate::sync::push_suite(&pool, &repo_id, &suite_clone).await {
                eprintln!(
                    "warning: github sync failed for suite {}: {e}",
                    suite_clone.slug
                );
            }
        });
    }
    Ok(Response::new(pb::UpdateSuiteResponse {
        suite: Some(suite_to_pb(&suite)),
    }))
}
