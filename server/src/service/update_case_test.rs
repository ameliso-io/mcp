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
async fn update_case_rejects_empty_case_path() {
    let s = server();
    let err = s
        .update_case(Request::new(pb::UpdateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path is required"));
}

#[tokio::test]
async fn update_case_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .update_case(Request::new(pb::UpdateCaseRequest {
            repo_id: "".to_owned(),
            case_path: "auth/login".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn update_case_rejects_title_too_long() {
    let s = server();
    let err = s
        .update_case(Request::new(pb::UpdateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "x".repeat(256),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("title must not exceed 255"));
}

#[tokio::test]
async fn update_case_strips_whitespace_only_tags() {
    let s = server();
    let err = s
        .update_case(Request::new(pb::UpdateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            tags: vec!["  ".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    // Whitespace-only tags cleaned to empty → treated as no-tag update → reaches DB
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_case_with_no_optional_fields_passes_validation() {
    // All optional fields absent — all take the None path; passes validation → DB error.
    let s = server();
    let err = s
        .update_case(Request::new(pb::UpdateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_case_with_optional_fields_passes_validation() {
    // Non-empty title/tags/body take the Some(...) branches — passes validation → DB error.
    let s = server();
    let err = s
        .update_case(Request::new(pb::UpdateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "Login Flow".to_owned(),
            description: "Updated desc".to_owned(),
            tags: vec!["smoke".to_owned()],
            body: "## Steps\n\n1. Navigate to /login".to_owned(),
            priority: pb::Priority::High as i32,
            new_path: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_case_with_new_path_passes_validation() {
    let s = server();
    let err = s
        .update_case(Request::new(pb::UpdateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            new_path: "auth/signin".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
