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
async fn get_suite_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .get_suite(Request::new(pb::GetSuiteRequest {
            repo_id: "".to_owned(),
            slug: "smoke".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn get_suite_rejects_empty_slug() {
    let s = server();
    let err = s
        .get_suite(Request::new(pb::GetSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("slug is required"));
}

#[tokio::test]
async fn get_suite_passes_validation() {
    // Both required fields present — passes validation, then hits DB.
    let s = server();
    let err = s
        .get_suite(Request::new(pb::GetSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
