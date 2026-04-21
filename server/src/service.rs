use std::path::PathBuf;

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
// Conversions between repo types and proto types
// ---------------------------------------------------------------------------

fn case_to_pb(c: &repo::LoadedCase) -> pb::Case {
    pb::Case {
        path: c.case_path.clone(),
        title: c.fm.title.clone(),
        description: c.fm.description.clone(),
        tags: c.fm.tags.clone(),
        priority: c.fm.priority.clone(),
        created_at: c.fm.created_at.clone(),
        updated_at: c.fm.updated_at.clone(),
    }
}

fn run_meta_to_pb(r: &repo::RunYaml) -> pb::RunMeta {
    pb::RunMeta {
        id: r.id.clone(),
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
        status: result_status_to_i32(&r.fm.status),
        notes: r.notes.clone(),
    }
}

fn suite_to_pb(slug: &str, s: &repo::SuiteYaml) -> pb::Suite {
    pb::Suite {
        slug: slug.to_owned(),
        name: s.name.clone(),
        description: s.description.clone().unwrap_or_default(),
        cases: s.cases.clone(),
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

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

pub struct AmelisoServer;

#[tonic::async_trait]
impl AmelisoService for AmelisoServer {
    async fn list_cases(
        &self,
        request: Request<pb::ListCasesRequest>,
    ) -> Result<Response<pb::ListCasesResponse>, Status> {
        let req = request.into_inner();
        let repo = PathBuf::from(&req.repo_path);
        let mut cases = repo::list_cases(&repo).map_err(repo_err)?;

        if !req.tags.is_empty() {
            cases.retain(|c| {
                req.tags
                    .iter()
                    .all(|t| c.fm.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
            });
        }
        if let Some(pri) = priority_from_i32(req.priority) {
            cases.retain(|c| c.fm.priority.eq_ignore_ascii_case(pri));
        }
        if !req.query.is_empty() {
            let q = req.query.to_lowercase();
            cases.retain(|c| {
                c.fm.title.to_lowercase().contains(&q)
                    || c.fm.description.to_lowercase().contains(&q)
                    || c.body.to_lowercase().contains(&q)
                    || c.case_path.to_lowercase().contains(&q)
            });
        }

        let pb_cases = cases.iter().map(case_to_pb).collect();
        Ok(Response::new(pb::ListCasesResponse { cases: pb_cases }))
    }

    async fn get_case(
        &self,
        request: Request<pb::GetCaseRequest>,
    ) -> Result<Response<pb::GetCaseResponse>, Status> {
        let req = request.into_inner();
        let repo = PathBuf::from(&req.repo_path);
        let case = repo::get_case(&repo, &req.case_path).map_err(repo_err)?;
        Ok(Response::new(pb::GetCaseResponse {
            case: Some(case_to_pb(&case)),
            body: case.body.clone(),
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
        let repo = PathBuf::from(&req.repo_path);
        let priority = priority_from_i32(req.priority).unwrap_or("medium");
        let body = if req.body.is_empty() {
            None
        } else {
            Some(req.body.as_str())
        };
        let case = repo::create_case(
            &repo,
            &req.case_path,
            &req.title,
            &req.description,
            req.tags,
            priority,
            body,
        )
        .map_err(repo_err)?;
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
        let repo = PathBuf::from(&req.repo_path);
        let priority = priority_from_i32(req.priority).unwrap_or("medium");
        let body = if req.body.is_empty() {
            None
        } else {
            Some(req.body.as_str())
        };
        let case = repo::update_case(
            &repo,
            &req.case_path,
            &req.title,
            &req.description,
            req.tags,
            priority,
            body,
        )
        .map_err(repo_err)?;
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
        let repo = PathBuf::from(&req.repo_path);
        repo::delete_case(&repo, &req.case_path).map_err(repo_err)?;
        Ok(Response::new(pb::DeleteCaseResponse {
            file_path: format!("cases/{}.md", req.case_path),
        }))
    }

    async fn list_suites(
        &self,
        request: Request<pb::ListSuitesRequest>,
    ) -> Result<Response<pb::ListSuitesResponse>, Status> {
        let repo = PathBuf::from(&request.into_inner().repo_path);
        let suites = repo::list_suites(&repo).map_err(repo_err)?;
        let pb_suites = suites
            .iter()
            .map(|(slug, s)| suite_to_pb(slug, s))
            .collect();
        Ok(Response::new(pb::ListSuitesResponse { suites: pb_suites }))
    }

    async fn get_suite(
        &self,
        request: Request<pb::GetSuiteRequest>,
    ) -> Result<Response<pb::GetSuiteResponse>, Status> {
        let req = request.into_inner();
        let repo = PathBuf::from(&req.repo_path);
        let suite = repo::get_suite(&repo, &req.slug).map_err(repo_err)?;
        Ok(Response::new(pb::GetSuiteResponse {
            suite: Some(suite_to_pb(&req.slug, &suite)),
        }))
    }

    async fn create_suite(
        &self,
        request: Request<pb::CreateSuiteRequest>,
    ) -> Result<Response<pb::CreateSuiteResponse>, Status> {
        let req = request.into_inner();
        let repo = PathBuf::from(&req.repo_path);
        let desc = if req.description.is_empty() {
            None
        } else {
            Some(req.description.clone())
        };
        let suite =
            repo::create_suite(&repo, &req.slug, &req.name, desc, req.cases).map_err(repo_err)?;
        let file_path = format!("suites/{}.yaml", req.slug);
        Ok(Response::new(pb::CreateSuiteResponse {
            suite: Some(suite_to_pb(&req.slug, &suite)),
            file_path,
        }))
    }

    async fn update_suite(
        &self,
        request: Request<pb::UpdateSuiteRequest>,
    ) -> Result<Response<pb::UpdateSuiteResponse>, Status> {
        let req = request.into_inner();
        let repo = PathBuf::from(&req.repo_path);
        let desc = if req.description.is_empty() {
            None
        } else {
            Some(req.description.clone())
        };
        let suite =
            repo::update_suite(&repo, &req.slug, &req.name, desc, req.cases).map_err(repo_err)?;
        Ok(Response::new(pb::UpdateSuiteResponse {
            suite: Some(suite_to_pb(&req.slug, &suite)),
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
        let repo = PathBuf::from(&req.repo_path);
        repo::delete_suite(&repo, &req.slug).map_err(repo_err)?;
        Ok(Response::new(pb::DeleteSuiteResponse {
            file_path: format!("suites/{}.yaml", req.slug),
        }))
    }

    async fn list_runs(
        &self,
        request: Request<pb::ListRunsRequest>,
    ) -> Result<Response<pb::ListRunsResponse>, Status> {
        let repo = PathBuf::from(&request.into_inner().repo_path);
        let runs = repo::list_runs(&repo).map_err(repo_err)?;
        let pb_runs = runs.iter().map(run_meta_to_pb).collect();
        Ok(Response::new(pb::ListRunsResponse { runs: pb_runs }))
    }

    async fn get_run(
        &self,
        request: Request<pb::GetRunRequest>,
    ) -> Result<Response<pb::GetRunResponse>, Status> {
        let req = request.into_inner();
        let repo = PathBuf::from(&req.repo_path);
        let run = repo::get_run(&repo, &req.run_id).map_err(repo_err)?;
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
        let repo = PathBuf::from(&req.repo_path);
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
            std::env::var("USER").unwrap_or_else(|_| "unknown".to_owned())
        } else {
            req.tester
        };
        let (meta, dir_path) =
            repo::create_run(&repo, &req.slug, &tester, env, suite).map_err(repo_err)?;
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
        let repo = PathBuf::from(&req.repo_path);
        let status = result_status_from_i32(req.status);
        if status == "unspecified" {
            return Err(invalid("status is required"));
        }
        let result = repo::record_result(&repo, &req.run_id, &req.case_path, status, &req.notes)
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
        let repo = PathBuf::from(&req.repo_path);
        let status = run_status_from_i32(req.status);
        if status == "unspecified" {
            return Err(invalid("status must be completed or aborted"));
        }
        let meta = repo::finalize_run(&repo, &req.run_id, status).map_err(repo_err)?;
        Ok(Response::new(pb::FinalizeRunResponse {
            run: Some(run_meta_to_pb(&meta)),
        }))
    }

    async fn get_coverage_report(
        &self,
        request: Request<pb::GetCoverageReportRequest>,
    ) -> Result<Response<pb::GetCoverageReportResponse>, Status> {
        let repo = PathBuf::from(&request.into_inner().repo_path);
        let cases = repo::list_cases(&repo).map_err(repo_err)?;
        let runs = repo::list_runs(&repo).map_err(repo_err)?;

        // Build latest-status map: case_path -> (status, run_id, run_date)
        let mut latest: std::collections::HashMap<String, (String, String, String)> =
            std::collections::HashMap::new();
        // Runs are newest-first; first write wins = latest
        for run_meta in &runs {
            let run = repo::get_run(&repo, &run_meta.id).map_err(repo_err)?;
            for result in &run.results {
                latest.entry(result.case_path.clone()).or_insert_with(|| {
                    (
                        result.fm.status.clone(),
                        run_meta.id.clone(),
                        run_meta.date.clone(),
                    )
                });
            }
        }

        let entries = cases
            .iter()
            .map(|c| {
                let (status, last_run_id, last_run_date) = latest
                    .get(&c.case_path)
                    .cloned()
                    .unwrap_or_else(|| ("never".to_owned(), String::new(), String::new()));
                pb::CoverageEntry {
                    case: Some(case_to_pb(c)),
                    latest_status: result_status_to_i32(&status),
                    last_run_id,
                    last_run_date,
                }
            })
            .collect();

        Ok(Response::new(pb::GetCoverageReportResponse {
            entries,
            run_count: runs.len() as i32,
        }))
    }

    async fn get_affected_cases(
        &self,
        request: Request<pb::GetAffectedCasesRequest>,
    ) -> Result<Response<pb::GetAffectedCasesResponse>, Status> {
        use crate::git;

        let req = request.into_inner();
        let repo = PathBuf::from(&req.repo_path);

        let cases = repo::list_cases(&repo).map_err(repo_err)?;
        let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
        let case_map: std::collections::HashMap<String, &repo::LoadedCase> =
            cases.iter().map(|c| (c.case_path.clone(), c)).collect();

        let since = if req.since_ref.is_empty() {
            None
        } else {
            Some(req.since_ref.as_str())
        };
        let result = git::find_affected(&repo, since, &known_paths)
            .map_err(|e| repo_err(RepoError::Other(e)))?;

        let affected = result
            .case_paths
            .iter()
            .map(|path| pb::AffectedCase {
                case: case_map.get(path).map(|c| case_to_pb(c)),
                reason: result.reason.clone(),
            })
            .collect();

        Ok(Response::new(pb::GetAffectedCasesResponse {
            cases: affected,
            reason: result.reason,
        }))
    }
}
