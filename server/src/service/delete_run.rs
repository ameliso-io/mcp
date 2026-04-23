use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{invalid, repo_err, AmelisoServer};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::DeleteRunRequest>,
) -> Result<Response<pb::DeleteRunResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.run_id.is_empty() {
        return Err(invalid("run_id is required"));
    }
    let dir_path = format!(".ameliso/runs/{}", req.run_id);
    let result_paths: Vec<String> = repo::get_run(&server.pool, &req.repo_id, &req.run_id)
        .await
        .map(|r| r.results.into_iter().map(|res| res.case_path).collect())
        .unwrap_or_default();
    repo::delete_run(&server.pool, &req.repo_id, &req.run_id)
        .await
        .map_err(repo_err)?;
    {
        let pool = server.pool.clone();
        let repo_id = req.repo_id.clone();
        let run_id = req.run_id.clone();
        tokio::spawn(async move {
            if let Err(e) =
                crate::sync::delete_run_files(&pool, &repo_id, &run_id, &result_paths).await
            {
                eprintln!("warning: github sync failed deleting run {run_id}: {e}");
            }
        });
    }
    Ok(Response::new(pb::DeleteRunResponse { dir_path }))
}
