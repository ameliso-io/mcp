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
async fn get_pending_cases_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
            repo_id: "".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn get_pending_cases_rejects_empty_run_id() {
    let s = server();
    let err = s
        .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("run_id is required"));
}

#[tokio::test]
async fn get_pending_cases_passes_validation() {
    // Both required fields present — passes validation, then hits DB.
    let s = server();
    let err = s
        .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn get_pending_cases_with_priority_filter_passes_validation() {
    // Priority filter set to HIGH passes validation → DB error (not InvalidArgument).
    let s = server();
    let err = s
        .get_pending_cases(Request::new(pb::GetPendingCasesRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            priority_filter: pb::Priority::High as i32,
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
