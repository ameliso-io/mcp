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
async fn finalize_run_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_id: "".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::Completed as i32,
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn finalize_run_rejects_empty_run_id() {
    let s = server();
    let err = s
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "".to_owned(),
            status: pb::RunStatus::Completed as i32,
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("run_id is required"));
}

#[tokio::test]
async fn finalize_run_rejects_invalid_status() {
    let s = server();
    let err = s
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::InProgress as i32, // not a valid finalize status
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn finalize_run_unspecified_status_auto_detects() {
    // UNSPECIFIED passes validation; handler then queries run from DB → Internal (no DB).
    let s = server();
    let err = s
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::Unspecified as i32,
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn finalize_run_rejects_in_progress_status() {
    // IN_PROGRESS is always rejected — only completed/aborted/unspecified are valid.
    let s = server();
    let err = s
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::InProgress as i32,
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err
        .message()
        .contains("status must be completed or aborted"));
}

#[tokio::test]
async fn finalize_run_aborted_passes_validation() {
    // "aborted" is a valid finalize status — validation must pass, producing a DB error.
    let s = server();
    let err = s
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::Aborted as i32,
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn finalize_run_completed_passes_validation() {
    // "completed" is a valid finalize status — validation must pass, producing a DB error.
    let s = server();
    let err = s
        .finalize_run(Request::new(pb::FinalizeRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            status: pb::RunStatus::Completed as i32,
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
