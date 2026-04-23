use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    build_pending_entries, case_to_pb, check_max_len, clean_tags, invalid, priority_from_i32,
    repo_err, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::BulkCreateCasesRequest>,
) -> Result<Response<pb::BulkCreateCasesResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }
    if req.cases.is_empty() {
        return Err(invalid("cases list must not be empty"));
    }
    let has_run_id = !req.run_id.is_empty();
    let mut created: Vec<pb::Case> = Vec::with_capacity(req.cases.len());
    let mut file_paths: Vec<String> = Vec::with_capacity(req.cases.len());
    let mut new_case_paths: Vec<String> = Vec::with_capacity(req.cases.len());
    for entry in &req.cases {
        if entry.case_path.is_empty() {
            return Err(invalid("each entry must have a case_path"));
        }
        if entry.title.is_empty() {
            return Err(invalid(format!(
                "entry '{}' must have a title",
                entry.case_path
            )));
        }
        check_max_len("case_path", &entry.case_path, 200)?;
        check_max_len("title", &entry.title, 255)?;
        check_max_len("description", &entry.description, 1000)?;
        check_max_len("body", &entry.body, 100_000)?;
        let priority = priority_from_i32(entry.priority).unwrap_or("medium");
        let body = if entry.body.is_empty() {
            None
        } else {
            Some(entry.body.as_str())
        };
        let case = repo::create_case(
            &server.pool,
            &req.repo_id,
            &entry.case_path,
            &entry.title,
            &entry.description,
            clean_tags(entry.tags.clone()),
            priority,
            body,
        )
        .await
        .map_err(repo_err)?;
        {
            let pool = server.pool.clone();
            let repo_id = req.repo_id.clone();
            let case_clone = case.clone();
            tokio::spawn(async move {
                if let Err(e) = crate::sync::push_case(&pool, &repo_id, &case_clone).await {
                    eprintln!(
                        "warning: github sync failed for {}/{}: {e}",
                        repo_id, case_clone.case_path
                    );
                }
            });
        }
        file_paths.push(format!(".ameliso/cases/{}.md", entry.case_path));
        new_case_paths.push(entry.case_path.clone());
        created.push(case_to_pb(&case));
    }
    let pending = if has_run_id {
        repo::add_cases_to_run(&server.pool, &req.repo_id, &req.run_id, &new_case_paths)
            .await
            .map_err(repo_err)?;
        let ((pending_cases, _), statuses) = tokio::join!(
            async {
                repo::get_pending_cases(&server.pool, &req.repo_id, &req.run_id)
                    .await
                    .unwrap_or_default()
            },
            async {
                repo::get_latest_statuses(&server.pool, &req.repo_id)
                    .await
                    .unwrap_or_default()
            },
        );
        build_pending_entries(&pending_cases, &statuses)
    } else {
        vec![]
    };
    Ok(Response::new(pb::BulkCreateCasesResponse {
        cases: created,
        file_paths,
        pending,
    }))
}
