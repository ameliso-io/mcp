/// Integration tests for AmelisoService.
///
/// Each test spins up an in-process tonic server on a random port, connects
/// a generated client, and exercises RPCs against a temporary repo directory.
use std::net::SocketAddr;
use std::path::Path;

use ameliso_server::proto::ameliso_v1::{
    self as pb, ameliso_service_client::AmelisoServiceClient,
    ameliso_service_server::AmelisoServiceServer,
};
use ameliso_server::service::AmelisoServer;
use tempfile::TempDir;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::transport::{Channel, Server};
use tonic::Request;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

async fn start_server() -> SocketAddr {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        Server::builder()
            .add_service(AmelisoServiceServer::new(AmelisoServer))
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    addr
}

async fn client(addr: SocketAddr) -> AmelisoServiceClient<Channel> {
    AmelisoServiceClient::connect(format!("http://{}", addr))
        .await
        .unwrap()
}

fn repo_path(tmp: &TempDir) -> String {
    tmp.path().to_string_lossy().into_owned()
}

fn write_case(repo: &Path, case_path: &str, title: &str) {
    let file = repo.join("cases").join(format!("{}.md", case_path));
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    std::fs::write(
        &file,
        format!(
            "---\ntitle: {title}\ndescription: desc\ntags: []\npriority: medium\n\
             created_at: 2026-01-01\nupdated_at: 2026-01-01\n---\n\n\
             ## Steps\n\n1. step\n\n## Expected Result\n\nok\n"
        ),
    )
    .unwrap();
}

fn write_run(repo: &Path, run_id: &str, status: &str) {
    let dir = repo.join("runs").join(run_id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("run.yaml"),
        format!("id: {run_id}\ndate: 2026-01-01\ntester: test\nstatus: {status}\n"),
    )
    .unwrap();
}

fn write_result(repo: &Path, run_id: &str, case_path: &str, status: &str) {
    let file = repo
        .join("runs")
        .join(run_id)
        .join("results")
        .join(format!("{}.md", case_path));
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    std::fs::write(&file, format!("---\nstatus: {status}\n---\n\n")).unwrap();
}

// ---------------------------------------------------------------------------
// Tests — Cases
// ---------------------------------------------------------------------------

#[tokio::test]
async fn list_cases_empty_repo() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();

    let cases = c
        .list_cases(Request::new(pb::ListCasesRequest {
            repo_path: repo_path(&tmp),
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner()
        .cases;

    assert!(cases.is_empty());
}

#[tokio::test]
async fn create_case_then_list() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    c.create_case(Request::new(pb::CreateCaseRequest {
        repo_path: rp.clone(),
        case_path: "auth/login".to_owned(),
        title: "User Login".to_owned(),
        description: "Verify login works".to_owned(),
        tags: vec!["auth".to_owned()],
        priority: pb::Priority::High as i32,
        ..Default::default()
    }))
    .await
    .unwrap();

    let cases = c
        .list_cases(Request::new(pb::ListCasesRequest {
            repo_path: rp.clone(),
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner()
        .cases;

    assert_eq!(cases.len(), 1);
    assert_eq!(cases[0].path, "auth/login");
    assert_eq!(cases[0].title, "User Login");
    assert_eq!(cases[0].tags, vec!["auth"]);
    assert!(tmp.path().join("cases/auth/login.md").exists());
}

#[tokio::test]
async fn create_case_duplicate_fails() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    let req = || pb::CreateCaseRequest {
        repo_path: rp.clone(),
        case_path: "auth/login".to_owned(),
        title: "User Login".to_owned(),
        description: "desc".to_owned(),
        ..Default::default()
    };

    c.create_case(Request::new(req())).await.unwrap();
    let err = c.create_case(Request::new(req())).await.unwrap_err();
    assert_eq!(err.code(), tonic::Code::AlreadyExists);
}

#[tokio::test]
async fn list_cases_filter_by_tag() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    // auth/login has tag "auth"; billing/invoice has no tags
    std::fs::create_dir_all(tmp.path().join("cases/auth")).unwrap();
    std::fs::write(
        tmp.path().join("cases/auth/login.md"),
        "---\ntitle: Login\ndescription: d\ntags: [auth]\npriority: medium\n\
         created_at: 2026-01-01\nupdated_at: 2026-01-01\n---\n\n## Steps\n\n1. s\n\n## Expected Result\n\nok\n",
    )
    .unwrap();
    write_case(tmp.path(), "billing/invoice", "Invoice");

    let cases = c
        .list_cases(Request::new(pb::ListCasesRequest {
            repo_path: rp,
            tags: vec!["auth".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner()
        .cases;

    assert_eq!(cases.len(), 1);
    assert_eq!(cases[0].path, "auth/login");
}

#[tokio::test]
async fn list_cases_filter_by_query() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "User Login Flow");
    write_case(tmp.path(), "billing/invoice", "Invoice Generation");

    let cases = c
        .list_cases(Request::new(pb::ListCasesRequest {
            repo_path: rp,
            query: "invoice".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner()
        .cases;

    assert_eq!(cases.len(), 1);
    assert_eq!(cases[0].path, "billing/invoice");
}

// ---------------------------------------------------------------------------
// Tests — Runs
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_and_list_run() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    let resp = c
        .create_run(Request::new(pb::CreateRunRequest {
            repo_path: rp.clone(),
            slug: "smoke".to_owned(),
            tester: "alice".to_owned(),
            environment: "staging".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner();

    let meta = resp.run.unwrap();
    assert!(meta.id.ends_with("-smoke"));
    assert_eq!(meta.tester, "alice");
    assert_eq!(meta.status, pb::RunStatus::InProgress as i32);

    let runs = c
        .list_runs(Request::new(pb::ListRunsRequest {
            repo_path: rp,
            status: 0,
        }))
        .await
        .unwrap()
        .into_inner()
        .runs;

    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].tester, "alice");
}

#[tokio::test]
async fn record_result_and_finalize() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    write_run(tmp.path(), "2026-01-01-smoke", "in-progress");

    c.record_result(Request::new(pb::RecordResultRequest {
        repo_path: rp.clone(),
        run_id: "2026-01-01-smoke".to_owned(),
        case_path: "auth/login".to_owned(),
        status: pb::ResultStatus::Passed as i32,
        notes: "all good".to_owned(),
    }))
    .await
    .unwrap();

    assert!(tmp
        .path()
        .join("runs/2026-01-01-smoke/results/auth/login.md")
        .exists());

    let finalized = c
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_path: rp,
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::Completed as i32,
        }))
        .await
        .unwrap()
        .into_inner()
        .run
        .unwrap();

    assert_eq!(finalized.status, pb::RunStatus::Completed as i32);
}

#[tokio::test]
async fn record_result_on_closed_run_fails() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_run(tmp.path(), "2026-01-01-done", "completed");

    let err = c
        .record_result(Request::new(pb::RecordResultRequest {
            repo_path: rp,
            run_id: "2026-01-01-done".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Passed as i32,
            notes: String::new(),
        }))
        .await
        .unwrap_err();

    assert_eq!(err.code(), tonic::Code::FailedPrecondition);
}

#[tokio::test]
async fn finalize_run_twice_fails() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_run(tmp.path(), "2026-01-01-smoke", "in-progress");

    c.finalize_run(Request::new(pb::FinalizeRunRequest {
        repo_path: rp.clone(),
        run_id: "2026-01-01-smoke".to_owned(),
        status: pb::RunStatus::Completed as i32,
    }))
    .await
    .unwrap();

    let err = c
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_path: rp,
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::Completed as i32,
        }))
        .await
        .unwrap_err();

    assert_eq!(err.code(), tonic::Code::FailedPrecondition);
}

// ---------------------------------------------------------------------------
// Tests — Coverage report
// ---------------------------------------------------------------------------

#[tokio::test]
async fn coverage_never_for_unrun_cases() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    write_case(tmp.path(), "billing/invoice", "Invoice");

    let report = c
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_path: rp,
            status_filter: 0,
        }))
        .await
        .unwrap()
        .into_inner();

    assert_eq!(report.entries.len(), 2);
    assert_eq!(report.run_count, 0);
    for entry in &report.entries {
        assert_eq!(entry.latest_status, pb::ResultStatus::Never as i32);
        assert!(entry.last_run_id.is_empty());
    }
}

#[tokio::test]
async fn coverage_shows_latest_run_status() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    // Older run: passed
    write_run(tmp.path(), "2026-01-01-run1", "completed");
    write_result(tmp.path(), "2026-01-01-run1", "auth/login", "passed");
    // Newer run: failed
    write_run(tmp.path(), "2026-01-02-run2", "completed");
    write_result(tmp.path(), "2026-01-02-run2", "auth/login", "failed");

    let report = c
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_path: rp,
            status_filter: 0,
        }))
        .await
        .unwrap()
        .into_inner();

    assert_eq!(report.run_count, 2);
    let entry = &report.entries[0];
    assert_eq!(entry.latest_status, pb::ResultStatus::Failed as i32);
    assert_eq!(entry.last_run_id, "2026-01-02-run2");
}

// ---------------------------------------------------------------------------
// Tests — Suites
// ---------------------------------------------------------------------------

#[tokio::test]
async fn coverage_report_status_filter() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    write_case(tmp.path(), "billing/invoice", "Invoice");
    write_run(tmp.path(), "2026-01-01-r1", "completed");
    write_result(tmp.path(), "2026-01-01-r1", "auth/login", "passed");
    // billing/invoice has no result → "never"

    // No filter — both entries
    let all = c
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_path: rp.clone(),
            status_filter: 0,
        }))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(all.entries.len(), 2);

    // Filter: never — only invoice
    let never = c
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_path: rp.clone(),
            status_filter: pb::ResultStatus::Never as i32,
        }))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(never.entries.len(), 1);
    assert_eq!(
        never.entries[0].case.as_ref().unwrap().path,
        "billing/invoice"
    );

    // Filter: passed — only login
    let passed = c
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_path: rp,
            status_filter: pb::ResultStatus::Passed as i32,
        }))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(passed.entries.len(), 1);
    assert_eq!(passed.entries[0].case.as_ref().unwrap().path, "auth/login");
}

// ---------------------------------------------------------------------------
// Tests — Affected cases
// ---------------------------------------------------------------------------

#[tokio::test]
async fn affected_cases_no_git_returns_all() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    write_case(tmp.path(), "billing/invoice", "Invoice");

    // No git repo in tmp → last_run_commit returns None → all cases flagged.
    let resp = c
        .get_affected_cases(Request::new(pb::GetAffectedCasesRequest {
            repo_path: rp,
            since_ref: String::new(),
        }))
        .await
        .unwrap()
        .into_inner();

    assert_eq!(resp.cases.len(), 2);
    assert!(
        resp.reason.contains("no test runs found"),
        "unexpected reason: {}",
        resp.reason
    );
}

// ---------------------------------------------------------------------------
// Tests — Suites
// ---------------------------------------------------------------------------

#[tokio::test]
async fn list_suites_empty() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();

    let suites = c
        .list_suites(Request::new(pb::ListSuitesRequest {
            repo_path: repo_path(&tmp),
        }))
        .await
        .unwrap()
        .into_inner()
        .suites;

    assert!(suites.is_empty());
}

#[tokio::test]
async fn create_and_get_suite() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");

    c.create_suite(Request::new(pb::CreateSuiteRequest {
        repo_path: rp.clone(),
        slug: "smoke".to_owned(),
        name: "Smoke Test".to_owned(),
        description: "Quick check".to_owned(),
        cases: vec!["auth/login".to_owned()],
    }))
    .await
    .unwrap();

    let suite = c
        .get_suite(Request::new(pb::GetSuiteRequest {
            repo_path: rp,
            slug: "smoke".to_owned(),
        }))
        .await
        .unwrap()
        .into_inner()
        .suite
        .unwrap();

    assert_eq!(suite.name, "Smoke Test");
    assert_eq!(suite.cases, vec!["auth/login"]);
}

#[tokio::test]
async fn get_case_returns_body() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "User Login");

    let resp = c
        .get_case(Request::new(pb::GetCaseRequest {
            repo_path: rp,
            case_path: "auth/login".to_owned(),
        }))
        .await
        .unwrap()
        .into_inner();

    let case = resp.case.unwrap();
    assert_eq!(case.path, "auth/login");
    assert_eq!(case.title, "User Login");
    assert!(
        resp.body.contains("Steps"),
        "body should contain Steps section"
    );
}

#[tokio::test]
async fn create_case_with_custom_body() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    let custom_body = "## Steps\n\n1. Open the app\n\n## Expected Result\n\nApp opens\n";
    c.create_case(Request::new(pb::CreateCaseRequest {
        repo_path: rp.clone(),
        case_path: "smoke/open".to_owned(),
        title: "Open App".to_owned(),
        description: "Basic smoke test".to_owned(),
        body: custom_body.to_owned(),
        ..Default::default()
    }))
    .await
    .unwrap();

    let resp = c
        .get_case(Request::new(pb::GetCaseRequest {
            repo_path: rp,
            case_path: "smoke/open".to_owned(),
        }))
        .await
        .unwrap()
        .into_inner();

    assert!(resp.body.contains("Open the app"), "custom body preserved");
}

#[tokio::test]
async fn delete_case_removes_file() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "User Login");
    assert!(tmp.path().join("cases/auth/login.md").exists());

    c.delete_case(Request::new(pb::DeleteCaseRequest {
        repo_path: rp.clone(),
        case_path: "auth/login".to_owned(),
    }))
    .await
    .unwrap();

    assert!(!tmp.path().join("cases/auth/login.md").exists());

    let err = c
        .delete_case(Request::new(pb::DeleteCaseRequest {
            repo_path: rp,
            case_path: "auth/login".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::NotFound);
}

#[tokio::test]
async fn update_case_preserves_body_when_omitted() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "User Login");

    c.update_case(Request::new(pb::UpdateCaseRequest {
        repo_path: rp.clone(),
        case_path: "auth/login".to_owned(),
        title: "Updated Title".to_owned(),
        description: "new desc".to_owned(),
        body: String::new(), // empty = preserve
        ..Default::default()
    }))
    .await
    .unwrap();

    let resp = c
        .get_case(Request::new(pb::GetCaseRequest {
            repo_path: rp,
            case_path: "auth/login".to_owned(),
        }))
        .await
        .unwrap()
        .into_inner();

    assert_eq!(resp.case.unwrap().title, "Updated Title");
    assert!(
        resp.body.contains("Steps"),
        "original body preserved after update"
    );
}

#[tokio::test]
async fn update_suite_changes_cases() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    write_case(tmp.path(), "billing/checkout", "Checkout");

    c.create_suite(Request::new(pb::CreateSuiteRequest {
        repo_path: rp.clone(),
        slug: "smoke".to_owned(),
        name: "Smoke".to_owned(),
        description: String::new(),
        cases: vec!["auth/login".to_owned()],
    }))
    .await
    .unwrap();

    c.update_suite(Request::new(pb::UpdateSuiteRequest {
        repo_path: rp.clone(),
        slug: "smoke".to_owned(),
        name: "Smoke Suite".to_owned(),
        description: String::new(),
        cases: vec!["auth/login".to_owned(), "billing/checkout".to_owned()],
    }))
    .await
    .unwrap();

    let suite = c
        .get_suite(Request::new(pb::GetSuiteRequest {
            repo_path: rp,
            slug: "smoke".to_owned(),
        }))
        .await
        .unwrap()
        .into_inner()
        .suite
        .unwrap();

    assert_eq!(suite.name, "Smoke Suite");
    assert_eq!(suite.cases.len(), 2);
    assert!(suite.cases.contains(&"billing/checkout".to_owned()));
}

#[tokio::test]
async fn delete_suite_removes_file() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");

    c.create_suite(Request::new(pb::CreateSuiteRequest {
        repo_path: rp.clone(),
        slug: "smoke".to_owned(),
        name: "Smoke".to_owned(),
        cases: vec!["auth/login".to_owned()],
        ..Default::default()
    }))
    .await
    .unwrap();

    assert!(tmp.path().join("suites/smoke.yaml").exists());

    c.delete_suite(Request::new(pb::DeleteSuiteRequest {
        repo_path: rp.clone(),
        slug: "smoke".to_owned(),
    }))
    .await
    .unwrap();

    assert!(!tmp.path().join("suites/smoke.yaml").exists());

    // Second delete → NotFound
    let err = c
        .delete_suite(Request::new(pb::DeleteSuiteRequest {
            repo_path: rp,
            slug: "smoke".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::NotFound);
}

#[tokio::test]
async fn list_cases_filter_by_priority() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    std::fs::create_dir_all(tmp.path().join("cases/auth")).unwrap();
    std::fs::write(
        tmp.path().join("cases/auth/login.md"),
        "---\ntitle: Login\ndescription: d\ntags: []\npriority: high\n\
         created_at: 2026-01-01\nupdated_at: 2026-01-01\n---\n\n## Steps\n\n1.\n",
    )
    .unwrap();
    write_case(tmp.path(), "billing/invoice", "Invoice"); // priority: medium

    let cases = c
        .list_cases(Request::new(pb::ListCasesRequest {
            repo_path: rp,
            priority: pb::Priority::High as i32,
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner()
        .cases;

    assert_eq!(cases.len(), 1);
    assert_eq!(cases[0].path, "auth/login");
}

#[tokio::test]
async fn create_case_rejects_path_traversal() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    let err = c
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_path: rp,
            case_path: "../../../etc/passwd".to_owned(),
            title: "Malicious".to_owned(),
            description: String::new(),
            ..Default::default()
        }))
        .await
        .unwrap_err();

    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn list_runs_filter_by_status() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_run(tmp.path(), "2026-01-01-alpha", "in-progress");
    write_run(tmp.path(), "2026-01-02-beta", "completed");
    write_run(tmp.path(), "2026-01-03-gamma", "completed");

    // No filter — returns all 3
    let all = c
        .list_runs(Request::new(pb::ListRunsRequest {
            repo_path: rp.clone(),
            status: pb::RunStatus::Unspecified as i32,
        }))
        .await
        .unwrap()
        .into_inner()
        .runs;
    assert_eq!(all.len(), 3);

    // Filter: in-progress — returns 1
    let in_progress = c
        .list_runs(Request::new(pb::ListRunsRequest {
            repo_path: rp.clone(),
            status: pb::RunStatus::InProgress as i32,
        }))
        .await
        .unwrap()
        .into_inner()
        .runs;
    assert_eq!(in_progress.len(), 1);
    assert_eq!(in_progress[0].id, "2026-01-01-alpha");

    // Filter: completed — returns 2
    let completed = c
        .list_runs(Request::new(pb::ListRunsRequest {
            repo_path: rp,
            status: pb::RunStatus::Completed as i32,
        }))
        .await
        .unwrap()
        .into_inner()
        .runs;
    assert_eq!(completed.len(), 2);
}

#[tokio::test]
async fn record_result_rejects_invalid_status() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_run(tmp.path(), "2026-01-01-alpha", "in-progress");

    let err = c
        .record_result(Request::new(pb::RecordResultRequest {
            repo_path: rp,
            run_id: "2026-01-01-alpha".to_owned(),
            case_path: "auth/login".to_owned(),
            // 0 = Unspecified
            status: 0,
            notes: String::new(),
        }))
        .await
        .unwrap_err();

    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn finalize_run_rejects_in_progress_status() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_run(tmp.path(), "2026-01-01-alpha", "in-progress");

    let err = c
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_path: rp,
            run_id: "2026-01-01-alpha".to_owned(),
            // InProgress is not a valid finalize status
            status: pb::RunStatus::InProgress as i32,
        }))
        .await
        .unwrap_err();

    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn get_pending_cases_returns_unrecorded() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    write_case(tmp.path(), "billing/invoice", "Invoice");
    write_run(tmp.path(), "2026-01-01-smoke", "in-progress");

    // No results recorded yet — both cases pending
    let resp = c
        .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
            repo_path: rp.clone(),
            run_id: "2026-01-01-smoke".to_owned(),
        }))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(resp.total_in_scope, 2);
    assert_eq!(resp.cases.len(), 2);

    // Record one result
    write_result(tmp.path(), "2026-01-01-smoke", "auth/login", "passed");

    // Now only billing/invoice is pending
    let resp2 = c
        .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
            repo_path: rp,
            run_id: "2026-01-01-smoke".to_owned(),
        }))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(resp2.total_in_scope, 2);
    assert_eq!(resp2.cases.len(), 1);
    assert_eq!(resp2.cases[0].path, "billing/invoice");
    assert_eq!(resp2.cases[0].title, "Invoice");
}

#[tokio::test]
async fn get_pending_cases_respects_suite_scope() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    write_case(tmp.path(), "billing/invoice", "Invoice");
    write_case(tmp.path(), "payments/checkout", "Checkout");

    // Create a suite with only 2 of the 3 cases
    c.create_suite(Request::new(pb::CreateSuiteRequest {
        repo_path: rp.clone(),
        slug: "smoke".to_owned(),
        name: "Smoke".to_owned(),
        cases: vec!["auth/login".to_owned(), "billing/invoice".to_owned()],
        ..Default::default()
    }))
    .await
    .unwrap();

    // Create a run referencing the suite
    let meta = c
        .create_run(Request::new(pb::CreateRunRequest {
            repo_path: rp.clone(),
            slug: "smoke".to_owned(),
            tester: "alice".to_owned(),
            suite: "smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner()
        .run
        .unwrap();

    // All 2 suite cases pending
    let resp = c
        .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
            repo_path: rp.clone(),
            run_id: meta.id.clone(),
        }))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(resp.total_in_scope, 2);
    assert_eq!(resp.cases.len(), 2);
    // payments/checkout NOT in scope (not in suite)
    let pending_paths: Vec<&str> = resp.cases.iter().map(|c| c.path.as_str()).collect();
    assert!(!pending_paths.contains(&"payments/checkout"));
}

#[tokio::test]
async fn record_result_rejects_nonexistent_case() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_run(tmp.path(), "2026-01-01-smoke", "in-progress");
    // Note: no write_case — auth/typo does not exist

    let err = c
        .record_result(Request::new(pb::RecordResultRequest {
            repo_path: rp,
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/typo".to_owned(),
            status: pb::ResultStatus::Passed as i32,
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::NotFound);
}

#[tokio::test]
async fn create_run_rejects_nonexistent_suite() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    let err = c
        .create_run(Request::new(pb::CreateRunRequest {
            repo_path: rp,
            slug: "smoke".to_owned(),
            tester: "alice".to_owned(),
            suite: "ghost-suite".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::NotFound);
}

#[tokio::test]
async fn create_suite_rejects_nonexistent_case() {
    let addr = start_server().await;
    let mut c = client(addr).await;
    let tmp = TempDir::new().unwrap();
    let rp = repo_path(&tmp);

    write_case(tmp.path(), "auth/login", "Login");
    // "auth/typo" does not exist

    let err = c
        .create_suite(Request::new(pb::CreateSuiteRequest {
            repo_path: rp,
            slug: "smoke".to_owned(),
            name: "Smoke".to_owned(),
            cases: vec!["auth/login".to_owned(), "auth/typo".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::NotFound);
}
