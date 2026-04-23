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
async fn sync_repository_rejects_empty_id() {
    let s = server();
    let err = s
        .sync_repository(Request::new(pb::SyncRepositoryRequest {
            id: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("id is required"));
}

#[tokio::test]
async fn sync_repository_passes_validation() {
    // Non-empty id passes validation; the handler then hits the DB → Internal.
    let s = server();
    let err = s
        .sync_repository(Request::new(pb::SyncRepositoryRequest {
            id: "owner/repo".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_ne!(err.code(), tonic::Code::InvalidArgument);
}
