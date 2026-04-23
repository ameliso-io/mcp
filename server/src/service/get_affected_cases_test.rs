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
