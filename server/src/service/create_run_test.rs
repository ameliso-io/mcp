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
async fn create_run_rejects_tester_too_long() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            tester: "x".repeat(256),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("tester must not exceed 255"));
}

#[tokio::test]
async fn create_run_empty_slug_passes_validation() {
    // Empty slug is valid — server auto-generates one; handler then hits DB → Internal.
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_run_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
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
async fn create_run_empty_tester_passes_validation() {
    // Empty tester is allowed (falls back to "unknown"); validation must pass → DB error.
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            tester: "".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_run_with_environment_and_suite_passes_validation() {
    // Non-empty environment and suite take the Some(...) branches — passes validation → DB error.
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            tester: "alice".to_owned(),
            environment: "staging".to_owned(),
            suite: "smoke".to_owned(),
            cases: vec![],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_run_rejects_both_suite_and_cases() {
    // Passing both suite and non-empty cases list is invalid.
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            suite: "regression".to_owned(),
            cases: vec!["auth/login".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("suite") || err.message().contains("cases"));
}

#[tokio::test]
async fn create_run_rejects_invalid_inline_case_path() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            cases: vec!["../traversal".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_run_with_inline_cases_passes_validation() {
    // Non-empty cases list + no suite → passes validation → DB error (not InvalidArgument).
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            slug: "smoke".to_owned(),
            cases: vec!["auth/login".to_owned(), "billing/checkout".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_run_rejects_since_ref_with_cases() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            since_ref: "abc123".to_owned(),
            cases: vec!["auth/login".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("since_ref") || err.message().contains("cases"));
}

#[tokio::test]
async fn create_run_rejects_since_ref_with_suite() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            since_ref: "abc123".to_owned(),
            suite: "smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("since_ref") || err.message().contains("suite"));
}

#[tokio::test]
async fn create_run_rejects_changed_files_with_cases() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            changed_files: vec!["src/main.rs".to_owned()],
            cases: vec!["auth/login".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("changed_files") || err.message().contains("cases"));
}

#[tokio::test]
async fn create_run_rejects_changed_files_with_suite() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            changed_files: vec!["src/main.rs".to_owned()],
            suite: "smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("changed_files") || err.message().contains("suite"));
}

#[tokio::test]
async fn create_run_with_changed_files_passes_validation_to_db() {
    // changed_files set + no suite/cases → passes validation → DB error (not InvalidArgument).
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            changed_files: vec!["src/main.rs".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_run_with_since_ref_passes_validation_to_github_err() {
    // since_ref set + no suite/cases → passes validation → GitHub/DB error (not InvalidArgument).
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            since_ref: "abc123".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn create_run_rejects_use_last_run_with_since_ref() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            use_last_run: true,
            since_ref: "abc123".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("use_last_run") || err.message().contains("since_ref"));
}

#[tokio::test]
async fn create_run_rejects_use_last_run_with_changed_files() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            use_last_run: true,
            changed_files: vec!["src/main.rs".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("use_last_run") || err.message().contains("changed_files"));
}

#[tokio::test]
async fn create_run_rejects_use_last_run_with_cases() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            use_last_run: true,
            cases: vec!["auth/login".to_owned()],
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("use_last_run") || err.message().contains("cases"));
}

#[tokio::test]
async fn create_run_rejects_use_last_run_with_suite() {
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            use_last_run: true,
            suite: "smoke".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("use_last_run") || err.message().contains("suite"));
}

#[tokio::test]
async fn create_run_with_use_last_run_passes_validation_to_db() {
    // use_last_run=true + no suite/cases/since_ref → passes validation → DB error.
    let s = server();
    let err = s
        .create_run(Request::new(pb::CreateRunRequest {
            repo_id: "owner/repo".to_owned(),
            use_last_run: true,
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
