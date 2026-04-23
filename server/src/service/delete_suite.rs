use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{invalid, repo_err, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::DeleteSuiteRequest>,
) -> Result<Response<pb::DeleteSuiteResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.slug.is_empty() {
        return Err(invalid("slug is required"));
    }
    repo::delete_suite(&server.pool, &req.repo_id, &req.slug)
        .await
        .map_err(repo_err)?;
    {
        let pool = server.pool.clone();
        let repo_id = req.repo_id.clone();
        let slug = req.slug.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::sync::delete_suite_file(&pool, &repo_id, &slug).await {
                eprintln!("warning: github sync failed deleting suite {slug}: {e}");
            }
        });
    }
    Ok(Response::new(pb::DeleteSuiteResponse {
        file_path: format!(".ameliso/suites/{}.yaml", req.slug),
    }))
}
