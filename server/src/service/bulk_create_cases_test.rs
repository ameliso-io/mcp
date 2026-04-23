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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
