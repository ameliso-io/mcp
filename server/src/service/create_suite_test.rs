use tonic::Request;

use crate::proto::ameliso_v1 as pb;
use crate::service::AmelisoServer;

use super::AmelisoService;

fn server() -> AmelisoServer {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://user:pass@localhost/db_does_not_exist")
        .expect("lazy pool creation should not fail");
    AmelisoServer { pool }
}

// ── create_suite validation ───────────────────────────────────────────────

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
