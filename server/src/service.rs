use sqlx::PgPool;
use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1::{self as pb, ameliso_service_server::AmelisoService};
use crate::repo::{self, RepoError};

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
                        suite.cases.iter().map(|p| p.as_str()).collect();
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
        if req.case_path.is_empty() {
            return Err(invalid("case_path is required"));
        }
        if req.title.is_empty() {
            return Err(invalid("title is required"));
        }
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
            req.tags,
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

    async fn update_case(
        &self,
        request: Request<pb::UpdateCaseRequest>,
    ) -> Result<Response<pb::UpdateCaseResponse>, Status> {
        let req = request.into_inner();
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
            Some(req.tags)
        };
        let body = if req.body.is_empty() {
            None
        } else {
            Some(req.body.as_str())
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

    async fn delete_case(
        &self,
        request: Request<pb::DeleteCaseRequest>,
    ) -> Result<Response<pb::DeleteCaseResponse>, Status> {
        let req = request.into_inner();
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
                        "warning: github delete sync failed for {}/{}: {e}",
                        repo_id, case_path_clone
                    );
                }
            });
        }
        Ok(Response::new(pb::DeleteCaseResponse {
            file_path: format!("cases/{}.md", req.case_path),
        }))
    }

    async fn list_suites(
        &self,
        request: Request<pb::ListSuitesRequest>,
    ) -> Result<Response<pb::ListSuitesResponse>, Status> {
        let req = request.into_inner();
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
        let cases = if req.cases.is_empty() {
            None
        } else {
            Some(req.cases)
        };
        let suite = repo::update_suite(
            &self.pool,
            &req.repo_id,
            &req.slug,
            name,
            description,
            cases,
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
        if req.slug.is_empty() {
            return Err(invalid("slug is required"));
        }
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
        let meta = repo::create_run(&self.pool, &req.repo_id, &req.slug, &tester, env, suite)
            .await
            .map_err(repo_err)?;
        let dir_path = format!("runs/{}", meta.run_id);
        Ok(Response::new(pb::CreateRunResponse {
            run: Some(run_meta_to_pb(&meta)),
            dir_path,
        }))
    }

    async fn record_result(
        &self,
        request: Request<pb::RecordResultRequest>,
    ) -> Result<Response<pb::RecordResultResponse>, Status> {
        let req = request.into_inner();
        let status = result_status_from_i32(req.status);
        if status == "unspecified" {
            return Err(invalid("status is required"));
        }
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
        Ok(Response::new(pb::RecordResultResponse {
            result: Some(result_to_pb(&result)),
        }))
    }

    async fn finalize_run(
        &self,
        request: Request<pb::FinalizeRunRequest>,
    ) -> Result<Response<pb::FinalizeRunResponse>, Status> {
        let req = request.into_inner();
        let status = run_status_from_i32(req.status);
        if status == "unspecified" {
            return Err(invalid("status must be completed or aborted"));
        }
        let meta = repo::finalize_run(&self.pool, &req.repo_id, &req.run_id, status)
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
        if req.run_id.is_empty() {
            return Err(invalid("run_id is required"));
        }
        let dir_path = format!("runs/{}", req.run_id);
        repo::delete_run(&self.pool, &req.repo_id, &req.run_id)
            .await
            .map_err(repo_err)?;
        Ok(Response::new(pb::DeleteRunResponse { dir_path }))
    }

    async fn get_pending_cases(
        &self,
        request: Request<pb::GetPendingCasesRequest>,
    ) -> Result<Response<pb::GetPendingCasesResponse>, Status> {
        let req = request.into_inner();
        let (pending, total) = repo::get_pending_cases(&self.pool, &req.repo_id, &req.run_id)
            .await
            .map_err(repo_err)?;
        Ok(Response::new(pb::GetPendingCasesResponse {
            cases: pending.iter().map(case_to_pb).collect(),
            total_in_scope: total as i32,
        }))
    }

    async fn get_coverage_report(
        &self,
        request: Request<pb::GetCoverageReportRequest>,
    ) -> Result<Response<pb::GetCoverageReportResponse>, Status> {
        let req = request.into_inner();
        let status_filter = req.status_filter;
        let (entries, run_count) = repo::get_coverage_report(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;

        let pb_entries = entries
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
                };
                Some(pb::CoverageEntry {
                    case: Some(case),
                    latest_status: status_i32,
                    last_run_id: row.last_run_id,
                    last_run_date: row.last_run_date,
                })
            })
            .collect();

        Ok(Response::new(pb::GetCoverageReportResponse {
            entries: pb_entries,
            run_count: run_count as i32,
        }))
    }

    async fn get_affected_cases(
        &self,
        request: Request<pb::GetAffectedCasesRequest>,
    ) -> Result<Response<pb::GetAffectedCasesResponse>, Status> {
        let req = request.into_inner();

        let cases = repo::list_cases(&self.pool, &req.repo_id)
            .await
            .map_err(repo_err)?;

        if req.since_ref.is_empty() {
            let affected = cases
                .iter()
                .map(|c| pb::AffectedCase {
                    case: Some(case_to_pb(c)),
                    reason: "no since_ref provided; all cases flagged".to_owned(),
                })
                .collect();
            return Ok(Response::new(pb::GetAffectedCasesResponse {
                cases: affected,
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
        let mut reasons: Vec<String> = Vec::new();

        let all_text = compare.commit_messages.join("\n");
        for path in &known_paths {
            if all_text.contains(path.as_str()) {
                reasons.push(format!("commit messages reference: {}", path));
                if !affected.contains(path) {
                    affected.push(path.clone());
                }
            }
        }

        for file in &compare.changed_files {
            for path in &known_paths {
                if file.contains(path.as_str()) {
                    reasons.push(format!("file {} references {}", file, path));
                    if !affected.contains(path) {
                        affected.push(path.clone());
                    }
                }
            }
        }

        let doc_exts = [".md", ".txt", ".gitignore", ".yaml", ".yml"];
        let source_changed: Vec<&str> = compare
            .changed_files
            .iter()
            .filter(|f| {
                let ext = std::path::Path::new(f)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| format!(".{e}"))
                    .unwrap_or_default();
                !doc_exts.contains(&ext.as_str())
            })
            .map(|f| f.as_str())
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

        affected.sort_by_key(|p| {
            case_map
                .get(p.as_str())
                .map(|c| priority_rank(&c.priority))
                .unwrap_or(3)
        });

        let pb_cases = affected
            .iter()
            .map(|path| pb::AffectedCase {
                case: case_map.get(path.as_str()).map(|c| case_to_pb(c)),
                reason: reason.clone(),
            })
            .collect();

        Ok(Response::new(pb::GetAffectedCasesResponse {
            cases: pb_cases,
            reason,
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
        };
        let pb = run_meta_to_pb(&r);
        assert_eq!(pb.id, "2026-01-01-smoke");
        assert_eq!(pb.tester, "alice");
        assert_eq!(pb.status, pb::RunStatus::InProgress as i32);
        assert_eq!(pb.environment, "staging");
        assert_eq!(pb.suite, "smoke");
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
        };
        let pb = run_meta_to_pb(&r);
        assert_eq!(pb.environment, "");
        assert_eq!(pb.suite, "");
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
}
