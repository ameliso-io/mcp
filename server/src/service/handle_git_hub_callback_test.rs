use std::sync::Mutex;
use tonic::Request;

use crate::proto::ameliso_v1 as pb;
use crate::service::AmelisoServer;

use super::AmelisoService;

static ENV_LOCK: Mutex<()> = Mutex::new(());

fn server() -> AmelisoServer {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://user:pass@localhost/db_does_not_exist")
        .expect("lazy pool creation should not fail");
    AmelisoServer { pool }
}

#[tokio::test]
async fn handle_git_hub_callback_rejects_empty_installation_id() {
    let s = server();
    let err = s
        .handle_git_hub_callback(Request::new(pb::HandleGitHubCallbackRequest {
            installation_id: "".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert!(err.message().contains("installation_id is required"));
}

#[tokio::test]
async fn handle_git_hub_callback_rejects_when_github_not_configured() {
    let _g = ENV_LOCK.lock().unwrap();
    unsafe {
        std::env::remove_var("GITHUB_APP_ID");
        std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
    }
    let s = server();
    let err = s
        .handle_git_hub_callback(Request::new(pb::HandleGitHubCallbackRequest {
            installation_id: "inst-1".to_owned(),
        }))
        .await
        .unwrap_err();
    assert_eq!(err.code(), tonic::Code::FailedPrecondition);
    assert!(err.message().contains("GitHub App not configured"));
}
