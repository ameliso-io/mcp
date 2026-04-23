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
async fn list_repositories_returns_internal_without_db() {
    // list_repositories has no validation — it always hits the DB directly.
    let s = server();
    let err = s
        .list_repositories(Request::new(pb::ListRepositoriesRequest {}))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::Internal);
}
