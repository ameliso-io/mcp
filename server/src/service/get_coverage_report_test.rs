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
async fn get_coverage_report_rejects_empty_repo_id() {
    let s = server();
    let err = s
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_id: "".to_owned(),
            status_filter: 0,
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("repo_id is required"));
}

#[tokio::test]
async fn get_coverage_report_with_status_filter_passes_validation() {
    // A non-Unspecified status_filter is valid — passes validation → DB error.
    let s = server();
    let err = s
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_id: "owner/repo".to_owned(),
            status_filter: pb::ResultStatus::Failed as i32,
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn get_coverage_report_passes_validation() {
    // Non-empty repo_id with default (Unspecified) filter passes validation → DB error.
    let s = server();
    let err = s
        .get_coverage_report(Request::new(pb::GetCoverageReportRequest {
            repo_id: "owner/repo".to_owned(),
            ..Default::default()
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
