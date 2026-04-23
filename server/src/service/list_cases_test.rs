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
