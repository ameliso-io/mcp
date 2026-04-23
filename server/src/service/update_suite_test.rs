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
async fn update_suite_rejects_empty_slug() {
    let s = server();
    let err = s
        .update_suite(Request::new(pb::UpdateSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("slug is required"));
}

#[tokio::test]
async fn update_suite_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .update_suite(Request::new(pb::UpdateSuiteRequest {
            repo_id: "".to_owned(),
            slug: "smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn update_suite_with_replace_cases_true_passes_validation() {
    // replace_cases=true with empty cases list is valid; passes validation → DB error.
    let s = server();
    let err = s
        .update_suite(Request::new(pb::UpdateSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            cases: vec![],
            replace_cases: true,
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_suite_with_new_slug_passes_validation() {
    let s = server();
    let err = s
        .update_suite(Request::new(pb::UpdateSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            new_slug: "smoke-v2".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_suite_passes_validation() {
    // repo_id + slug non-empty passes all validation gates → DB error.
    let s = server();
    let err = s
        .update_suite(Request::new(pb::UpdateSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_suite_with_name_and_description_passes_validation() {
    // Non-empty name and description take the Some(...) paths — passes validation → DB error.
    let s = server();
    let err = s
        .update_suite(Request::new(pb::UpdateSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            name: "Smoke Tests".to_owned(),
            description: "Critical path checks".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn update_suite_with_non_empty_cases_passes_validation() {
    // replace_cases=false but cases non-empty hits the `!cases.is_empty()` branch → cases=Some.
    let s = server();
    let err = s
        .update_suite(Request::new(pb::UpdateSuiteRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            cases: vec!["auth/login".to_owned()],
            replace_cases: false,
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
