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
async fn bulk_record_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn bulk_record_rejects_empty_run_id() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("run_id is required"));
}

#[tokio::test]
async fn bulk_record_rejects_empty_results() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("results must not be empty"));
}

#[tokio::test]
async fn bulk_record_rejects_failed_without_notes() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Failed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("notes are required"));
}

#[tokio::test]
async fn bulk_record_rejects_blocked_without_notes() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Blocked as i32,
                notes: "  ".to_owned(), // whitespace-only
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("notes are required"));
}

#[tokio::test]
async fn bulk_record_skipped_without_notes_passes_validation() {
    // "skipped" must NOT require notes; validation should pass and produce a DB error.
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Skipped as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn bulk_record_rejects_invalid_status() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Unspecified as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("status must be one of"));
}

#[tokio::test]
async fn bulk_record_rejects_empty_case_path() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path"));
}

#[tokio::test]
async fn bulk_record_blocked_with_notes_passes_validation() {
    // blocked + non-empty notes satisfies validation → DB error, not InvalidArgument.
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Blocked as i32,
                notes: "blocked by infra".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn bulk_record_failed_with_notes_passes_validation() {
    // failed + non-empty notes satisfies validation → DB error, not InvalidArgument.
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Failed as i32,
                notes: "assertion failed".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn bulk_record_rejects_never_status() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Never as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("status must be one of"));
}

#[tokio::test]
async fn bulk_record_passed_without_notes_passes_validation() {
    // "passed" must NOT require notes; validation should pass and produce a DB error.
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn bulk_record_results_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn bulk_record_results_rejects_empty_run_id() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("run_id is required"));
}

#[tokio::test]
async fn bulk_record_results_rejects_empty_results_list() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("results must not be empty"));
}

#[tokio::test]
async fn bulk_record_results_rejects_entry_with_empty_case_path() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "".to_owned(),
                status: pb::ResultStatus::Passed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("case_path"));
}

#[tokio::test]
async fn bulk_record_results_rejects_invalid_status() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: 999,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("status must be one of"));
}

#[tokio::test]
async fn bulk_record_results_rejects_failed_without_notes() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Failed as i32,
                notes: "".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("notes are required"));
}

#[tokio::test]
async fn bulk_record_results_rejects_blocked_without_notes() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![pb::BulkResultEntry {
                case_path: "auth/login".to_owned(),
                status: pb::ResultStatus::Blocked as i32,
                notes: "   ".to_owned(),
            }],
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("notes are required"));
}

#[tokio::test]
async fn bulk_record_results_valid_passes_validation_and_hits_db() {
    let s = server();
    let err = s
        .bulk_record_results(Request::new(pb::BulkRecordResultsRequest {
            repo_id: "owner/repo".to_owned(),
            run_id: "2026-01-01-smoke".to_owned(),
            results: vec![
                pb::BulkResultEntry {
                    case_path: "auth/login".to_owned(),
                    status: pb::ResultStatus::Passed as i32,
                    notes: "".to_owned(),
                },
                pb::BulkResultEntry {
                    case_path: "auth/logout".to_owned(),
                    status: pb::ResultStatus::Failed as i32,
                    notes: "Button missing".to_owned(),
                },
            ],
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
