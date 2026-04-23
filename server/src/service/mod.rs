use sqlx::PgPool;
use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1::{self as pb, ameliso_service_server::AmelisoService};
use crate::repo::{self, RepoError};

mod bulk_create_cases;
mod bulk_delete_cases;
mod bulk_record_results;
mod bulk_update_cases;
mod create_case;
mod create_run;
mod create_suite;
#[cfg(test)]
mod create_suite_test;
mod delete_case;
mod delete_run;
mod delete_suite;
mod finalize_run;
mod get_affected_cases;
mod get_case;
mod get_coverage_report;
mod get_pending_cases;
mod get_repo_status;
mod get_run;
mod get_suite;
mod handle_git_hub_callback;
mod list_cases;
mod list_runs;
mod list_suites;
mod record_result;
mod remove_repository;
mod sync_repository;
mod update_case;
mod update_run;
mod update_suite;

/// Returns true when `text` contains `case_path` as whole path segments.
/// Prevents `auth/log` from matching inside `auth/login`.
pub(super) fn text_references_case(text: &str, case_path: &str) -> bool {
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
pub(super) fn is_doc_file(path: &str) -> bool {
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

pub(super) fn repo_err(e: RepoError) -> Status {
    match e {
        RepoError::NotFound(msg) => Status::not_found(msg),
        RepoError::AlreadyExists(msg) => Status::already_exists(msg),
        RepoError::ClosedRun(msg) => Status::failed_precondition(msg),
        RepoError::InvalidArg(msg) => Status::invalid_argument(msg),
        RepoError::Other(e) => Status::internal(e.to_string()),
    }
}

pub(super) fn invalid(msg: impl Into<String>) -> Status {
    Status::invalid_argument(msg.into())
}

pub(super) fn clean_tags(tags: Vec<String>) -> Vec<String> {
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
pub(super) fn check_max_len(field: &str, value: &str, max: usize) -> Result<(), Status> {
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

pub(super) fn case_to_pb(c: &repo::LoadedCase) -> pb::Case {
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

pub(super) fn run_meta_to_pb(r: &repo::RunRow) -> pb::RunMeta {
    run_meta_with_counts_to_pb(r, 0, 0, 0, 0, 0)
}

pub(super) fn run_meta_with_counts_to_pb(
    r: &repo::RunRow,
    passed: i32,
    failed: i32,
    blocked: i32,
    skipped: i32,
    total: i32,
) -> pb::RunMeta {
    pb::RunMeta {
        id: r.run_id.clone(),
        date: r.date.clone(),
        tester: r.tester.clone(),
        status: run_status_to_i32(&r.status),
        environment: r.environment.clone().unwrap_or_default(),
        suite: r.suite.clone().unwrap_or_default(),
        commit_sha: r.commit_sha.clone(),
        passed,
        failed,
        blocked,
        skipped,
        total,
    }
}

pub(super) fn result_to_pb(r: &repo::LoadedResult) -> pb::CaseResult {
    pb::CaseResult {
        case_path: r.case_path.clone(),
        status: result_status_to_i32(&r.status),
        notes: r.notes.clone(),
    }
}

pub(super) fn suite_to_pb(s: &repo::SuiteRow) -> pb::Suite {
    pb::Suite {
        slug: s.slug.clone(),
        name: s.name.clone(),
        description: s.description.clone().unwrap_or_default(),
        cases: s.cases.clone(),
    }
}

/// Return source files (non-doc) from `files` that no known case path covers.
pub(super) fn find_uncovered_files<'a>(
    files: &'a [String],
    known_paths: &[String],
) -> Vec<&'a str> {
    files
        .iter()
        .filter(|f| !is_doc_file(f))
        .filter(|f| !known_paths.iter().any(|p| text_references_case(f, p)))
        .map(String::as_str)
        .collect()
}

/// Build a `PendingEntry` list from pending cases + latest status map.
pub(super) fn build_pending_entries(
    pending_cases: &[repo::LoadedCase],
    statuses: &std::collections::HashMap<String, String>,
) -> Vec<pb::PendingEntry> {
    pending_cases
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
        .collect()
}

pub(super) fn stored_to_pb(r: &crate::repos_store::StoredRepo) -> pb::Repository {
    pb::Repository {
        id: r.id.clone(),
        name: r.name.clone(),
        full_name: r.full_name.clone(),
        html_url: r.html_url.clone(),
        installation_id: r.installation_id.clone(),
        added_at: r.added_at.clone(),
    }
}

pub(super) fn run_status_to_i32(s: &str) -> i32 {
    match s {
        "in-progress" => pb::RunStatus::InProgress as i32,
        "completed" => pb::RunStatus::Completed as i32,
        "aborted" => pb::RunStatus::Aborted as i32,
        _ => pb::RunStatus::Unspecified as i32,
    }
}

pub(super) fn result_status_to_i32(s: &str) -> i32 {
    match s {
        "passed" => pb::ResultStatus::Passed as i32,
        "failed" => pb::ResultStatus::Failed as i32,
        "blocked" => pb::ResultStatus::Blocked as i32,
        "skipped" => pb::ResultStatus::Skipped as i32,
        "never" => pb::ResultStatus::Never as i32,
        _ => pb::ResultStatus::Unspecified as i32,
    }
}

pub(super) fn result_status_from_i32(n: i32) -> &'static str {
    match pb::ResultStatus::try_from(n).unwrap_or(pb::ResultStatus::Unspecified) {
        pb::ResultStatus::Passed => "passed",
        pb::ResultStatus::Failed => "failed",
        pb::ResultStatus::Blocked => "blocked",
        pb::ResultStatus::Skipped => "skipped",
        pb::ResultStatus::Never => "never",
        pb::ResultStatus::Unspecified => "unspecified",
    }
}

pub(super) fn run_status_from_i32(n: i32) -> &'static str {
    match pb::RunStatus::try_from(n).unwrap_or(pb::RunStatus::Unspecified) {
        pb::RunStatus::InProgress => "in-progress",
        pb::RunStatus::Completed => "completed",
        pb::RunStatus::Aborted => "aborted",
        pb::RunStatus::Unspecified => "unspecified",
    }
}

pub(super) fn priority_from_i32(n: i32) -> Option<&'static str> {
    match pb::Priority::try_from(n).unwrap_or(pb::Priority::Unspecified) {
        pb::Priority::Low => Some("low"),
        pb::Priority::Medium => Some("medium"),
        pb::Priority::High => Some("high"),
        pb::Priority::Unspecified => None,
    }
}

pub(super) fn priority_rank(p: &str) -> u8 {
    match p {
        "high" => 0,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    }
}

pub(super) fn result_status_rank(s: &str) -> u8 {
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
/// Returns `(affected_case_paths, changed_files)`.
/// `changed_files` is empty when there is no diff scope (all cases included).
pub(super) async fn resolve_affected_case_paths(
    pool: &PgPool,
    repo_id: &str,
    since_ref: &str,
    changed_files: &[String],
) -> Result<(Vec<String>, Vec<String>), Status> {
    let cases = repo::list_cases(pool, repo_id).await.map_err(repo_err)?;
    let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();

    if since_ref.is_empty() && changed_files.is_empty() {
        return Ok((known_paths, vec![]));
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
            return Ok((known_paths, changed_files.to_vec()));
        }
        return Ok((affected_set.into_iter().collect(), changed_files.to_vec()));
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
        affected = known_paths.clone();
    }
    Ok((affected, compare.changed_files))
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
        list_cases::handle(self, request).await
    }

    async fn get_case(
        &self,
        request: Request<pb::GetCaseRequest>,
    ) -> Result<Response<pb::GetCaseResponse>, Status> {
        get_case::handle(self, request).await
    }

    async fn create_case(
        &self,
        request: Request<pb::CreateCaseRequest>,
    ) -> Result<Response<pb::CreateCaseResponse>, Status> {
        create_case::handle(self, request).await
    }

    async fn bulk_create_cases(
        &self,
        request: Request<pb::BulkCreateCasesRequest>,
    ) -> Result<Response<pb::BulkCreateCasesResponse>, Status> {
        bulk_create_cases::handle(self, request).await
    }

    async fn update_case(
        &self,
        request: Request<pb::UpdateCaseRequest>,
    ) -> Result<Response<pb::UpdateCaseResponse>, Status> {
        update_case::handle(self, request).await
    }

    async fn bulk_update_cases(
        &self,
        request: Request<pb::BulkUpdateCasesRequest>,
    ) -> Result<Response<pb::BulkUpdateCasesResponse>, Status> {
        bulk_update_cases::handle(self, request).await
    }

    async fn delete_case(
        &self,
        request: Request<pb::DeleteCaseRequest>,
    ) -> Result<Response<pb::DeleteCaseResponse>, Status> {
        delete_case::handle(self, request).await
    }

    async fn bulk_delete_cases(
        &self,
        request: Request<pb::BulkDeleteCasesRequest>,
    ) -> Result<Response<pb::BulkDeleteCasesResponse>, Status> {
        bulk_delete_cases::handle(self, request).await
    }

    async fn list_suites(
        &self,
        request: Request<pb::ListSuitesRequest>,
    ) -> Result<Response<pb::ListSuitesResponse>, Status> {
        list_suites::handle(self, request).await
    }

    async fn get_suite(
        &self,
        request: Request<pb::GetSuiteRequest>,
    ) -> Result<Response<pb::GetSuiteResponse>, Status> {
        get_suite::handle(self, request).await
    }

    async fn create_suite(
        &self,
        request: Request<pb::CreateSuiteRequest>,
    ) -> Result<Response<pb::CreateSuiteResponse>, Status> {
        create_suite::handle(self, request).await
    }

    async fn update_suite(
        &self,
        request: Request<pb::UpdateSuiteRequest>,
    ) -> Result<Response<pb::UpdateSuiteResponse>, Status> {
        update_suite::handle(self, request).await
    }

    async fn delete_suite(
        &self,
        request: Request<pb::DeleteSuiteRequest>,
    ) -> Result<Response<pb::DeleteSuiteResponse>, Status> {
        delete_suite::handle(self, request).await
    }

    async fn list_runs(
        &self,
        request: Request<pb::ListRunsRequest>,
    ) -> Result<Response<pb::ListRunsResponse>, Status> {
        list_runs::handle(self, request).await
    }

    async fn get_run(
        &self,
        request: Request<pb::GetRunRequest>,
    ) -> Result<Response<pb::GetRunResponse>, Status> {
        get_run::handle(self, request).await
    }

    async fn create_run(
        &self,
        request: Request<pb::CreateRunRequest>,
    ) -> Result<Response<pb::CreateRunResponse>, Status> {
        create_run::handle(self, request).await
    }

    async fn record_result(
        &self,
        request: Request<pb::RecordResultRequest>,
    ) -> Result<Response<pb::RecordResultResponse>, Status> {
        record_result::handle(self, request).await
    }

    async fn bulk_record_results(
        &self,
        request: Request<pb::BulkRecordResultsRequest>,
    ) -> Result<Response<pb::BulkRecordResultsResponse>, Status> {
        bulk_record_results::handle(self, request).await
    }

    async fn finalize_run(
        &self,
        request: Request<pb::FinalizeRunRequest>,
    ) -> Result<Response<pb::FinalizeRunResponse>, Status> {
        finalize_run::handle(self, request).await
    }

    async fn delete_run(
        &self,
        request: Request<pb::DeleteRunRequest>,
    ) -> Result<Response<pb::DeleteRunResponse>, Status> {
        delete_run::handle(self, request).await
    }

    async fn update_run(
        &self,
        request: Request<pb::UpdateRunRequest>,
    ) -> Result<Response<pb::UpdateRunResponse>, Status> {
        update_run::handle(self, request).await
    }

    async fn get_pending_cases(
        &self,
        request: Request<pb::GetPendingCasesRequest>,
    ) -> Result<Response<pb::GetPendingCasesResponse>, Status> {
        get_pending_cases::handle(self, request).await
    }

    async fn get_coverage_report(
        &self,
        request: Request<pb::GetCoverageReportRequest>,
    ) -> Result<Response<pb::GetCoverageReportResponse>, Status> {
        get_coverage_report::handle(self, request).await
    }

    async fn get_affected_cases(
        &self,
        request: Request<pb::GetAffectedCasesRequest>,
    ) -> Result<Response<pb::GetAffectedCasesResponse>, Status> {
        get_affected_cases::handle(self, request).await
    }

    async fn get_repo_status(
        &self,
        request: Request<pb::GetRepoStatusRequest>,
    ) -> Result<Response<pb::GetRepoStatusResponse>, Status> {
        get_repo_status::handle(self, request).await
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
        handle_git_hub_callback::handle(self, request).await
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
        sync_repository::handle(self, request).await
    }

    async fn remove_repository(
        &self,
        request: Request<pb::RemoveRepositoryRequest>,
    ) -> Result<Response<pb::RemoveRepositoryResponse>, Status> {
        remove_repository::handle(self, request).await
    }
}

#[cfg(test)]
mod bulk_create_cases_test;
#[cfg(test)]
mod bulk_delete_cases_test;
#[cfg(test)]
mod bulk_record_results_test;
#[cfg(test)]
mod bulk_update_cases_test;
#[cfg(test)]
mod create_case_test;
#[cfg(test)]
mod create_run_test;
#[cfg(test)]
mod delete_case_test;
#[cfg(test)]
mod delete_run_test;
#[cfg(test)]
mod delete_suite_test;
#[cfg(test)]
mod finalize_run_test;
#[cfg(test)]
mod get_affected_cases_test;
#[cfg(test)]
mod get_case_test;
#[cfg(test)]
mod get_coverage_report_test;
#[cfg(test)]
mod get_git_hub_install_url_test;
#[cfg(test)]
mod get_pending_cases_test;
#[cfg(test)]
mod get_repo_status_test;
#[cfg(test)]
mod get_run_test;
#[cfg(test)]
mod get_suite_test;
#[cfg(test)]
mod handle_git_hub_callback_test;
#[cfg(test)]
mod helpers_test;
#[cfg(test)]
mod list_cases_test;
#[cfg(test)]
mod list_repositories_test;
#[cfg(test)]
mod list_runs_test;
#[cfg(test)]
mod list_suites_test;
#[cfg(test)]
mod record_result_test;
#[cfg(test)]
mod remove_repository_test;
#[cfg(test)]
mod sync_repository_test;
#[cfg(test)]
mod update_case_test;
#[cfg(test)]
mod update_run_test;
#[cfg(test)]
mod update_suite_test;
