use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{check_max_len, invalid, repo_err, suite_to_pb, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::CreateSuiteRequest>,
) -> Result<Response<pb::CreateSuiteResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.slug.is_empty() {
        return Err(invalid("slug is required"));
    }
    if req.name.is_empty() {
        return Err(invalid("name is required"));
    }
    check_max_len("slug", &req.slug, 100)?;
    check_max_len("name", &req.name, 255)?;
    check_max_len("description", &req.description, 1000)?;
    let desc = if req.description.is_empty() {
        None
    } else {
        Some(req.description.clone())
    };
    let suite = repo::create_suite(
        &server.pool,
        &req.repo_id,
        &req.slug,
        &req.name,
        desc,
        req.cases,
    )
    .await
    .map_err(repo_err)?;
    {
        let pool = server.pool.clone();
        let repo_id = req.repo_id.clone();
        let suite_clone = suite.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::sync::push_suite(&pool, &repo_id, &suite_clone).await {
                eprintln!(
                    "warning: github sync failed for suite {}: {e}",
                    suite_clone.slug
                );
            }
        });
    }
    Ok(Response::new(pb::CreateSuiteResponse {
        suite: Some(suite_to_pb(&suite)),
        file_path: format!(".ameliso/suites/{}.yaml", req.slug),
    }))
}
