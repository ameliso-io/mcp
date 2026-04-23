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
async fn record_result_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Passed as i32,
            notes: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn record_result_rejects_empty_run_id() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Passed as i32,
            notes: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("run_id is required"));
}

#[tokio::test]
async fn record_result_rejects_empty_case_path() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "".to_owned(),
            status: pb::ResultStatus::Passed as i32,
            notes: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path is required"));
}

#[tokio::test]
async fn record_result_rejects_failed_without_notes() {
    let s = server();
    let req = Request::new(pb::RecordResultRequest {
        repo_id: "owner/repo".to_owned(),
        run_id: "2026-01-01-smoke".to_owned(),
        case_path: "auth/login".to_owned(),
        status: pb::ResultStatus::Failed as i32,
        notes: "".to_owned(),
    });
    let err = s.record_result(req).await.unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("notes are required"));
}

#[tokio::test]
async fn record_result_rejects_blocked_without_notes() {
    let s = server();
    let req = Request::new(pb::RecordResultRequest {
        repo_id: "owner/repo".to_owned(),
        run_id: "2026-01-01-smoke".to_owned(),
        case_path: "auth/login".to_owned(),
        status: pb::ResultStatus::Blocked as i32,
        notes: "   ".to_owned(), // whitespace-only
    });
    let err = s.record_result(req).await.unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("notes are required"));
}

#[tokio::test]
async fn record_result_rejects_invalid_status() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Unspecified as i32,
            notes: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("status must be one of"));
}

#[tokio::test]
async fn record_result_skipped_without_notes_passes_validation() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Skipped as i32,
            notes: "".to_owned(),
        }))
        .await
        .unwrap_err();
    // Validation passed; DB call failed because the lazy pool has no real connection.
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn record_result_passed_without_notes_passes_validation() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Passed as i32,
            notes: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn record_result_blocked_with_notes_passes_validation() {
    // blocked + non-empty notes satisfies validation → DB error, not InvalidArgument.
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Blocked as i32,
            notes: "blocked by infra".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn record_result_failed_with_notes_passes_validation() {
    // failed + non-empty notes satisfies validation → DB error, not InvalidArgument.
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Failed as i32,
            notes: "assertion failed".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn record_result_rejects_notes_too_long() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Failed as i32,
            notes: "x".repeat(2001),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("notes must not exceed 2000"));
}

#[tokio::test]
async fn record_result_rejects_never_status() {
    let s = server();
    let err = s
        .record_result(Request::new(pb::RecordResultRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            case_path: "auth/login".to_owned(),
            status: pb::ResultStatus::Never as i32,
            notes: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("status must be one of"));
}
