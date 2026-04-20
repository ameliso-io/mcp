/// Integration tests for AmelisoService.
///
/// Each test spins up an in-process tonic server on a random port, connects
/// a generated client, and exercises RPCs against a temporary repo directory.
use std::net::SocketAddr;
use std::path::Path;

use ameliso_server::proto::ameliso_v1::{
    self as pb,
    ameliso_service_client::AmelisoServiceClient,
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
        .list_runs(Request::new(pb::ListRunsRequest { repo_path: rp }))
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
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest { repo_path: rp }))
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
