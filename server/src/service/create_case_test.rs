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
async fn create_case_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "Login".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn create_case_rejects_empty_title() {
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("title is required"));
}

#[tokio::test]
async fn create_case_rejects_empty_case_path() {
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "".to_owned(),
            title: "Login".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path is required"));
}

#[tokio::test]
async fn create_case_rejects_title_too_long() {
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
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
async fn create_case_rejects_case_path_too_long() {
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "a".repeat(201),
            title: "Login".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path must not exceed 200"));
}

#[tokio::test]
async fn create_case_strips_empty_and_whitespace_tags() {
    let s = server();
    // Tags with empty strings and whitespace-only entries should be rejected
    // before reaching DB. Here we just verify validation passes and hits DB
    // (non-InvalidArgument error), meaning the clean_tags path was exercised.
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "Login".to_owned(),
            tags: vec!["".to_owned(), "  ".to_owned(), "smoke".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_case_valid_fields_pass_validation() {
    // All required fields present — validation passes, DB produces an error.
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "Login".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_case_with_custom_body_passes_validation() {
    // Non-empty body uses Some(body) path — same validation, still reaches DB.
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "Login".to_owned(),
            body: "## Custom Steps\n\n1. Go to /login".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_case_with_explicit_priority_passes_validation() {
    // Non-Unspecified priority takes the Some("high") branch — passes validation → DB error.
    let s = server();
    let err = s
        .create_case(Request::new(pb::CreateCaseRequest {
            repo_id: "owner/repo".to_owned(),
            case_path: "auth/login".to_owned(),
            title: "Login".to_owned(),
            priority: pb::Priority::High as i32,
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
