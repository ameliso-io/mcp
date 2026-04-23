use sqlx::PgPool;
use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1::{self as pb, ameliso_service_server::AmelisoService};
use crate::repo::{self, RepoError, RunRow};

/// Returns true when `text` contains `case_path` as whole path segments.
/// Prevents `auth/log` from matching inside `auth/login`.
fn text_references_case(text: &str, case_path: &str) -> bool {
    // After the path, only these chars indicate a clean boundary (not mid-segment)
    let ends_cleanly = |s: &str| {
        s.is_empty()
            || s.starts_with('/')
            || s.starts_with('.')
            || s.starts_with(' ')
            || s.starts_with('\t')
            || s.starts_with('\n')
            || s.starts_with('"')
            || s.starts_with('\'')
            || s.starts_with(')')
    };
    if text.starts_with(case_path) && ends_cleanly(&text[case_path.len()..]) {
        return true;
    }
    // Match after any path separator or whitespace character.
    // Use match_indices to check all occurrences: the first hit may have a dirty
    // suffix while a later hit in the same text has a clean boundary.
    for prefix in ['/', ' ', '\t', '\n', '"', '\'', '('] {
        let needle = format!("{prefix}{case_path}");
        for (idx, _) in text.match_indices(needle.as_str()) {
            if ends_cleanly(&text[idx + needle.len()..]) {
                return true;
            }
        }
    }
    false
}

/// Returns true when `path` is a documentation/config file that does not
/// constitute a source change (i.e., should not trigger broad test flagging).
fn is_doc_file(path: &str) -> bool {
    let doc_exts = [".md", ".txt", ".yaml", ".yml"];
    // dotfiles like .gitignore have no extension via Path::extension(), so check by filename
    let doc_filenames = [".gitignore", ".gitattributes"];
    let p = std::path::Path::new(path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let filename = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    doc_exts.contains(&ext.as_str()) || doc_filenames.contains(&filename)
}

fn repo_err(e: RepoError) -> Status {
    match e {
        RepoError::NotFound(msg) => Status::not_found(msg),
        RepoError::AlreadyExists(msg) => Status::already_exists(msg),
        RepoError::ClosedRun(msg) => Status::failed_precondition(msg),
        RepoError::InvalidArg(msg) => Status::invalid_argument(msg),
        RepoError::Other(e) => Status::internal(e.to_string()),
    }
}

fn invalid(msg: impl Into<String>) -> Status {
    Status::invalid_argument(msg.into())
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .filter_map(|t| {
            let s = t.trim().to_owned();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        })
        .collect()
}

#[allow(clippy::result_large_err)]
fn check_max_len(field: &str, value: &str, max: usize) -> Result<(), Status> {
    if value.len() > max {
        return Err(invalid(format!(
            "{field} must not exceed {max} characters (got {})",
            value.len()
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

fn case_to_pb(c: &repo::LoadedCase) -> pb::Case {
    pb::Case {
        path: c.case_path.clone(),
        title: c.title.clone(),
        description: c.description.clone(),
        tags: c.tags.clone(),
        priority: c.priority.clone(),
        created_at: c.created_at.clone(),
        updated_at: c.updated_at.clone(),
        body: c.body.clone(),
    }
}

fn run_meta_to_pb(r: &repo::RunRow) -> pb::RunMeta {
    pb::RunMeta {
        id: r.run_id.clone(),
        date: r.date.clone(),
        tester: r.tester.clone(),
        status: run_status_to_i32(&r.status),
        environment: r.environment.clone().unwrap_or_default(),
        suite: r.suite.clone().unwrap_or_default(),
        commit_sha: r.commit_sha.clone(),
    }
}

fn result_to_pb(r: &repo::LoadedResult) -> pb::CaseResult {
    pb::CaseResult {
        case_path: r.case_path.clone(),
        status: result_status_to_i32(&r.status),
        notes: r.notes.clone(),
    }
}

fn suite_to_pb(s: &repo::SuiteRow) -> pb::Suite {
    pb::Suite {
        slug: s.slug.clone(),
        name: s.name.clone(),
        description: s.description.clone().unwrap_or_default(),
        cases: s.cases.clone(),
    }
}

fn stored_to_pb(r: &crate::repos_store::StoredRepo) -> pb::Repository {
    pb::Repository {
        id: r.id.clone(),
        name: r.name.clone(),
        full_name: r.full_name.clone(),
        html_url: r.html_url.clone(),
        installation_id: r.installation_id.clone(),
        added_at: r.added_at.clone(),
    }
}

fn run_status_to_i32(s: &str) -> i32 {
    match s {
        "in-progress" => pb::RunStatus::InProgress as i32,
        "completed" => pb::RunStatus::Completed as i32,
        "aborted" => pb::RunStatus::Aborted as i32,
        _ => pb::RunStatus::Unspecified as i32,
    }
}

fn result_status_to_i32(s: &str) -> i32 {
    match s {
        "passed" => pb::ResultStatus::Passed as i32,
        "failed" => pb::ResultStatus::Failed as i32,
        "blocked" => pb::ResultStatus::Blocked as i32,
        "skipped" => pb::ResultStatus::Skipped as i32,
        "never" => pb::ResultStatus::Never as i32,
        _ => pb::ResultStatus::Unspecified as i32,
    }
}

fn result_status_from_i32(n: i32) -> &'static str {
    match pb::ResultStatus::try_from(n).unwrap_or(pb::ResultStatus::Unspecified) {
        pb::ResultStatus::Passed => "passed",
        pb::ResultStatus::Failed => "failed",
        pb::ResultStatus::Blocked => "blocked",
        pb::ResultStatus::Skipped => "skipped",
        pb::ResultStatus::Never => "never",
        pb::ResultStatus::Unspecified => "unspecified",
    }
}

fn run_status_from_i32(n: i32) -> &'static str {
    match pb::RunStatus::try_from(n).unwrap_or(pb::RunStatus::Unspecified) {
        pb::RunStatus::InProgress => "in-progress",
        pb::RunStatus::Completed => "completed",
        pb::RunStatus::Aborted => "aborted",
        pb::RunStatus::Unspecified => "unspecified",
    }
}

fn priority_from_i32(n: i32) -> Option<&'static str> {
    match pb::Priority::try_from(n).unwrap_or(pb::Priority::Unspecified) {
        pb::Priority::Low => Some("low"),
        pb::Priority::Medium => Some("medium"),
        pb::Priority::High => Some("high"),
        pb::Priority::Unspecified => None,
    }
}

fn priority_rank(p: &str) -> u8 {
    match p {
        "high" => 0,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    }
}

fn result_status_rank(s: &str) -> u8 {
    match s {
        "failed" => 0,
        "never" => 1,
        "blocked" => 2,
        "skipped" => 3,
        "passed" => 4,
        _ => 5,
    }
}

// ---------------------------------------------------------------------------
// Helper: resolve affected case paths given since_ref or changed_files
// ---------------------------------------------------------------------------

// Returns the set of case paths affected by the given diff scope.
// If both `since_ref` and `changed_files` are empty, returns all known case paths.
// If `changed_files` is non-empty, matches them directly without GitHub.
// If `since_ref` is non-empty, calls the GitHub compare API.
async fn resolve_affected_case_paths(
    pool: &PgPool,
    repo_id: &str,
    since_ref: &str,
    changed_files: &[String],
) -> Result<Vec<String>, Status> {
    let cases = repo::list_cases(pool, repo_id).await.map_err(repo_err)?;
    let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();

    if since_ref.is_empty() && changed_files.is_empty() {
        return Ok(known_paths);
    }

    if !changed_files.is_empty() {
        let mut affected_set: std::collections::HashSet<String> = std::collections::HashSet::new();
        for file in changed_files {
            for path in &known_paths {
                if text_references_case(file, path) {
                    affected_set.insert(path.clone());
                }
            }
        }
        let has_source_changes = changed_files.iter().any(|f| !is_doc_file(f));
        if has_source_changes && affected_set.is_empty() {
            return Ok(known_paths);
        }
        return Ok(affected_set.into_iter().collect());
    }

    // GitHub compare path.
    let stored = crate::repos_store::get(pool, repo_id)
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .ok_or_else(|| Status::not_found(format!("repository {repo_id} not found")))?;
    let cfg = crate::github::config()
        .ok_or_else(|| Status::failed_precondition("GitHub App not configured"))?;
    let jwt = crate::github::generate_jwt(&cfg.app_id, &cfg.private_key)
        .map_err(|e| Status::internal(e.to_string()))?;
    let token = crate::github::get_installation_token(&stored.installation_id, &jwt)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;
    let parts: Vec<&str> = stored.full_name.splitn(2, '/').collect();
    if parts.len() != 2 {
        return Err(Status::internal("invalid full_name in stored repo"));
    }
    let (owner, repo_name) = (parts[0], parts[1]);
    let compare = crate::github::compare(owner, repo_name, since_ref, &token)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    let mut affected: Vec<String> = Vec::new();
    let mut affected_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let all_text = compare.commit_messages.join("\n");
    for path in &known_paths {
        if text_references_case(&all_text, path) && affected_set.insert(path.clone()) {
            affected.push(path.clone());
        }
    }
    for file in &compare.changed_files {
        for path in &known_paths {
            if text_references_case(file, path) && affected_set.insert(path.clone()) {
                affected.push(path.clone());
            }
        }
    }
    let source_changed: Vec<&str> = compare
        .changed_files
        .iter()
        .filter(|f| !is_doc_file(f))
        .map(String::as_str)
        .collect();
    if !source_changed.is_empty() && affected.is_empty() {
        affected = known_paths;
    }
    Ok(affected)
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

pub struct AmelisoServer {
    pub pool: PgPool,
}

#[tonic::async_trait]
impl AmelisoService for AmelisoServer {
    async fn list_cases(
        &self,
        request: Request<pb::ListCasesRequest>,
    ) -> Result<Response<pb::ListCasesResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        let mut cases = repo::list_cases(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;

        if !req.tags.is_empty() {
            cases.retain(|c| {
                req.tags
                    .iter()
                    .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
            });
        }
        if let Some(pri) = priority_from_i32(req.priority) {
            cases.retain(|c| c.priority.eq_ignore_ascii_case(pri));
        }
        if !req.query.is_empty() {
            let q = req.query.to_lowercase();
            cases.retain(|c| {
                c.title.to_lowercase().contains(&q)
                    || c.description.to_lowercase().contains(&q)
                    || c.body.to_lowercase().contains(&q)
                    || c.case_path.to_lowercase().contains(&q)
            });
        }
        if !req.suite.is_empty() {
            match repo::get_suite(&self.pool, &req.repo_id, &req.suite).await {
                Ok(suite) => {
                    let suite_set: std::collections::HashSet<&str> =
                        suite.cases.iter().map(String::as_str).collect();
                    cases.retain(|c| suite_set.contains(c.case_path.as_str()));
                }
                Err(e) => return Err(repo_err(e)),
            }
        }

        cases.sort_by(|a, b| {
            priority_rank(&a.priority)
                .cmp(&priority_rank(&b.priority))
                .then_with(|| a.case_path.cmp(&b.case_path))
        });

        Ok(Response::new(pb::ListCasesResponse {
            cases: cases.iter().map(case_to_pb).collect(),
        }))
    }

    async fn get_case(
        &self,
        request: Request<pb::GetCaseRequest>,
    ) -> Result<Response<pb::GetCaseResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        let case = repo::get_case(&self.pool, &req.repo_id, &req.case_path)
            .await
            .map_err(repo_err)?;
        let body = case.body.clone();
        Ok(Response::new(pb::GetCaseResponse {
            case: Some(case_to_pb(&case)),
            body,
        }))
    }

    async fn create_case(
        &self,
        request: Request<pb::CreateCaseRequest>,
    ) -> Result<Response<pb::CreateCaseResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.case_path.is_empty() {
            return Err(invalid("case_path is required"));
        }
        if req.title.is_empty() {
            return Err(invalid("title is required"));
        }
        check_max_len("case_path", &req.case_path, 200)?;
        check_max_len("title", &req.title, 255)?;
        check_max_len("description", &req.description, 1000)?;
        check_max_len("body", &req.body, 100_000)?;
        let priority = priority_from_i32(req.priority).unwrap_or("medium");
        let body = if req.body.is_empty() {
            None
        } else {
            Some(req.body.as_str())
        };
        let case = repo::create_case(
            &self.pool,
            &req.repo_id,
            &req.case_path,
            &req.title,
            &req.description,
            clean_tags(req.tags),
            priority,
            body,
        )
        .await
        .map_err(repo_err)?;
        {
            let pool = self.pool.clone();
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
        let file_path = format!("cases/{}.md", req.case_path);
        Ok(Response::new(pb::CreateCaseResponse {
            case: Some(case_to_pb(&case)),
            file_path,
        }))
    }

    async fn bulk_create_cases(
        &self,
        request: Request<pb::BulkCreateCasesRequest>,
    ) -> Result<Response<pb::BulkCreateCasesResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.cases.is_empty() {
            return Err(invalid("cases list must not be empty"));
        }
        let mut created: Vec<pb::Case> = Vec::with_capacity(req.cases.len());
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
                &self.pool,
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
                let pool = self.pool.clone();
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
            created.push(case_to_pb(&case));
        }
        Ok(Response::new(pb::BulkCreateCasesResponse {
            cases: created,
        }))
    }

    async fn update_case(
        &self,
        request: Request<pb::UpdateCaseRequest>,
    ) -> Result<Response<pb::UpdateCaseResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.case_path.is_empty() {
            return Err(invalid("case_path is required"));
        }
        check_max_len("case_path", &req.case_path, 200)?;
        check_max_len("new_path", &req.new_path, 200)?;
        check_max_len("title", &req.title, 255)?;
        check_max_len("description", &req.description, 1000)?;
        check_max_len("body", &req.body, 100_000)?;
        let priority = priority_from_i32(req.priority);
        let title = if req.title.is_empty() {
            None
        } else {
            Some(req.title.as_str())
        };
        let description = if req.description.is_empty() {
            None
        } else {
            Some(req.description.as_str())
        };
        let tags = if req.tags.is_empty() {
            None
        } else {
            let cleaned = clean_tags(req.tags);
            if cleaned.is_empty() {
                None
            } else {
                Some(cleaned)
            }
        };
        let body = if req.body.is_empty() {
            None
        } else {
            Some(req.body.as_str())
        };
        let new_path = if req.new_path.is_empty() {
            None
        } else {
            Some(req.new_path.as_str())
        };
        let case = repo::update_case(
            &self.pool,
            &req.repo_id,
            &req.case_path,
            title,
            description,
            tags,
            priority,
            body,
            new_path,
        )
        .await
        .map_err(repo_err)?;
        {
            let pool = self.pool.clone();
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
        Ok(Response::new(pb::UpdateCaseResponse {
            case: Some(case_to_pb(&case)),
        }))
    }

    async fn bulk_update_cases(
        &self,
        request: Request<pb::BulkUpdateCasesRequest>,
    ) -> Result<Response<pb::BulkUpdateCasesResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.cases.is_empty() {
            return Err(invalid("cases must not be empty"));
        }
        for entry in &req.cases {
            if entry.case_path.is_empty() {
                return Err(invalid("each entry must have a case_path"));
            }
            check_max_len("case_path", &entry.case_path, 200)?;
            check_max_len("title", &entry.title, 255)?;
            check_max_len("description", &entry.description, 1000)?;
            check_max_len("body", &entry.body, 100_000)?;
        }
        let mut updated: Vec<pb::Case> = Vec::new();
        for entry in &req.cases {
            let priority = priority_from_i32(entry.priority);
            let title = if entry.title.is_empty() {
                None
            } else {
                Some(entry.title.as_str())
            };
            let description = if entry.description.is_empty() {
                None
            } else {
                Some(entry.description.as_str())
            };
            let tags = if entry.tags.is_empty() {
                None
            } else {
                let cleaned = clean_tags(entry.tags.clone());
                if cleaned.is_empty() {
                    None
                } else {
                    Some(cleaned)
                }
            };
            let body = if entry.body.is_empty() {
                None
            } else {
                Some(entry.body.as_str())
            };
            let case = repo::update_case(
                &self.pool,
                &req.repo_id,
                &entry.case_path,
                title,
                description,
                tags,
                priority,
                body,
                None,
            )
            .await
            .map_err(repo_err)?;
            {
                let pool = self.pool.clone();
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
            updated.push(case_to_pb(&case));
        }
        Ok(Response::new(pb::BulkUpdateCasesResponse {
            cases: updated,
        }))
    }

    async fn delete_case(
        &self,
        request: Request<pb::DeleteCaseRequest>,
    ) -> Result<Response<pb::DeleteCaseResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.case_path.is_empty() {
            return Err(invalid("case_path is required"));
        }
        repo::delete_case(&self.pool, &req.repo_id, &req.case_path)
            .await
            .map_err(repo_err)?;
        {
            let pool = self.pool.clone();
            let repo_id = req.repo_id.clone();
            let case_path_clone = req.case_path.clone();
            tokio::spawn(async move {
                if let Err(e) =
                    crate::sync::delete_case_file(&pool, &repo_id, &case_path_clone).await
                {
                    eprintln!(
                        "warning: github delete sync failed for {repo_id}/{case_path_clone}: {e}"
                    );
                }
            });
        }
        Ok(Response::new(pb::DeleteCaseResponse {
            file_path: format!("cases/{}.md", req.case_path),
        }))
    }

    async fn bulk_delete_cases(
        &self,
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
            repo::delete_case(&self.pool, &req.repo_id, path)
                .await
                .map_err(repo_err)?;
            {
                let pool = self.pool.clone();
                let repo_id = req.repo_id.clone();
                let path_clone = path.clone();
                tokio::spawn(async move {
                    if let Err(e) =
                        crate::sync::delete_case_file(&pool, &repo_id, &path_clone).await
                    {
                        eprintln!(
                            "warning: github delete sync failed for {repo_id}/{path_clone}: {e}"
                        );
                    }
                });
            }
            file_paths.push(format!("cases/{path}.md"));
        }
        Ok(Response::new(pb::BulkDeleteCasesResponse { file_paths }))
    }

    async fn list_suites(
        &self,
        request: Request<pb::ListSuitesRequest>,
    ) -> Result<Response<pb::ListSuitesResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        let suites = repo::list_suites(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;
        Ok(Response::new(pb::ListSuitesResponse {
            suites: suites.iter().map(suite_to_pb).collect(),
        }))
    }

    async fn get_suite(
        &self,
        request: Request<pb::GetSuiteRequest>,
    ) -> Result<Response<pb::GetSuiteResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.slug.is_empty() {
            return Err(invalid("slug is required"));
        }
        let suite = repo::get_suite(&self.pool, &req.repo_id, &req.slug)
            .await
            .map_err(repo_err)?;
        Ok(Response::new(pb::GetSuiteResponse {
            suite: Some(suite_to_pb(&suite)),
        }))
    }

    async fn create_suite(
        &self,
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
            &self.pool,
            &req.repo_id,
            &req.slug,
            &req.name,
            desc,
            req.cases,
        )
        .await
        .map_err(repo_err)?;
        Ok(Response::new(pb::CreateSuiteResponse {
            suite: Some(suite_to_pb(&suite)),
            file_path: format!("suites/{}.yaml", req.slug),
        }))
    }

    async fn update_suite(
        &self,
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
        let suite = repo::update_suite(
            &self.pool,
            &req.repo_id,
            &req.slug,
            name,
            description,
            cases,
            new_slug,
        )
        .await
        .map_err(repo_err)?;
        Ok(Response::new(pb::UpdateSuiteResponse {
            suite: Some(suite_to_pb(&suite)),
        }))
    }

    async fn delete_suite(
        &self,
        request: Request<pb::DeleteSuiteRequest>,
    ) -> Result<Response<pb::DeleteSuiteResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.slug.is_empty() {
            return Err(invalid("slug is required"));
        }
        repo::delete_suite(&self.pool, &req.repo_id, &req.slug)
            .await
            .map_err(repo_err)?;
        Ok(Response::new(pb::DeleteSuiteResponse {
            file_path: format!("suites/{}.yaml", req.slug),
        }))
    }

    async fn list_runs(
        &self,
        request: Request<pb::ListRunsRequest>,
    ) -> Result<Response<pb::ListRunsResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        let status_filter = req.status;
        let runs = repo::list_runs(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;
        let pb_runs = runs
            .iter()
            .filter(|r| {
                status_filter == pb::RunStatus::Unspecified as i32
                    || run_status_to_i32(&r.status) == status_filter
            })
            .map(run_meta_to_pb)
            .collect();
        Ok(Response::new(pb::ListRunsResponse { runs: pb_runs }))
    }

    async fn get_run(
        &self,
        request: Request<pb::GetRunRequest>,
    ) -> Result<Response<pb::GetRunResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        let run = repo::get_run(&self.pool, &req.repo_id, &req.run_id)
            .await
            .map_err(repo_err)?;
        let pb_run = pb::Run {
            meta: Some(run_meta_to_pb(&run.meta)),
            results: run.results.iter().map(result_to_pb).collect(),
        };
        Ok(Response::new(pb::GetRunResponse { run: Some(pb_run) }))
    }

    async fn create_run(
        &self,
        request: Request<pb::CreateRunRequest>,
    ) -> Result<Response<pb::CreateRunResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        let slug = if req.slug.is_empty() {
            let micros = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_micros();
            format!("run-{micros:x}")
        } else {
            req.slug.clone()
        };
        check_max_len("slug", &slug, 100)?;
        check_max_len("tester", &req.tester, 255)?;
        check_max_len("environment", &req.environment, 255)?;
        check_max_len("suite", &req.suite, 100)?;
        let env = if req.environment.is_empty() {
            None
        } else {
            Some(req.environment)
        };
        let suite = if req.suite.is_empty() {
            None
        } else {
            Some(req.suite)
        };
        let tester = if req.tester.is_empty() {
            "unknown".to_owned()
        } else {
            req.tester
        };
        let has_since_ref = !req.since_ref.is_empty();
        let has_changed_files = !req.changed_files.is_empty();
        let use_last_run = req.use_last_run;
        if use_last_run && (has_since_ref || has_changed_files) {
            return Err(invalid(
                "use_last_run and since_ref/changed_files are mutually exclusive",
            ));
        }
        if use_last_run && !req.cases.is_empty() {
            return Err(invalid("use_last_run and cases are mutually exclusive"));
        }
        if use_last_run && suite.is_some() {
            return Err(invalid("use_last_run and suite are mutually exclusive"));
        }
        if (has_since_ref || has_changed_files) && !req.cases.is_empty() {
            return Err(invalid(
                "since_ref/changed_files and cases are mutually exclusive",
            ));
        }
        if (has_since_ref || has_changed_files) && suite.is_some() {
            return Err(invalid(
                "since_ref/changed_files and suite are mutually exclusive",
            ));
        }
        let inline_cases = if use_last_run {
            let runs = repo::list_runs(&self.pool, &req.repo_id)
                .await
                .unwrap_or_default();
            let last_sha = runs
                .iter()
                .filter(|r| r.status == "completed")
                .max_by(|a, b| a.date.cmp(&b.date).then_with(|| a.run_id.cmp(&b.run_id)))
                .and_then(|r| {
                    if r.commit_sha.is_empty() {
                        None
                    } else {
                        Some(r.commit_sha.as_str())
                    }
                })
                .unwrap_or("");
            resolve_affected_case_paths(&self.pool, &req.repo_id, last_sha, &[]).await?
        } else if has_since_ref || has_changed_files {
            resolve_affected_case_paths(
                &self.pool,
                &req.repo_id,
                &req.since_ref,
                &req.changed_files,
            )
            .await?
        } else {
            req.cases
        };
        let commit_sha = req.commit_sha;
        let meta = repo::create_run(
            &self.pool,
            &req.repo_id,
            &slug,
            &tester,
            env,
            suite,
            inline_cases,
            commit_sha,
        )
        .await
        .map_err(repo_err)?;
        let dir_path = format!("runs/{}", meta.run_id);
        let (pending_cases, _) = repo::get_pending_cases(&self.pool, &req.repo_id, &meta.run_id)
            .await
            .unwrap_or_default();
        let statuses = repo::get_latest_statuses(&self.pool, &req.repo_id)
            .await
            .unwrap_or_default();
        let pending_entries = pending_cases
            .iter()
            .map(|c| pb::PendingEntry {
                case: Some(case_to_pb(c)),
                body: c.body.clone(),
                latest_status: result_status_to_i32(
                    statuses
                        .get(c.case_path.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                ),
            })
            .collect();
        Ok(Response::new(pb::CreateRunResponse {
            run: Some(run_meta_to_pb(&meta)),
            dir_path,
            pending: pending_entries,
        }))
    }

    async fn record_result(
        &self,
        request: Request<pb::RecordResultRequest>,
    ) -> Result<Response<pb::RecordResultResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        if req.case_path.is_empty() {
            return Err(invalid("case_path is required"));
        }
        let status = result_status_from_i32(req.status);
        if !matches!(status, "passed" | "failed" | "blocked" | "skipped") {
            return Err(invalid(
                "status must be one of: passed, failed, blocked, skipped",
            ));
        }
        if matches!(status, "failed" | "blocked") && req.notes.trim().is_empty() {
            return Err(invalid(
                "notes are required when status is failed or blocked",
            ));
        }
        check_max_len("notes", &req.notes, 2000)?;
        let (result, _) = repo::record_result(
            &self.pool,
            &req.repo_id,
            &req.run_id,
            &req.case_path,
            status,
            &req.notes,
        )
        .await
        .map_err(repo_err)?;
        let (pending_cases, total_in_scope) =
            repo::get_pending_cases(&self.pool, &req.repo_id, &req.run_id)
                .await
                .map_err(repo_err)?;
        Ok(Response::new(pb::RecordResultResponse {
            result: Some(result_to_pb(&result)),
            pending_count: i32::try_from(pending_cases.len()).unwrap_or(i32::MAX),
            total_in_scope: i32::try_from(total_in_scope).unwrap_or(i32::MAX),
        }))
    }

    async fn bulk_record_results(
        &self,
        request: Request<pb::BulkRecordResultsRequest>,
    ) -> Result<Response<pb::BulkRecordResultsResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        if req.results.is_empty() {
            return Err(invalid("results must not be empty"));
        }
        // Validate all entries before touching the DB.
        for entry in &req.results {
            if entry.case_path.is_empty() {
                return Err(invalid("each result must have a case_path"));
            }
            let status = result_status_from_i32(entry.status);
            if !matches!(status, "passed" | "failed" | "blocked" | "skipped") {
                return Err(invalid(
                    "status must be one of: passed, failed, blocked, skipped",
                ));
            }
            if matches!(status, "failed" | "blocked") && entry.notes.trim().is_empty() {
                return Err(invalid(
                    "notes are required when status is failed or blocked",
                ));
            }
        }
        let mut recorded: Vec<pb::CaseResult> = Vec::new();
        for entry in &req.results {
            let status = result_status_from_i32(entry.status);
            let (result, _) = repo::record_result(
                &self.pool,
                &req.repo_id,
                &req.run_id,
                &entry.case_path,
                status,
                &entry.notes,
            )
            .await
            .map_err(repo_err)?;
            recorded.push(result_to_pb(&result));
        }
        let (pending_cases, total_in_scope) =
            repo::get_pending_cases(&self.pool, &req.repo_id, &req.run_id)
                .await
                .map_err(repo_err)?;
        Ok(Response::new(pb::BulkRecordResultsResponse {
            results: recorded,
            pending_count: i32::try_from(pending_cases.len()).unwrap_or(i32::MAX),
            total_in_scope: i32::try_from(total_in_scope).unwrap_or(i32::MAX),
        }))
    }

    async fn finalize_run(
        &self,
        request: Request<pb::FinalizeRunRequest>,
    ) -> Result<Response<pb::FinalizeRunResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        let status = run_status_from_i32(req.status);
        if status == "in-progress" {
            return Err(invalid("status must be completed or aborted"));
        }
        let resolved_status = if matches!(status, "completed" | "aborted") {
            status
        } else {
            // UNSPECIFIED: auto-detect from results — aborted if any failure, else completed.
            let run = repo::get_run(&self.pool, &req.repo_id, &req.run_id)
                .await
                .map_err(repo_err)?;
            if run.results.iter().any(|r| r.status == "failed") {
                "aborted"
            } else {
                "completed"
            }
        };
        let meta = repo::finalize_run(&self.pool, &req.repo_id, &req.run_id, resolved_status)
            .await
            .map_err(repo_err)?;
        Ok(Response::new(pb::FinalizeRunResponse {
            run: Some(run_meta_to_pb(&meta)),
        }))
    }

    async fn delete_run(
        &self,
        request: Request<pb::DeleteRunRequest>,
    ) -> Result<Response<pb::DeleteRunResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        let dir_path = format!("runs/{}", req.run_id);
        repo::delete_run(&self.pool, &req.repo_id, &req.run_id)
            .await
            .map_err(repo_err)?;
        Ok(Response::new(pb::DeleteRunResponse { dir_path }))
    }

    async fn update_run(
        &self,
        request: Request<pb::UpdateRunRequest>,
    ) -> Result<Response<pb::UpdateRunResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        if req.new_slug.is_empty() {
            return Err(invalid("new_slug is required"));
        }
        let run = repo::update_run(&self.pool, &req.repo_id, &req.run_id, &req.new_slug)
            .await
            .map_err(repo_err)?;
        let new_dir_path = format!("runs/{}", run.run_id);
        Ok(Response::new(pb::UpdateRunResponse {
            run: Some(run_meta_to_pb(&run)),
            new_dir_path,
        }))
    }

    async fn get_pending_cases(
        &self,
        request: Request<pb::GetPendingCasesRequest>,
    ) -> Result<Response<pb::GetPendingCasesResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        let (mut pending, total) = repo::get_pending_cases(&self.pool, &req.repo_id, &req.run_id)
            .await
            .map_err(repo_err)?;
        if let Some(pri) = priority_from_i32(req.priority_filter) {
            pending.retain(|c| c.priority.eq_ignore_ascii_case(pri));
        }
        let statuses = repo::get_latest_statuses(&self.pool, &req.repo_id)
            .await
            .unwrap_or_default();
        // Sort: failed/never first, then by case priority (high → low)
        pending.sort_by(|a, b| {
            let status_ord =
                |path: &str| match statuses.get(path).map(String::as_str).unwrap_or("never") {
                    "failed" => 0i32,
                    "never" => 1,
                    "blocked" => 2,
                    "skipped" => 3,
                    "passed" => 4,
                    _ => 5,
                };
            status_ord(&a.case_path)
                .cmp(&status_ord(&b.case_path))
                .then_with(|| priority_rank(&a.priority).cmp(&priority_rank(&b.priority)))
        });
        let entries = pending
            .iter()
            .map(|c| pb::CoverageEntry {
                latest_status: result_status_to_i32(
                    statuses
                        .get(&c.case_path)
                        .map(String::as_str)
                        .unwrap_or("never"),
                ),
                last_run_id: String::new(),
                last_run_date: String::new(),
                body: c.body.clone(),
                case: Some(case_to_pb(c)),
            })
            .collect();
        let pending_entries = pending
            .iter()
            .map(|c| pb::PendingEntry {
                case: Some(case_to_pb(c)),
                body: c.body.clone(),
                latest_status: result_status_to_i32(
                    statuses
                        .get(&c.case_path)
                        .map(String::as_str)
                        .unwrap_or("never"),
                ),
            })
            .collect();
        Ok(Response::new(pb::GetPendingCasesResponse {
            cases: pending.iter().map(case_to_pb).collect(),
            total_in_scope: i32::try_from(total).unwrap_or(i32::MAX),
            entries,
            pending: pending_entries,
        }))
    }

    async fn get_coverage_report(
        &self,
        request: Request<pb::GetCoverageReportRequest>,
    ) -> Result<Response<pb::GetCoverageReportResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }
        let status_filter = req.status_filter;
        let (entries, run_count) = repo::get_coverage_report(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;

        let mut pb_entries: Vec<pb::CoverageEntry> = entries
            .into_iter()
            .filter_map(|row| {
                let status_i32 = result_status_to_i32(&row.latest_status);
                if status_filter != pb::ResultStatus::Unspecified as i32
                    && status_i32 != status_filter
                {
                    return None;
                }
                let case = pb::Case {
                    path: row.case_path,
                    title: row.title,
                    description: row.description,
                    tags: row.tags,
                    priority: row.priority,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    body: row.body.clone(),
                };
                Some(pb::CoverageEntry {
                    case: Some(case),
                    latest_status: status_i32,
                    last_run_id: row.last_run_id,
                    last_run_date: row.last_run_date,
                    body: row.body,
                })
            })
            .collect();
        pb_entries.sort_by(|a, b| {
            let sa = result_status_rank(result_status_from_i32(a.latest_status));
            let sb = result_status_rank(result_status_from_i32(b.latest_status));
            let pa = a.case.as_ref().map_or(3, |c| priority_rank(&c.priority));
            let pb_rank = b.case.as_ref().map_or(3, |c| priority_rank(&c.priority));
            sa.cmp(&sb).then_with(|| pa.cmp(&pb_rank))
        });

        Ok(Response::new(pb::GetCoverageReportResponse {
            entries: pb_entries,
            run_count: i32::try_from(run_count).unwrap_or(i32::MAX),
        }))
    }

    async fn get_affected_cases(
        &self,
        request: Request<pb::GetAffectedCasesRequest>,
    ) -> Result<Response<pb::GetAffectedCasesResponse>, Status> {
        let req = request.into_inner();
        if req.repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }

        let cases = repo::list_cases(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;

        let status_map = repo::get_latest_statuses(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;

        // If caller passed changed_files directly, skip GitHub and use those.
        if !req.changed_files.is_empty() {
            let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
            let case_map: std::collections::HashMap<&str, &repo::LoadedCase> =
                cases.iter().map(|c| (c.case_path.as_str(), c)).collect();
            let mut affected_set: std::collections::HashSet<String> =
                std::collections::HashSet::new();
            let mut reasons: Vec<String> = Vec::new();
            for file in &req.changed_files {
                for path in &known_paths {
                    if text_references_case(file, path) {
                        reasons.push(format!("file {file} references {path}"));
                        affected_set.insert(path.clone());
                    }
                }
            }
            let source_changed: Vec<&str> = req
                .changed_files
                .iter()
                .filter(|f| !is_doc_file(f))
                .map(String::as_str)
                .collect();
            if !source_changed.is_empty() && affected_set.is_empty() {
                reasons.push(format!(
                    "{} source file(s) changed with no explicit case references — all {} case(s) flagged",
                    source_changed.len(),
                    known_paths.len()
                ));
                for p in &known_paths {
                    affected_set.insert(p.clone());
                }
            }
            let mut affected: Vec<String> = affected_set.into_iter().collect();
            affected.sort_by(|a, b| {
                let sa = result_status_rank(
                    status_map
                        .get(a.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                );
                let sb = result_status_rank(
                    status_map
                        .get(b.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                );
                let pa = case_map
                    .get(a.as_str())
                    .map_or(3, |c| priority_rank(&c.priority));
                let pb_rank = case_map
                    .get(b.as_str())
                    .map_or(3, |c| priority_rank(&c.priority));
                sa.cmp(&sb).then_with(|| pa.cmp(&pb_rank))
            });
            let reason = if reasons.is_empty() {
                "no relevant changes in provided file list".to_owned()
            } else {
                reasons.join("; ")
            };
            if let Some(pri) = priority_from_i32(req.priority_filter) {
                affected.retain(|path| {
                    case_map
                        .get(path.as_str())
                        .is_some_and(|c| c.priority.eq_ignore_ascii_case(pri))
                });
            }
            if !req.tags.is_empty() {
                affected.retain(|path| {
                    case_map.get(path.as_str()).is_some_and(|c| {
                        req.tags
                            .iter()
                            .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
                    })
                });
            }
            let pb_cases = affected
                .iter()
                .map(|path| pb::AffectedCase {
                    case: case_map.get(path.as_str()).map(|c| case_to_pb(c)),
                    reason: reason.clone(),
                    latest_status: result_status_to_i32(
                        status_map
                            .get(path.as_str())
                            .map(String::as_str)
                            .unwrap_or("never"),
                    ),
                    body: case_map
                        .get(path.as_str())
                        .map(|c| c.body.clone())
                        .unwrap_or_default(),
                })
                .collect();
            return Ok(Response::new(pb::GetAffectedCasesResponse {
                cases: pb_cases,
                reason,
            }));
        }

        if req.since_ref.is_empty() {
            let pri_filter = priority_from_i32(req.priority_filter);
            let mut affected: Vec<&repo::LoadedCase> = cases
                .iter()
                .filter(|c| pri_filter.is_none_or(|p| c.priority.eq_ignore_ascii_case(p)))
                .filter(|c| {
                    req.tags.is_empty()
                        || req
                            .tags
                            .iter()
                            .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
                })
                .collect();
            affected.sort_by(|a, b| {
                let sa = result_status_rank(
                    status_map
                        .get(a.case_path.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                );
                let sb = result_status_rank(
                    status_map
                        .get(b.case_path.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                );
                sa.cmp(&sb)
                    .then_with(|| priority_rank(&a.priority).cmp(&priority_rank(&b.priority)))
            });
            let pb_cases = affected
                .iter()
                .map(|c| pb::AffectedCase {
                    case: Some(case_to_pb(c)),
                    reason: "no since_ref provided; all cases flagged".to_owned(),
                    latest_status: result_status_to_i32(
                        status_map
                            .get(c.case_path.as_str())
                            .map(String::as_str)
                            .unwrap_or("never"),
                    ),
                    body: c.body.clone(),
                })
                .collect();
            return Ok(Response::new(pb::GetAffectedCasesResponse {
                cases: pb_cases,
                reason: "no since_ref provided; all cases flagged".to_owned(),
            }));
        }

        // Use GitHub compare API to find changed files.
        let stored = crate::repos_store::get(&self.pool, &req.repo_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found(format!("repository {} not found", req.repo_id)))?;

        let cfg = crate::github::config()
            .ok_or_else(|| Status::failed_precondition("GitHub App not configured"))?;
        let jwt = crate::github::generate_jwt(&cfg.app_id, &cfg.private_key)
            .map_err(|e| Status::internal(e.to_string()))?;
        let token = crate::github::get_installation_token(&stored.installation_id, &jwt)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let parts: Vec<&str> = stored.full_name.splitn(2, '/').collect();
        if parts.len() != 2 {
            return Err(Status::internal("invalid full_name in stored repo"));
        }
        let (owner, repo_name) = (parts[0], parts[1]);

        let compare = crate::github::compare(owner, repo_name, &req.since_ref, &token)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
        let case_map: std::collections::HashMap<&str, &repo::LoadedCase> =
            cases.iter().map(|c| (c.case_path.as_str(), c)).collect();

        let mut affected: Vec<String> = Vec::new();
        let mut affected_set: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut reasons: Vec<String> = Vec::new();

        let all_text = compare.commit_messages.join("\n");
        for path in &known_paths {
            if text_references_case(&all_text, path) {
                reasons.push(format!("commit messages reference: {path}"));
                if affected_set.insert(path.clone()) {
                    affected.push(path.clone());
                }
            }
        }

        for file in &compare.changed_files {
            for path in &known_paths {
                if text_references_case(file, path) {
                    reasons.push(format!("file {file} references {path}"));
                    if affected_set.insert(path.clone()) {
                        affected.push(path.clone());
                    }
                }
            }
        }

        let source_changed: Vec<&str> = compare
            .changed_files
            .iter()
            .filter(|f| !is_doc_file(f))
            .map(String::as_str)
            .collect();

        if !source_changed.is_empty() && affected.is_empty() {
            reasons.push(format!(
                "{} source file(s) changed with no explicit case references — all {} case(s) flagged",
                source_changed.len(),
                known_paths.len()
            ));
            affected = known_paths;
        }

        let reason = if reasons.is_empty() {
            "no relevant changes since last run".to_owned()
        } else {
            reasons.join("; ")
        };

        affected.sort_by(|a, b| {
            let sa = result_status_rank(
                status_map
                    .get(a.as_str())
                    .map(String::as_str)
                    .unwrap_or("never"),
            );
            let sb = result_status_rank(
                status_map
                    .get(b.as_str())
                    .map(String::as_str)
                    .unwrap_or("never"),
            );
            let pa = case_map
                .get(a.as_str())
                .map_or(3, |c| priority_rank(&c.priority));
            let pb_rank = case_map
                .get(b.as_str())
                .map_or(3, |c| priority_rank(&c.priority));
            sa.cmp(&sb).then_with(|| pa.cmp(&pb_rank))
        });

        if let Some(pri) = priority_from_i32(req.priority_filter) {
            affected.retain(|path| {
                case_map
                    .get(path.as_str())
                    .is_some_and(|c| c.priority.eq_ignore_ascii_case(pri))
            });
        }
        if !req.tags.is_empty() {
            affected.retain(|path| {
                case_map.get(path.as_str()).is_some_and(|c| {
                    req.tags
                        .iter()
                        .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
                })
            });
        }
        let pb_cases = affected
            .iter()
            .map(|path| pb::AffectedCase {
                case: case_map.get(path.as_str()).map(|c| case_to_pb(c)),
                reason: reason.clone(),
                latest_status: result_status_to_i32(
                    status_map
                        .get(path.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                ),
                body: case_map
                    .get(path.as_str())
                    .map(|c| c.body.clone())
                    .unwrap_or_default(),
            })
            .collect();

        Ok(Response::new(pb::GetAffectedCasesResponse {
            cases: pb_cases,
            reason,
        }))
    }

    async fn get_repo_status(
        &self,
        request: Request<pb::GetRepoStatusRequest>,
    ) -> Result<Response<pb::GetRepoStatusResponse>, Status> {
        let repo_id = request.into_inner().repo_id;
        if repo_id.is_empty() {
            return Err(invalid("repo_id is required"));
        }

        let pool = &self.pool;
        let (cov_res, suites_res, runs_res) = tokio::join!(
            repo::get_coverage_report(pool, &repo_id),
            repo::list_suites(pool, &repo_id),
            repo::list_runs(pool, &repo_id),
        );

        let (cov_entries, _run_count_cov) = cov_res.map_err(repo_err)?;
        let suites = suites_res.map_err(repo_err)?;
        let runs = runs_res.map_err(repo_err)?;

        let mut total_cases = 0i32;
        let mut high_cases = 0i32;
        let mut medium_cases = 0i32;
        let mut low_cases = 0i32;
        let mut passed = 0i32;
        let mut failed = 0i32;
        let mut blocked = 0i32;
        let mut skipped = 0i32;
        let mut never_run = 0i32;

        for e in &cov_entries {
            total_cases += 1;
            match e.priority.as_str() {
                "high" => high_cases += 1,
                "medium" => medium_cases += 1,
                "low" => low_cases += 1,
                _ => {}
            }
            match e.latest_status.as_str() {
                "passed" => passed += 1,
                "failed" => failed += 1,
                "blocked" => blocked += 1,
                "skipped" => skipped += 1,
                _ => never_run += 1,
            }
        }

        let active_runs_meta: Vec<&RunRow> =
            runs.iter().filter(|r| r.status == "in-progress").collect();

        let mut active_runs: Vec<pb::ActiveRunStatus> = Vec::new();
        for run_meta in &active_runs_meta {
            let (pending, total_in_scope) =
                match repo::get_pending_cases(pool, &repo_id, &run_meta.run_id).await {
                    Ok((cases, total)) => (
                        i32::try_from(cases.len()).unwrap_or(i32::MAX),
                        i32::try_from(total).unwrap_or(i32::MAX),
                    ),
                    Err(_) => (0, 0),
                };
            active_runs.push(pb::ActiveRunStatus {
                run_id: run_meta.run_id.clone(),
                tester: run_meta.tester.clone(),
                suite: run_meta.suite.clone().unwrap_or_default(),
                date: run_meta.date.clone(),
                pending_cases: pending,
                total_in_scope,
                commit_sha: run_meta.commit_sha.clone(),
                environment: run_meta.environment.clone().unwrap_or_default(),
            });
        }

        let last_completed_run = runs
            .iter()
            .filter(|r| r.status == "completed")
            .max_by(|a, b| a.date.cmp(&b.date).then_with(|| a.run_id.cmp(&b.run_id)))
            .map(run_meta_to_pb);

        Ok(Response::new(pb::GetRepoStatusResponse {
            total_cases,
            high_cases,
            medium_cases,
            low_cases,
            passed,
            failed,
            blocked,
            skipped,
            never_run,
            suite_count: i32::try_from(suites.len()).unwrap_or(i32::MAX),
            run_count: i32::try_from(runs.len()).unwrap_or(i32::MAX),
            active_runs,
            last_completed_run,
        }))
    }

    async fn get_git_hub_install_url(
        &self,
        _request: Request<pb::GetGitHubInstallUrlRequest>,
    ) -> Result<Response<pb::GetGitHubInstallUrlResponse>, Status> {
        match crate::github::config() {
            Some(cfg) => Ok(Response::new(pb::GetGitHubInstallUrlResponse {
                url: cfg.installation_url,
                configured: true,
            })),
            None => Ok(Response::new(pb::GetGitHubInstallUrlResponse {
                url: String::new(),
                configured: false,
            })),
        }
    }

    async fn handle_git_hub_callback(
        &self,
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
            crate::repos_store::add_or_update(&self.pool, &stored)
                .await
                .map_err(|e| Status::internal(e.to_string()))?;
            result.push(stored_to_pb(&stored));
        }

        Ok(Response::new(pb::HandleGitHubCallbackResponse {
            repositories: result,
        }))
    }

    async fn list_repositories(
        &self,
        _request: Request<pb::ListRepositoriesRequest>,
    ) -> Result<Response<pb::ListRepositoriesResponse>, Status> {
        let repositories = crate::repos_store::load(&self.pool)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .iter()
            .map(stored_to_pb)
            .collect();
        Ok(Response::new(pb::ListRepositoriesResponse { repositories }))
    }

    async fn sync_repository(
        &self,
        request: Request<pb::SyncRepositoryRequest>,
    ) -> Result<Response<pb::SyncRepositoryResponse>, Status> {
        let req = request.into_inner();
        if req.id.is_empty() {
            return Err(invalid("id is required"));
        }

        let stored = crate::repos_store::get(&self.pool, &req.id)
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
        crate::repos_store::add_or_update(&self.pool, &updated)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(pb::SyncRepositoryResponse {
            repository: Some(stored_to_pb(&updated)),
        }))
    }

    async fn remove_repository(
        &self,
        request: Request<pb::RemoveRepositoryRequest>,
    ) -> Result<Response<pb::RemoveRepositoryResponse>, Status> {
        let req = request.into_inner();
        if req.id.is_empty() {
            return Err(invalid("id is required"));
        }
        crate::repos_store::remove(&self.pool, &req.id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(pb::RemoveRepositoryResponse {}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::RepoError;
    use anyhow::anyhow;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// Returns a lazy pool that never actually connects.
    /// Safe to use in tests where validation fires before any DB access.
    fn lazy_pool() -> PgPool {
        sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://user:pass@localhost/db_does_not_exist")
            .expect("lazy pool creation should not fail")
    }

    fn server() -> AmelisoServer {
        AmelisoServer { pool: lazy_pool() }
    }

    // ── get_git_hub_install_url ───────────────────────────────────────────────

    #[tokio::test]
    async fn get_git_hub_install_url_returns_not_configured_when_env_absent() {
        let _g = ENV_LOCK.lock().unwrap();
        unsafe {
            std::env::remove_var("GITHUB_APP_ID");
            std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
        }
        let s = server();
        let res = s
            .get_git_hub_install_url(Request::new(pb::GetGitHubInstallUrlRequest {}))
            .await
            .unwrap()
            .into_inner();
        assert!(!res.configured);
        assert_eq!(res.url, "");
    }

    #[tokio::test]
    async fn get_git_hub_install_url_returns_configured_when_env_present() {
        let _g = ENV_LOCK.lock().unwrap();
        unsafe {
            std::env::set_var("GITHUB_APP_ID", "test-app");
            std::env::set_var("GITHUB_APP_PRIVATE_KEY", "test-key");
            std::env::remove_var("GITHUB_APP_INSTALLATION_URL");
            std::env::remove_var("GITHUB_APP_NAME");
        }
        let s = server();
        let res = s
            .get_git_hub_install_url(Request::new(pb::GetGitHubInstallUrlRequest {}))
            .await
            .unwrap()
            .into_inner();
        assert!(res.configured);
        assert!(res.url.contains("ameliso"));
        unsafe {
            std::env::remove_var("GITHUB_APP_ID");
            std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
        }
    }

    // ── record_result handler validation ─────────────────────────────────────

    #[tokio::test]
    async fn record_result_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn record_result_rejects_empty_run_id() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    #[tokio::test]
    async fn record_result_rejects_empty_case_path() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path is required"));
    }

    #[tokio::test]
    async fn record_result_rejects_failed_without_notes() {
        let s = server();
        let req = Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Failed as i32,
            notes: "".to_owned(),
        });
        let err = s.record_result(req).await.unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("notes are required"));
    }

    #[tokio::test]
    async fn record_result_rejects_blocked_without_notes() {
        let s = server();
        let req = Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Blocked as i32,
            notes: "   ".to_owned(), // whitespace-only
        });
        let err = s.record_result(req).await.unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("notes are required"));
    }

    // ── handler required-field validation ─────────────────────────────────────

    #[tokio::test]
    async fn list_cases_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .list_cases(Request::new(pb::ListCasesRequest {
                repo_id: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn list_cases_passes_validation() {
        // No filters (all defaults) is valid; passes validation → DB error.
        let s = server();
        let err = s
            .list_cases(Request::new(pb::ListCasesRequest {
                repo_id: "owner/repo".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_cases_with_suite_filter_passes_validation() {
        // Non-empty suite filter is valid — passes validation, then hits DB.
        let s = server();
        let err = s
            .list_cases(Request::new(pb::ListCasesRequest {
                repo_id: "owner/repo".to_owned(),
                suite: "smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_cases_with_query_filter_passes_validation() {
        // Non-empty query filter is valid — passes validation, then hits DB.
        let s = server();
        let err = s
            .list_cases(Request::new(pb::ListCasesRequest {
                repo_id: "owner/repo".to_owned(),
                query: "login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_cases_with_tags_filter_passes_validation() {
        // Non-empty tags filter is valid — passes validation, then hits DB.
        let s = server();
        let err = s
            .list_cases(Request::new(pb::ListCasesRequest {
                repo_id: "owner/repo".to_owned(),
                tags: vec!["auth".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_cases_with_priority_filter_passes_validation() {
        // Non-Unspecified priority takes the Some(pri) branch — passes validation → DB error.
        let s = server();
        let err = s
            .list_cases(Request::new(pb::ListCasesRequest {
                repo_id: "owner/repo".to_owned(),
                priority: pb::Priority::High as i32,
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_case_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .get_case(Request::new(pb::GetCaseRequest {
                repo_id: "".to_owned(),
                case_path: "auth/login".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_case_rejects_empty_case_path() {
        // Empty case_path passes service validation but repo::get_case rejects it
        // via validate_slug_path → InvalidArg.
        let s = server();
        let err = s
            .get_case(Request::new(pb::GetCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_case_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "Login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn bulk_create_cases_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .bulk_create_cases(Request::new(pb::BulkCreateCasesRequest {
                repo_id: "".to_owned(),
                cases: vec![pb::BulkCaseEntry {
                    case_path: "auth/login".to_owned(),
                    title: "Login".to_owned(),
                    ..Default::default()
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn bulk_create_cases_rejects_empty_cases_list() {
        let s = server();
        let err = s
            .bulk_create_cases(Request::new(pb::BulkCreateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("cases list must not be empty"));
    }

    #[tokio::test]
    async fn bulk_create_cases_rejects_entry_with_empty_case_path() {
        let s = server();
        let err = s
            .bulk_create_cases(Request::new(pb::BulkCreateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![pb::BulkCaseEntry {
                    case_path: "".to_owned(),
                    title: "Login".to_owned(),
                    ..Default::default()
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path"));
    }

    #[tokio::test]
    async fn bulk_create_cases_rejects_entry_with_empty_title() {
        let s = server();
        let err = s
            .bulk_create_cases(Request::new(pb::BulkCreateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![pb::BulkCaseEntry {
                    case_path: "auth/login".to_owned(),
                    title: "".to_owned(),
                    ..Default::default()
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("title"));
    }

    #[tokio::test]
    async fn bulk_create_cases_valid_passes_validation() {
        // Validation passes → hits DB → Internal error (not InvalidArgument).
        let s = server();
        let err = s
            .bulk_create_cases(Request::new(pb::BulkCreateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![
                    pb::BulkCaseEntry {
                        case_path: "auth/login".to_owned(),
                        title: "Login".to_owned(),
                        ..Default::default()
                    },
                    pb::BulkCaseEntry {
                        case_path: "billing/checkout".to_owned(),
                        title: "Checkout".to_owned(),
                        ..Default::default()
                    },
                ],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn bulk_update_cases_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .bulk_update_cases(Request::new(pb::BulkUpdateCasesRequest {
                repo_id: "".to_owned(),
                cases: vec![pb::BulkUpdateEntry {
                    case_path: "auth/login".to_owned(),
                    ..Default::default()
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn bulk_update_cases_rejects_empty_cases_list() {
        let s = server();
        let err = s
            .bulk_update_cases(Request::new(pb::BulkUpdateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("cases"));
    }

    #[tokio::test]
    async fn bulk_update_cases_rejects_entry_with_empty_case_path() {
        let s = server();
        let err = s
            .bulk_update_cases(Request::new(pb::BulkUpdateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![pb::BulkUpdateEntry {
                    case_path: "".to_owned(),
                    ..Default::default()
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path"));
    }

    #[tokio::test]
    async fn bulk_update_cases_rejects_body_too_long() {
        let s = server();
        let err = s
            .bulk_update_cases(Request::new(pb::BulkUpdateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![pb::BulkUpdateEntry {
                    case_path: "auth/login".to_owned(),
                    body: "x".repeat(100_001),
                    ..Default::default()
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("body"));
    }

    #[tokio::test]
    async fn bulk_update_cases_valid_passes_validation_to_db() {
        // Validation passes → hits DB → not InvalidArgument.
        let s = server();
        let err = s
            .bulk_update_cases(Request::new(pb::BulkUpdateCasesRequest {
                repo_id: "owner/repo".to_owned(),
                cases: vec![pb::BulkUpdateEntry {
                    case_path: "auth/login".to_owned(),
                    title: "Login flow".to_owned(),
                    ..Default::default()
                }],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn bulk_delete_cases_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
                repo_id: "".to_owned(),
                case_paths: vec!["auth/login".to_owned()],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn bulk_delete_cases_rejects_empty_list() {
        let s = server();
        let err = s
            .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
                repo_id: "owner/repo".to_owned(),
                case_paths: vec![],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_paths"));
    }

    #[tokio::test]
    async fn bulk_delete_cases_rejects_empty_path_in_list() {
        let s = server();
        let err = s
            .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
                repo_id: "owner/repo".to_owned(),
                case_paths: vec!["".to_owned()],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path"));
    }

    #[tokio::test]
    async fn bulk_delete_cases_valid_passes_validation_to_db() {
        // Validation passes → hits DB → not InvalidArgument.
        let s = server();
        let err = s
            .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
                repo_id: "owner/repo".to_owned(),
                case_paths: vec!["auth/login".to_owned()],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn delete_case_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .delete_case(Request::new(pb::DeleteCaseRequest {
                repo_id: "".to_owned(),
                case_path: "auth/login".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn list_suites_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .list_suites(Request::new(pb::ListSuitesRequest {
                repo_id: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_suite_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .get_suite(Request::new(pb::GetSuiteRequest {
                repo_id: "".to_owned(),
                slug: "smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn create_suite_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .create_suite(Request::new(pb::CreateSuiteRequest {
                repo_id: "".to_owned(),
                slug: "smoke".to_owned(),
                name: "Smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn delete_suite_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .delete_suite(Request::new(pb::DeleteSuiteRequest {
                repo_id: "".to_owned(),
                slug: "smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn list_runs_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .list_runs(Request::new(pb::ListRunsRequest {
                repo_id: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_run_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .get_run(Request::new(pb::GetRunRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_repo_status_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .get_repo_status(Request::new(pb::GetRepoStatusRequest {
                repo_id: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_affected_cases_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .get_affected_cases(Request::new(pb::GetAffectedCasesRequest {
                repo_id: "".to_owned(),
                since_ref: "HEAD~1".to_owned(),
                changed_files: vec![],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_affected_cases_with_changed_files_passes_validation() {
        // changed_files path: validation passes, then list_cases hits DB → Internal error (not InvalidArgument).
        let s = server();
        let err = s
            .get_affected_cases(Request::new(pb::GetAffectedCasesRequest {
                repo_id: "owner/repo".to_owned(),
                since_ref: String::new(),
                changed_files: vec!["src/auth.ts".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_case_rejects_empty_case_path() {
        let s = server();
        let err = s
            .update_case(Request::new(pb::UpdateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path is required"));
    }

    #[tokio::test]
    async fn update_case_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .update_case(Request::new(pb::UpdateCaseRequest {
                repo_id: "".to_owned(),
                case_path: "auth/login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_suite_rejects_empty_slug() {
        let s = server();
        let err = s
            .get_suite(Request::new(pb::GetSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("slug is required"));
    }

    #[tokio::test]
    async fn update_suite_rejects_empty_slug() {
        let s = server();
        let err = s
            .update_suite(Request::new(pb::UpdateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("slug is required"));
    }

    #[tokio::test]
    async fn update_suite_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .update_suite(Request::new(pb::UpdateSuiteRequest {
                repo_id: "".to_owned(),
                slug: "smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_run_rejects_empty_run_id() {
        let s = server();
        let err = s
            .get_run(Request::new(pb::GetRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    #[tokio::test]
    async fn finalize_run_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .finalize_run(Request::new(pb::FinalizeRunRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                status: pb::RunStatus::Completed as i32,
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn finalize_run_rejects_empty_run_id() {
        let s = server();
        let err = s
            .finalize_run(Request::new(pb::FinalizeRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
                status: pb::RunStatus::Completed as i32,
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    #[tokio::test]
    async fn get_pending_cases_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_pending_cases_rejects_empty_run_id() {
        let s = server();
        let err = s
            .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    #[tokio::test]
    async fn finalize_run_rejects_invalid_status() {
        let s = server();
        let err = s
            .finalize_run(Request::new(pb::FinalizeRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                status: pb::RunStatus::InProgress as i32, // not a valid finalize status
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn finalize_run_unspecified_status_auto_detects() {
        // UNSPECIFIED passes validation; handler then queries run from DB → Internal (no DB).
        let s = server();
        let err = s
            .finalize_run(Request::new(pb::FinalizeRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                status: pb::RunStatus::Unspecified as i32,
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn record_result_rejects_invalid_status() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Unspecified as i32,
                notes: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("status must be one of"));
    }

    // "skipped" and "passed" must not require notes (notes are only required for failed/blocked).
    // These tests verify that both statuses pass validation by producing a DB error (Internal),
    // not a validation error (InvalidArgument).

    #[tokio::test]
    async fn record_result_skipped_without_notes_passes_validation() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Skipped as i32,
                notes: "".to_owned(),
            }))
            .await
            .unwrap_err();
        // Validation passed; DB call failed because the lazy pool has no real connection.
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn record_result_passed_without_notes_passes_validation() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn record_result_blocked_with_notes_passes_validation() {
        // blocked + non-empty notes satisfies validation → DB error, not InvalidArgument.
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Blocked as i32,
                notes: "blocked by infra".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn record_result_failed_with_notes_passes_validation() {
        // failed + non-empty notes satisfies validation → DB error, not InvalidArgument.
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Failed as i32,
                notes: "assertion failed".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    // ── create_case validation ────────────────────────────────────────────────

    #[tokio::test]
    async fn create_case_rejects_empty_title() {
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("title is required"));
    }

    #[tokio::test]
    async fn create_case_rejects_empty_case_path() {
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "".to_owned(),
                title: "Login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path is required"));
    }

    #[tokio::test]
    async fn create_case_rejects_title_too_long() {
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "x".repeat(256),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("title must not exceed 255"));
    }

    #[tokio::test]
    async fn create_case_rejects_case_path_too_long() {
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "a".repeat(201),
                title: "Login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path must not exceed 200"));
    }

    #[tokio::test]
    async fn update_case_rejects_title_too_long() {
        let s = server();
        let err = s
            .update_case(Request::new(pb::UpdateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "x".repeat(256),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("title must not exceed 255"));
    }

    #[tokio::test]
    async fn create_case_strips_empty_and_whitespace_tags() {
        let s = server();
        // Tags with empty strings and whitespace-only entries should be rejected
        // before reaching DB. Here we just verify validation passes and hits DB
        // (non-InvalidArgument error), meaning the clean_tags path was exercised.
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "Login".to_owned(),
                tags: vec!["".to_owned(), "  ".to_owned(), "smoke".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_case_strips_whitespace_only_tags() {
        let s = server();
        let err = s
            .update_case(Request::new(pb::UpdateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                tags: vec!["  ".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        // Whitespace-only tags cleaned to empty → treated as no-tag update → reaches DB
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_suite_rejects_slug_too_long() {
        let s = server();
        let err = s
            .create_suite(Request::new(pb::CreateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "x".repeat(101),
                name: "Smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("slug must not exceed 100"));
    }

    #[tokio::test]
    async fn create_run_rejects_tester_too_long() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                tester: "x".repeat(256),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("tester must not exceed 255"));
    }

    #[tokio::test]
    async fn record_result_rejects_notes_too_long() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Failed as i32,
                notes: "x".repeat(2001),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("notes must not exceed 2000"));
    }

    #[tokio::test]
    async fn create_case_valid_fields_pass_validation() {
        // All required fields present — validation passes, DB produces an error.
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "Login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_case_with_custom_body_passes_validation() {
        // Non-empty body uses Some(body) path — same validation, still reaches DB.
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "Login".to_owned(),
                body: "## Custom Steps\n\n1. Go to /login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_case_with_explicit_priority_passes_validation() {
        // Non-Unspecified priority takes the Some("high") branch — passes validation → DB error.
        let s = server();
        let err = s
            .create_case(Request::new(pb::CreateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "Login".to_owned(),
                priority: pb::Priority::High as i32,
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    // ── create_suite validation ───────────────────────────────────────────────

    #[tokio::test]
    async fn create_suite_rejects_empty_slug() {
        let s = server();
        let err = s
            .create_suite(Request::new(pb::CreateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "".to_owned(),
                name: "Smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("slug is required"));
    }

    #[tokio::test]
    async fn create_suite_rejects_empty_name() {
        let s = server();
        let err = s
            .create_suite(Request::new(pb::CreateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                name: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("name is required"));
    }

    // ── create_run validation ─────────────────────────────────────────────────

    #[tokio::test]
    async fn create_run_empty_slug_passes_validation() {
        // Empty slug is valid — server auto-generates one; handler then hits DB → Internal.
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "".to_owned(),
                slug: "smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    // ── bulk_record_results validation ───────────────────────────────────────

    #[tokio::test]
    async fn bulk_record_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn bulk_record_rejects_empty_run_id() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    #[tokio::test]
    async fn bulk_record_rejects_empty_results() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("results must not be empty"));
    }

    #[tokio::test]
    async fn bulk_record_rejects_failed_without_notes() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Failed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("notes are required"));
    }

    #[tokio::test]
    async fn bulk_record_rejects_blocked_without_notes() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Blocked as i32,
                    notes: "  ".to_owned(), // whitespace-only
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("notes are required"));
    }

    #[tokio::test]
    async fn bulk_record_skipped_without_notes_passes_validation() {
        // "skipped" must NOT require notes; validation should pass and produce a DB error.
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Skipped as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn bulk_record_rejects_invalid_status() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Unspecified as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("status must be one of"));
    }

    #[tokio::test]
    async fn bulk_record_rejects_empty_case_path() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path"));
    }

    #[tokio::test]
    async fn bulk_record_blocked_with_notes_passes_validation() {
        // blocked + non-empty notes satisfies validation → DB error, not InvalidArgument.
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Blocked as i32,
                    notes: "blocked by infra".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn bulk_record_failed_with_notes_passes_validation() {
        // failed + non-empty notes satisfies validation → DB error, not InvalidArgument.
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Failed as i32,
                    notes: "assertion failed".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    // ── delete validation ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn delete_case_rejects_empty_case_path() {
        let s = server();
        let err = s
            .delete_case(Request::new(pb::DeleteCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path is required"));
    }

    #[tokio::test]
    async fn delete_suite_rejects_empty_slug() {
        let s = server();
        let err = s
            .delete_suite(Request::new(pb::DeleteSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("slug is required"));
    }

    #[tokio::test]
    async fn delete_run_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .delete_run(Request::new(pb::DeleteRunRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn get_coverage_report_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
                repo_id: "".to_owned(),
                status_filter: 0,
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn delete_run_rejects_empty_run_id() {
        let s = server();
        let err = s
            .delete_run(Request::new(pb::DeleteRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    // ── github handler validation ─────────────────────────────────────────────

    #[tokio::test]
    async fn handle_git_hub_callback_rejects_empty_installation_id() {
        let s = server();
        let err = s
            .handle_git_hub_callback(Request::new(pb::HandleGitHubCallbackRequest {
                installation_id: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("installation_id is required"));
    }

    #[tokio::test]
    async fn handle_git_hub_callback_rejects_when_github_not_configured() {
        let _g = ENV_LOCK.lock().unwrap();
        unsafe {
            std::env::remove_var("GITHUB_APP_ID");
            std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
        }
        let s = server();
        let err = s
            .handle_git_hub_callback(Request::new(pb::HandleGitHubCallbackRequest {
                installation_id: "inst-1".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::FailedPrecondition);
        assert!(err.message().contains("GitHub App not configured"));
    }

    #[tokio::test]
    async fn sync_repository_rejects_empty_id() {
        let s = server();
        let err = s
            .sync_repository(Request::new(pb::SyncRepositoryRequest {
                id: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("id is required"));
    }

    #[tokio::test]
    async fn remove_repository_rejects_empty_id() {
        let s = server();
        let err = s
            .remove_repository(Request::new(pb::RemoveRepositoryRequest {
                id: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("id is required"));
    }

    #[tokio::test]
    async fn record_result_rejects_never_status() {
        let s = server();
        let err = s
            .record_result(Request::new(pb::RecordResultRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Never as i32,
                notes: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("status must be one of"));
    }

    #[tokio::test]
    async fn bulk_record_rejects_never_status() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Never as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("status must be one of"));
    }

    #[tokio::test]
    async fn finalize_run_rejects_in_progress_status() {
        // IN_PROGRESS is always rejected — only completed/aborted/unspecified are valid.
        let s = server();
        let err = s
            .finalize_run(Request::new(pb::FinalizeRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                status: pb::RunStatus::InProgress as i32,
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err
            .message()
            .contains("status must be completed or aborted"));
    }

    #[tokio::test]
    async fn finalize_run_aborted_passes_validation() {
        // "aborted" is a valid finalize status — validation must pass, producing a DB error.
        let s = server();
        let err = s
            .finalize_run(Request::new(pb::FinalizeRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                status: pb::RunStatus::Aborted as i32,
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn finalize_run_completed_passes_validation() {
        // "completed" is a valid finalize status — validation must pass, producing a DB error.
        let s = server();
        let err = s
            .finalize_run(Request::new(pb::FinalizeRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                status: pb::RunStatus::Completed as i32,
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn bulk_record_passed_without_notes_passes_validation() {
        // "passed" must NOT require notes; validation should pass and produce a DB error.
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_empty_tester_passes_validation() {
        // Empty tester is allowed (falls back to "unknown"); validation must pass → DB error.
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                tester: "".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_suite_with_replace_cases_true_passes_validation() {
        // replace_cases=true with empty cases list is valid; passes validation → DB error.
        let s = server();
        let err = s
            .update_suite(Request::new(pb::UpdateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                cases: vec![],
                replace_cases: true,
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_runs_with_status_filter_passes_validation() {
        // A non-Unspecified status filter is valid; passes validation → DB error.
        let s = server();
        let err = s
            .list_runs(Request::new(pb::ListRunsRequest {
                repo_id: "owner/repo".to_owned(),
                status: pb::RunStatus::InProgress as i32,
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_runs_passes_validation() {
        // No status filter (Unspecified default) is valid; passes validation → DB error.
        let s = server();
        let err = s
            .list_runs(Request::new(pb::ListRunsRequest {
                repo_id: "owner/repo".to_owned(),
                status: pb::RunStatus::Unspecified as i32,
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_coverage_report_with_status_filter_passes_validation() {
        // A non-Unspecified status_filter is valid — passes validation → DB error.
        let s = server();
        let err = s
            .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
                repo_id: "owner/repo".to_owned(),
                status_filter: pb::ResultStatus::Failed as i32,
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    // ── passes-validation paths for simple handlers ───────────────────────────

    #[tokio::test]
    async fn get_case_passes_validation() {
        // Valid repo_id + any case_path passes validation, then hits DB.
        let s = server();
        let err = s
            .get_case(Request::new(pb::GetCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn delete_case_passes_validation() {
        // Both required fields present — passes validation, then hits DB.
        let s = server();
        let err = s
            .delete_case(Request::new(pb::DeleteCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn delete_suite_passes_validation() {
        // Both required fields present — passes validation, then hits DB.
        let s = server();
        let err = s
            .delete_suite(Request::new(pb::DeleteSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn delete_run_passes_validation() {
        // Both required fields present — passes validation, then hits DB.
        let s = server();
        let err = s
            .delete_run(Request::new(pb::DeleteRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_run_passes_validation() {
        // Both required fields present — passes validation, then hits DB.
        let s = server();
        let err = s
            .get_run(Request::new(pb::GetRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_pending_cases_passes_validation() {
        // Both required fields present — passes validation, then hits DB.
        let s = server();
        let err = s
            .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_pending_cases_with_priority_filter_passes_validation() {
        // Priority filter set to HIGH passes validation → DB error (not InvalidArgument).
        let s = server();
        let err = s
            .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                priority_filter: pb::Priority::High as i32,
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_suites_passes_validation() {
        // Non-empty repo_id passes validation, then hits DB.
        let s = server();
        let err = s
            .list_suites(Request::new(pb::ListSuitesRequest {
                repo_id: "owner/repo".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_suite_passes_validation() {
        // Both required fields present — passes validation, then hits DB.
        let s = server();
        let err = s
            .get_suite(Request::new(pb::GetSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_suite_minimal_passes_validation() {
        // No description (empty → None), no cases — both take the None/empty branch.
        let s = server();
        let err = s
            .create_suite(Request::new(pb::CreateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                name: "Smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_suite_with_description_passes_validation() {
        // Non-empty description takes the Some(desc) branch — passes validation → DB error.
        let s = server();
        let err = s
            .create_suite(Request::new(pb::CreateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                name: "Smoke Suite".to_owned(),
                description: "Covers the happy path".to_owned(),
                cases: vec![],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_with_environment_and_suite_passes_validation() {
        // Non-empty environment and suite take the Some(...) branches — passes validation → DB error.
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                tester: "alice".to_owned(),
                environment: "staging".to_owned(),
                suite: "smoke".to_owned(),
                cases: vec![],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_rejects_both_suite_and_cases() {
        // Passing both suite and non-empty cases list is invalid.
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                suite: "regression".to_owned(),
                cases: vec!["auth/login".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("suite") || err.message().contains("cases"));
    }

    #[tokio::test]
    async fn create_run_rejects_invalid_inline_case_path() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                cases: vec!["../traversal".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_with_inline_cases_passes_validation() {
        // Non-empty cases list + no suite → passes validation → DB error (not InvalidArgument).
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                cases: vec!["auth/login".to_owned(), "billing/checkout".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_rejects_since_ref_with_cases() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                since_ref: "abc123".to_owned(),
                cases: vec!["auth/login".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("since_ref") || err.message().contains("cases"));
    }

    #[tokio::test]
    async fn create_run_rejects_since_ref_with_suite() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                since_ref: "abc123".to_owned(),
                suite: "smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("since_ref") || err.message().contains("suite"));
    }

    #[tokio::test]
    async fn create_run_rejects_changed_files_with_cases() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                changed_files: vec!["src/main.rs".to_owned()],
                cases: vec!["auth/login".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("changed_files") || err.message().contains("cases"));
    }

    #[tokio::test]
    async fn create_run_rejects_changed_files_with_suite() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                changed_files: vec!["src/main.rs".to_owned()],
                suite: "smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("changed_files") || err.message().contains("suite"));
    }

    #[tokio::test]
    async fn create_run_with_changed_files_passes_validation_to_db() {
        // changed_files set + no suite/cases → passes validation → DB error (not InvalidArgument).
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                changed_files: vec!["src/main.rs".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_with_since_ref_passes_validation_to_github_err() {
        // since_ref set + no suite/cases → passes validation → GitHub/DB error (not InvalidArgument).
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                since_ref: "abc123".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_run_rejects_use_last_run_with_since_ref() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                use_last_run: true,
                since_ref: "abc123".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("use_last_run") || err.message().contains("since_ref"));
    }

    #[tokio::test]
    async fn create_run_rejects_use_last_run_with_changed_files() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                use_last_run: true,
                changed_files: vec!["src/main.rs".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("use_last_run") || err.message().contains("changed_files"));
    }

    #[tokio::test]
    async fn create_run_rejects_use_last_run_with_cases() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                use_last_run: true,
                cases: vec!["auth/login".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("use_last_run") || err.message().contains("cases"));
    }

    #[tokio::test]
    async fn create_run_rejects_use_last_run_with_suite() {
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                use_last_run: true,
                suite: "smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("use_last_run") || err.message().contains("suite"));
    }

    #[tokio::test]
    async fn create_run_with_use_last_run_passes_validation_to_db() {
        // use_last_run=true + no suite/cases/since_ref → passes validation → DB error.
        let s = server();
        let err = s
            .create_run(Request::new(pb::CreateRunRequest {
                repo_id: "owner/repo".to_owned(),
                use_last_run: true,
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_case_with_no_optional_fields_passes_validation() {
        // All optional fields absent — all take the None path; passes validation → DB error.
        let s = server();
        let err = s
            .update_case(Request::new(pb::UpdateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_case_with_optional_fields_passes_validation() {
        // Non-empty title/tags/body take the Some(...) branches — passes validation → DB error.
        let s = server();
        let err = s
            .update_case(Request::new(pb::UpdateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                title: "Login Flow".to_owned(),
                description: "Updated desc".to_owned(),
                tags: vec!["smoke".to_owned()],
                body: "## Steps\n\n1. Navigate to /login".to_owned(),
                priority: pb::Priority::High as i32,
                new_path: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_case_with_new_path_passes_validation() {
        let s = server();
        let err = s
            .update_case(Request::new(pb::UpdateCaseRequest {
                repo_id: "owner/repo".to_owned(),
                case_path: "auth/login".to_owned(),
                new_path: "auth/signin".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_suite_with_new_slug_passes_validation() {
        let s = server();
        let err = s
            .update_suite(Request::new(pb::UpdateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                new_slug: "smoke-v2".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_affected_cases_passes_validation() {
        // Non-empty repo_id passes validation; handler then hits the DB → Internal.
        let s = server();
        let err = s
            .get_affected_cases(Request::new(pb::GetAffectedCasesRequest {
                repo_id: "owner/repo".to_owned(),
                since_ref: "abc123".to_owned(),
                changed_files: vec![],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_affected_cases_empty_since_ref_passes_validation() {
        // Empty since_ref is valid (all cases flagged path); still passes validation → DB error.
        let s = server();
        let err = s
            .get_affected_cases(Request::new(pb::GetAffectedCasesRequest {
                repo_id: "owner/repo".to_owned(),
                since_ref: "".to_owned(),
                changed_files: vec![],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_affected_cases_with_tags_filter_passes_validation() {
        // tags filter is valid (validation only checks repo_id); handler hits DB → Internal.
        let s = server();
        let err = s
            .get_affected_cases(Request::new(pb::GetAffectedCasesRequest {
                repo_id: "owner/repo".to_owned(),
                since_ref: "".to_owned(),
                changed_files: vec![],
                tags: vec!["smoke".to_owned()],
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_repositories_returns_internal_without_db() {
        // list_repositories has no validation — it always hits the DB directly.
        let s = server();
        let err = s
            .list_repositories(Request::new(pb::ListRepositoriesRequest {}))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::Internal);
    }

    #[tokio::test]
    async fn sync_repository_passes_validation() {
        // Non-empty id passes validation; the handler then hits the DB → Internal.
        let s = server();
        let err = s
            .sync_repository(Request::new(pb::SyncRepositoryRequest {
                id: "owner/repo".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn remove_repository_passes_validation() {
        // Non-empty id passes validation; the handler then hits the DB → Internal.
        let s = server();
        let err = s
            .remove_repository(Request::new(pb::RemoveRepositoryRequest {
                id: "owner/repo".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_suite_passes_validation() {
        // repo_id + slug non-empty passes all validation gates → DB error.
        let s = server();
        let err = s
            .update_suite(Request::new(pb::UpdateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_suite_with_name_and_description_passes_validation() {
        // Non-empty name and description take the Some(...) paths — passes validation → DB error.
        let s = server();
        let err = s
            .update_suite(Request::new(pb::UpdateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                name: "Smoke Tests".to_owned(),
                description: "Critical path checks".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_suite_with_non_empty_cases_passes_validation() {
        // replace_cases=false but cases non-empty hits the `!cases.is_empty()` branch → cases=Some.
        let s = server();
        let err = s
            .update_suite(Request::new(pb::UpdateSuiteRequest {
                repo_id: "owner/repo".to_owned(),
                slug: "smoke".to_owned(),
                cases: vec!["auth/login".to_owned()],
                replace_cases: false,
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_coverage_report_passes_validation() {
        // Non-empty repo_id with default (Unspecified) filter passes validation → DB error.
        let s = server();
        let err = s
            .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
                repo_id: "owner/repo".to_owned(),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn get_repo_status_passes_validation() {
        let s = server();
        let err = s
            .get_repo_status(Request::new(pb::GetRepoStatusRequest {
                repo_id: "owner/repo".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    // ── invalid helper ────────────────────────────────────────────────────────

    #[test]
    fn invalid_helper_returns_invalid_argument_status() {
        let s = invalid("repo_id is required");
        assert_eq!(s.code(), tonic::Code::InvalidArgument);
        assert_eq!(s.message(), "repo_id is required");
    }

    // ── repo_err mapping ──────────────────────────────────────────────────────

    #[test]
    fn repo_err_not_found_maps_to_not_found_status() {
        let s = repo_err(RepoError::NotFound("case x".to_owned()));
        assert_eq!(s.code(), tonic::Code::NotFound);
        assert!(s.message().contains("case x"));
    }

    #[test]
    fn repo_err_already_exists_maps_to_already_exists_status() {
        let s = repo_err(RepoError::AlreadyExists("run y".to_owned()));
        assert_eq!(s.code(), tonic::Code::AlreadyExists);
    }

    #[test]
    fn repo_err_closed_run_maps_to_failed_precondition() {
        let s = repo_err(RepoError::ClosedRun("run z".to_owned()));
        assert_eq!(s.code(), tonic::Code::FailedPrecondition);
    }

    #[test]
    fn repo_err_invalid_arg_maps_to_invalid_argument() {
        let s = repo_err(RepoError::InvalidArg("bad path".to_owned()));
        assert_eq!(s.code(), tonic::Code::InvalidArgument);
    }

    #[test]
    fn repo_err_other_maps_to_internal() {
        let s = repo_err(RepoError::Other(anyhow!("oops")));
        assert_eq!(s.code(), tonic::Code::Internal);
        assert!(s.message().contains("oops"));
    }

    // ── run_status_to_i32 ─────────────────────────────────────────────────────

    #[test]
    fn run_status_to_i32_known_values() {
        assert_eq!(
            run_status_to_i32("in-progress"),
            pb::RunStatus::InProgress as i32
        );
        assert_eq!(
            run_status_to_i32("completed"),
            pb::RunStatus::Completed as i32
        );
        assert_eq!(run_status_to_i32("aborted"), pb::RunStatus::Aborted as i32);
    }

    #[test]
    fn run_status_to_i32_unknown_maps_to_unspecified() {
        assert_eq!(
            run_status_to_i32("bogus"),
            pb::RunStatus::Unspecified as i32
        );
        assert_eq!(run_status_to_i32(""), pb::RunStatus::Unspecified as i32);
    }

    // ── result_status_to_i32 ─────────────────────────────────────────────────

    #[test]
    fn result_status_to_i32_known_values() {
        assert_eq!(
            result_status_to_i32("passed"),
            pb::ResultStatus::Passed as i32
        );
        assert_eq!(
            result_status_to_i32("failed"),
            pb::ResultStatus::Failed as i32
        );
        assert_eq!(
            result_status_to_i32("blocked"),
            pb::ResultStatus::Blocked as i32
        );
        assert_eq!(
            result_status_to_i32("skipped"),
            pb::ResultStatus::Skipped as i32
        );
        assert_eq!(
            result_status_to_i32("never"),
            pb::ResultStatus::Never as i32
        );
    }

    #[test]
    fn result_status_to_i32_unknown_maps_to_unspecified() {
        assert_eq!(
            result_status_to_i32("bogus"),
            pb::ResultStatus::Unspecified as i32
        );
    }

    // ── result_status_from_i32 ───────────────────────────────────────────────

    #[test]
    fn result_status_from_i32_round_trips() {
        assert_eq!(
            result_status_from_i32(pb::ResultStatus::Passed as i32),
            "passed"
        );
        assert_eq!(
            result_status_from_i32(pb::ResultStatus::Failed as i32),
            "failed"
        );
        assert_eq!(
            result_status_from_i32(pb::ResultStatus::Blocked as i32),
            "blocked"
        );
        assert_eq!(
            result_status_from_i32(pb::ResultStatus::Skipped as i32),
            "skipped"
        );
        assert_eq!(
            result_status_from_i32(pb::ResultStatus::Never as i32),
            "never"
        );
        assert_eq!(
            result_status_from_i32(pb::ResultStatus::Unspecified as i32),
            "unspecified"
        );
    }

    #[test]
    fn result_status_from_i32_unknown_value_maps_to_unspecified() {
        assert_eq!(result_status_from_i32(9999), "unspecified");
    }

    // ── run_status_from_i32 ──────────────────────────────────────────────────

    #[test]
    fn run_status_from_i32_round_trips() {
        assert_eq!(
            run_status_from_i32(pb::RunStatus::InProgress as i32),
            "in-progress"
        );
        assert_eq!(
            run_status_from_i32(pb::RunStatus::Completed as i32),
            "completed"
        );
        assert_eq!(
            run_status_from_i32(pb::RunStatus::Aborted as i32),
            "aborted"
        );
        assert_eq!(
            run_status_from_i32(pb::RunStatus::Unspecified as i32),
            "unspecified"
        );
    }

    #[test]
    fn run_status_from_i32_unknown_value_maps_to_unspecified() {
        assert_eq!(run_status_from_i32(9999), "unspecified");
    }

    // ── priority_from_i32 ─────────────────────────────────────────────────────

    #[test]
    fn priority_from_i32_known_values() {
        assert_eq!(priority_from_i32(pb::Priority::Low as i32), Some("low"));
        assert_eq!(
            priority_from_i32(pb::Priority::Medium as i32),
            Some("medium")
        );
        assert_eq!(priority_from_i32(pb::Priority::High as i32), Some("high"));
        assert_eq!(priority_from_i32(pb::Priority::Unspecified as i32), None);
    }

    #[test]
    fn priority_from_i32_unknown_maps_to_none() {
        assert_eq!(priority_from_i32(9999), None);
    }

    // ── priority_rank ─────────────────────────────────────────────────────────

    #[test]
    fn priority_rank_ordering() {
        assert!(priority_rank("high") < priority_rank("medium"));
        assert!(priority_rank("medium") < priority_rank("low"));
        assert!(priority_rank("low") < priority_rank("unknown"));
    }

    #[test]
    fn priority_rank_known_values() {
        assert_eq!(priority_rank("high"), 0);
        assert_eq!(priority_rank("medium"), 1);
        assert_eq!(priority_rank("low"), 2);
        assert_eq!(priority_rank("bogus"), 3);
    }

    // ── result_status_rank ────────────────────────────────────────────────────

    #[test]
    fn result_status_rank_ordering() {
        assert!(result_status_rank("failed") < result_status_rank("never"));
        assert!(result_status_rank("never") < result_status_rank("blocked"));
        assert!(result_status_rank("blocked") < result_status_rank("skipped"));
        assert!(result_status_rank("skipped") < result_status_rank("passed"));
        assert!(result_status_rank("passed") < result_status_rank("unknown"));
    }

    #[test]
    fn result_status_rank_known_values() {
        assert_eq!(result_status_rank("failed"), 0);
        assert_eq!(result_status_rank("never"), 1);
        assert_eq!(result_status_rank("blocked"), 2);
        assert_eq!(result_status_rank("skipped"), 3);
        assert_eq!(result_status_rank("passed"), 4);
        assert_eq!(result_status_rank("bogus"), 5);
    }

    // ── conversion helpers ────────────────────────────────────────────────────

    #[test]
    fn case_to_pb_maps_all_fields() {
        let c = repo::LoadedCase {
            case_path: "auth/login".to_owned(),
            title: "Login".to_owned(),
            description: "desc".to_owned(),
            tags: vec!["smoke".to_owned()],
            priority: "high".to_owned(),
            body: "## Steps".to_owned(),
            created_at: "2026-01-01".to_owned(),
            updated_at: "2026-01-02".to_owned(),
        };
        let pb = case_to_pb(&c);
        assert_eq!(pb.path, "auth/login");
        assert_eq!(pb.title, "Login");
        assert_eq!(pb.description, "desc");
        assert_eq!(pb.tags, vec!["smoke"]);
        assert_eq!(pb.priority, "high");
        assert_eq!(pb.created_at, "2026-01-01");
        assert_eq!(pb.updated_at, "2026-01-02");
    }

    #[test]
    fn run_meta_to_pb_maps_all_fields() {
        let r = repo::RunRow {
            run_id: "2026-01-01-smoke".to_owned(),
            date: "2026-01-01".to_owned(),
            tester: "alice".to_owned(),
            status: "in-progress".to_owned(),
            environment: Some("staging".to_owned()),
            suite: Some("smoke".to_owned()),
            commit_sha: "abc123".to_owned(),
        };
        let pb = run_meta_to_pb(&r);
        assert_eq!(pb.id, "2026-01-01-smoke");
        assert_eq!(pb.tester, "alice");
        assert_eq!(pb.status, pb::RunStatus::InProgress as i32);
        assert_eq!(pb.environment, "staging");
        assert_eq!(pb.suite, "smoke");
        assert_eq!(pb.commit_sha, "abc123");
    }

    #[test]
    fn run_meta_to_pb_none_fields_default_to_empty_string() {
        let r = repo::RunRow {
            run_id: "r1".to_owned(),
            date: "2026-01-01".to_owned(),
            tester: "bob".to_owned(),
            status: "completed".to_owned(),
            environment: None,
            suite: None,
            commit_sha: String::new(),
        };
        let pb = run_meta_to_pb(&r);
        assert_eq!(pb.environment, "");
        assert_eq!(pb.suite, "");
        assert_eq!(pb.commit_sha, "");
    }

    #[test]
    fn result_to_pb_maps_all_fields() {
        let r = repo::LoadedResult {
            case_path: "auth/login".to_owned(),
            status: "passed".to_owned(),
            notes: "all good".to_owned(),
        };
        let pb = result_to_pb(&r);
        assert_eq!(pb.case_path, "auth/login");
        assert_eq!(pb.status, pb::ResultStatus::Passed as i32);
        assert_eq!(pb.notes, "all good");
    }

    #[test]
    fn suite_to_pb_maps_all_fields() {
        let s = repo::SuiteRow {
            slug: "core".to_owned(),
            name: "Core Suite".to_owned(),
            description: Some("desc".to_owned()),
            cases: vec!["auth/login".to_owned()],
        };
        let pb = suite_to_pb(&s);
        assert_eq!(pb.slug, "core");
        assert_eq!(pb.name, "Core Suite");
        assert_eq!(pb.description, "desc");
        assert_eq!(pb.cases, vec!["auth/login"]);
    }

    #[test]
    fn suite_to_pb_none_description_defaults_to_empty_string() {
        let s = repo::SuiteRow {
            slug: "s".to_owned(),
            name: "S".to_owned(),
            description: None,
            cases: vec![],
        };
        let pb = suite_to_pb(&s);
        assert_eq!(pb.description, "");
    }

    #[test]
    fn stored_to_pb_maps_all_fields() {
        let r = crate::repos_store::StoredRepo {
            id: "owner/repo".to_owned(),
            name: "repo".to_owned(),
            full_name: "owner/repo".to_owned(),
            html_url: "https://github.com/owner/repo".to_owned(),
            installation_id: "inst-1".to_owned(),
            added_at: "2026-01-01".to_owned(),
        };
        let pb = stored_to_pb(&r);
        assert_eq!(pb.id, "owner/repo");
        assert_eq!(pb.name, "repo");
        assert_eq!(pb.full_name, "owner/repo");
        assert_eq!(pb.html_url, "https://github.com/owner/repo");
        assert_eq!(pb.installation_id, "inst-1");
        assert_eq!(pb.added_at, "2026-01-01");
    }

    // ── text_references_case ──────────────────────────────────────────────────

    #[test]
    fn text_references_case_exact_match() {
        assert!(text_references_case("cases/auth/login.md", "auth/login"));
    }

    #[test]
    fn text_references_case_no_false_positive_suffix() {
        assert!(!text_references_case(
            "cases/auth/login-mobile.md",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_commit_message_match() {
        assert!(text_references_case("fix auth/login flow", "auth/login"));
    }

    #[test]
    fn text_references_case_no_false_positive_in_commit() {
        assert!(!text_references_case("fix auth/login flow", "auth/log"));
    }

    #[test]
    fn text_references_case_start_of_string() {
        assert!(text_references_case("auth/login.ts", "auth/login"));
    }

    #[test]
    fn text_references_case_subdirectory() {
        assert!(text_references_case("src/auth/login/form.ts", "auth/login"));
    }

    #[test]
    fn text_references_case_no_match() {
        assert!(!text_references_case("src/auth/signup.md", "auth/login"));
    }

    #[test]
    fn text_references_case_trailing_slash_in_path() {
        assert!(text_references_case(
            "cases/auth/login/step1.md",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_in_parentheses() {
        assert!(text_references_case(
            "fix (auth/login) redirect",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_in_quotes() {
        assert!(text_references_case(
            "see 'auth/login' for details",
            "auth/login"
        ));
        assert!(text_references_case(
            r#"see "auth/login" for details"#,
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_no_match_prefix_only() {
        // "auth/login" is a prefix of "auth/login-flow" — should NOT match
        assert!(!text_references_case(
            "src/auth/login-flow.ts",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_newline_boundary() {
        assert!(text_references_case("fix\nauth/login\ndone", "auth/login"));
    }

    #[test]
    fn text_references_case_tab_prefix() {
        assert!(text_references_case("\tauth/login", "auth/login"));
    }

    #[test]
    fn text_references_case_tab_suffix() {
        assert!(text_references_case("auth/login\tnotes", "auth/login"));
    }

    #[test]
    fn text_references_case_paren_suffix() {
        // ends_cleanly allows ')' — path followed by closing paren
        assert!(text_references_case(
            "see (auth/login) for more",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_starts_with_path_dirty_suffix_no_match() {
        // text begins directly with case_path but is followed by '-' which is not a clean boundary
        assert!(!text_references_case("auth/login-mobile", "auth/login"));
    }

    #[test]
    fn text_references_case_double_quote_prefix() {
        // '"' is in the prefix list — path led by a literal double-quote should match
        assert!(text_references_case(
            "\"auth/login\" is a case",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_second_occurrence_with_clean_boundary_matches() {
        // First '/'-prefixed occurrence has a dirty suffix (-mobile); the second is clean.
        // The loop must check all occurrences, not just the first one found.
        assert!(text_references_case(
            "/auth/login-mobile\n/auth/login",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_dot_suffix() {
        // '.' is a clean boundary — path followed by a file extension counts as a reference.
        assert!(text_references_case("update auth/login.md", "auth/login"));
        assert!(text_references_case("/auth/login.rs changed", "auth/login"));
    }

    #[test]
    fn text_references_case_exact_match_start_of_string_empty_suffix() {
        // text IS exactly the case_path — empty suffix satisfies ends_cleanly via is_empty().
        assert!(text_references_case("auth/login", "auth/login"));
    }

    #[test]
    fn text_references_case_starts_with_path_space_suffix() {
        // starts_with branch: path at position 0, clean boundary via ' '.
        assert!(text_references_case("auth/login is fixed", "auth/login"));
    }

    #[test]
    fn is_doc_file_no_extension_not_doc() {
        assert!(!is_doc_file("Makefile"));
        assert!(!is_doc_file("README"));
    }

    #[test]
    fn is_doc_file_toml_not_doc() {
        // .toml is NOT in doc_exts, so it counts as a source file for source_changed logic.
        assert!(!is_doc_file("Cargo.toml"));
        assert!(!is_doc_file("config/settings.toml"));
    }

    // ── is_doc_file ───────────────────────────────────────────────────────────

    #[test]
    fn is_doc_file_markdown() {
        assert!(is_doc_file("cases/auth/login.md"));
    }

    #[test]
    fn is_doc_file_yaml() {
        assert!(is_doc_file("config/suite.yaml"));
        assert!(is_doc_file("config/suite.yml"));
    }

    #[test]
    fn is_doc_file_txt() {
        assert!(is_doc_file("notes.txt"));
    }

    #[test]
    fn is_doc_file_gitignore_dotfile() {
        // Path::extension() returns None for .gitignore, so we check by filename
        assert!(is_doc_file(".gitignore"));
        assert!(is_doc_file("subdir/.gitignore"));
    }

    #[test]
    fn is_doc_file_gitattributes_dotfile() {
        assert!(is_doc_file(".gitattributes"));
        assert!(is_doc_file("subdir/.gitattributes"));
    }

    #[test]
    fn is_doc_file_source_files_not_doc() {
        assert!(!is_doc_file("src/auth.rs"));
        assert!(!is_doc_file("src/main.ts"));
        assert!(!is_doc_file("app.py"));
    }

    #[test]
    fn text_references_case_single_quote_prefix() {
        // '\'' is in the prefix list — path led by a single-quote should match
        assert!(text_references_case(
            "'auth/login' was tested",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_single_quote_suffix() {
        // '\'' in ends_cleanly — path at start of text followed by single-quote
        assert!(text_references_case("auth/login'", "auth/login"));
    }

    #[test]
    fn text_references_case_open_paren_prefix() {
        // '(' is in the prefix list — path inside parens should match when suffix is clean
        assert!(text_references_case(
            "see (auth/login) for details",
            "auth/login"
        ));
    }

    #[test]
    fn text_references_case_newline_suffix_via_starts_with() {
        // ends_cleanly '\n' branch via the starts_with path (path at start of text, \n suffix)
        assert!(text_references_case("auth/login\nmore text", "auth/login"));
    }

    #[test]
    fn text_references_case_double_quote_suffix_via_starts_with() {
        // ends_cleanly '"' branch via the starts_with path (path at start of text, " suffix)
        assert!(text_references_case("auth/login\" extra", "auth/login"));
    }

    #[test]
    fn text_references_case_slash_suffix_via_starts_with() {
        // ends_cleanly '/' branch via the starts_with path (path at start of text, / suffix)
        assert!(text_references_case("auth/login/nested", "auth/login"));
    }

    #[test]
    fn text_references_case_close_paren_suffix_via_starts_with() {
        // ends_cleanly ')' branch via the starts_with path (path at start of text, ) suffix)
        // Distinct from paren_suffix which hits ')' via the '(' prefix loop path.
        assert!(text_references_case("auth/login) and more", "auth/login"));
    }

    #[test]
    fn text_references_case_dot_suffix_via_starts_with() {
        // ends_cleanly '.' branch via the starts_with path (path at start of text, . suffix)
        // Distinct from dot_suffix which hits '.' via the ' ' and '/' prefix loop paths.
        assert!(text_references_case("auth/login.md", "auth/login"));
    }

    #[tokio::test]
    async fn bulk_record_results_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn bulk_record_results_rejects_empty_run_id() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    #[tokio::test]
    async fn bulk_record_results_rejects_empty_results_list() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("results must not be empty"));
    }

    #[tokio::test]
    async fn bulk_record_results_rejects_entry_with_empty_case_path() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("case_path"));
    }

    #[tokio::test]
    async fn bulk_record_results_rejects_invalid_status() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: 999,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("status must be one of"));
    }

    #[tokio::test]
    async fn bulk_record_results_rejects_failed_without_notes() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Failed as i32,
                    notes: "".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("notes are required"));
    }

    #[tokio::test]
    async fn bulk_record_results_rejects_blocked_without_notes() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Blocked as i32,
                    notes: "   ".to_owned(),
                }],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("notes are required"));
    }

    #[tokio::test]
    async fn bulk_record_results_valid_passes_validation_and_hits_db() {
        let s = server();
        let err = s
            .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                results: vec![
                    pb::BulkResultEntry {
                        case_path: "auth/login".to_owned(),
                        status: pb::ResultStatus::Passed as i32,
                        notes: "".to_owned(),
                    },
                    pb::BulkResultEntry {
                        case_path: "auth/logout".to_owned(),
                        status: pb::ResultStatus::Failed as i32,
                        notes: "Button missing".to_owned(),
                    },
                ],
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn update_run_rejects_empty_repo_id() {
        let s = server();
        let err = s
            .update_run(Request::new(pb::UpdateRunRequest {
                repo_id: "".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                new_slug: "smoke-v2".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("repo_id is required"));
    }

    #[tokio::test]
    async fn update_run_rejects_empty_run_id() {
        let s = server();
        let err = s
            .update_run(Request::new(pb::UpdateRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "".to_owned(),
                new_slug: "smoke-v2".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("run_id is required"));
    }

    #[tokio::test]
    async fn update_run_rejects_empty_new_slug() {
        let s = server();
        let err = s
            .update_run(Request::new(pb::UpdateRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                new_slug: "".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(err.message().contains("new_slug is required"));
    }

    #[tokio::test]
    async fn update_run_passes_validation_and_hits_db() {
        let s = server();
        let err = s
            .update_run(Request::new(pb::UpdateRunRequest {
                repo_id: "owner/repo".to_owned(),
                run_id: "2026-01-01-smoke".to_owned(),
                new_slug: "smoke-v2".to_owned(),
            }))
            .await
            .unwrap_err();
        assert_ne!(err.code(), tonic::Code::InvalidArgument);
    }
}
