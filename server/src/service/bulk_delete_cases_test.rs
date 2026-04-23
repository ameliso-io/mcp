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
async fn bulk_delete_cases_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
            repo_id: "".to_owned(),
            case_paths: vec!["auth/login".to_owned()],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn bulk_delete_cases_rejects_empty_list() {
    let s = server();
    let err = s
        .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
            repo_id: "owner/repo".to_owned(),
            case_paths: vec![],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_paths"));
}

#[tokio::test]
async fn bulk_delete_cases_rejects_empty_path_in_list() {
    let s = server();
    let err = s
        .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
            repo_id: "owner/repo".to_owned(),
            case_paths: vec!["".to_owned()],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path"));
}

#[tokio::test]
async fn bulk_delete_cases_valid_passes_validation_to_db() {
    // Validation passes → hits DB → not InvalidArgument.
    let s = server();
    let err = s
        .bulk_delete_cases(Request::new(pb::BulkDeleteCasesRequest {
            repo_id: "owner/repo".to_owned(),
            case_paths: vec!["auth/login".to_owned()],
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
