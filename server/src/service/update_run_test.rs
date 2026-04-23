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
async fn update_run_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .update_run(Request::new(pb::UpdateRunRequest {
            repo_id: "".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            new_slug: "smoke-v2".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn update_run_rejects_empty_run_id() {
    let s = server();
    let err = s
        .update_run(Request::new(pb::UpdateRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "".to_owned(),
            new_slug: "smoke-v2".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("run_id is required"));
}

#[tokio::test]
async fn update_run_rejects_when_no_fields_provided() {
    let s = server();
    let err = s
        .update_run(Request::new(pb::UpdateRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("at least one"));
}

#[tokio::test]
async fn update_run_passes_validation_and_hits_db() {
    let s = server();
    let err = s
        .update_run(Request::new(pb::UpdateRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            new_slug: "smoke-v2".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_run_metadata_only_passes_validation_and_hits_db() {
    let s = server();
    let err = s
        .update_run(Request::new(pb::UpdateRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            commit_sha: Some("abc1234".to_owned()),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    // Reaches the DB (not InvalidArgument); fails with NotFound since the run doesn't exist.
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_run_add_cases_only_passes_validation_and_hits_db() {
    let s = server();
    let err = s
        .update_run(Request::new(pb::UpdateRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            add_cases: vec!["auth/login".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    // Passes validation; hits DB and fails with NotFound.
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_run_add_cases_rejects_empty_case_path() {
    let s = server();
    let err = s
        .update_run(Request::new(pb::UpdateRunRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            add_cases: vec!["".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}
