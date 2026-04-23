use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{invalid, repo_err, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::DeleteCaseRequest>,
) -> Result<Response<pb::DeleteCaseResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.case_path.is_empty() {
        return Err(invalid("case_path is required"));
    }
    repo::delete_case(&server.pool, &req.repo_id, &req.case_path)
        .await
        .map_err(repo_err)?;
    {
        let pool = server.pool.clone();
        let repo_id = req.repo_id.clone();
        let case_path_clone = req.case_path.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::sync::delete_case_file(&pool, &repo_id, &case_path_clone).await {
                eprintln!(
                    "warning: github delete sync failed for {repo_id}/{case_path_clone}: {e}"
                );
            }
        });
    }
    Ok(Response::new(pb::DeleteCaseResponse {
        file_path: format!(".ameliso/cases/{}.md", req.case_path),
    }))
}
