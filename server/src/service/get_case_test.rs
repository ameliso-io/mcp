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
async fn get_case_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .get_case(Request::new(pb::GetCaseRequest {
            repo_id: "".to_owned(),
            case_path: "auth/login".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn get_case_rejects_empty_case_path() {
    // Empty case_path passes service validation but repo::get_case rejects it
    // via validate_slug_path → InvalidArg.
    let s = server();
    let err = s
        .get_case(Request::new(pb::GetCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn get_case_passes_validation() {
    // Valid repo_id + any case_path passes validation, then hits DB.
    let s = server();
    let err = s
        .get_case(Request::new(pb::GetCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
