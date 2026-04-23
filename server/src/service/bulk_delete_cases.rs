use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{invalid, repo_err, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::BulkDeleteCasesRequest>,
) -> Result<Response<pb::BulkDeleteCasesResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.case_paths.is_empty() {
        return Err(invalid("case_paths must not be empty"));
    }
    for path in &req.case_paths {
        if path.is_empty() {
            return Err(invalid("each case_path must be non-empty"));
        }
    }
    let mut file_paths: Vec<String> = Vec::new();
    for path in &req.case_paths {
        repo::delete_case(&server.pool, &req.repo_id, path)
            .await
            .map_err(repo_err)?;
        {
            let pool = server.pool.clone();
            let repo_id = req.repo_id.clone();
            let path_clone = path.clone();
            tokio::spawn(async move {
                if let Err(e) = crate::sync::delete_case_file(&pool, &repo_id, &path_clone).await {
                    eprintln!("warning: github delete sync failed for {repo_id}/{path_clone}: {e}");
                }
            });
        }
        file_paths.push(format!(".ameliso/cases/{path}.md"));
    }
    Ok(Response::new(pb::BulkDeleteCasesResponse { file_paths }))
}
