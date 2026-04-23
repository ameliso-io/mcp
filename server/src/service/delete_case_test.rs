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
async fn delete_case_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .delete_case(Request::new(pb::DeleteCaseRequest {
            repo_id: "".to_owned(),
            case_path: "auth/login".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn delete_case_rejects_empty_case_path() {
    let s = server();
    let err = s
        .delete_case(Request::new(pb::DeleteCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path is required"));
}

#[tokio::test]
async fn delete_case_passes_validation() {
    // Both required fields present — passes validation, then hits DB.
    let s = server();
    let err = s
        .delete_case(Request::new(pb::DeleteCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
