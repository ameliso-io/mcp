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
