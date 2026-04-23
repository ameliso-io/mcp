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
async fn get_git_hub_install_url_returns_not_configured_when_env_absent() {
    let _g = ENV_LOCK.lock().unwrap();
    unsafe {
        std::env::remove_var("GITHUB_APP_ID");
        std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
    }
    let s = server();
    let res = s
        .get_git_hub_install_url(Request::new(pb::GetGitHubInstallUrlRequest {}))
        .await
        .unwrap()
        .into_inner();
    assert!(!res.configured);
    assert_eq!(res.url, "");
}

#[tokio::test]
async fn get_git_hub_install_url_returns_configured_when_env_present() {
    let _g = ENV_LOCK.lock().unwrap();
    unsafe {
        std::env::set_var("GITHUB_APP_ID", "test-app");
        std::env::set_var("GITHUB_APP_PRIVATE_KEY", "test-key");
        std::env::remove_var("GITHUB_APP_INSTALLATION_URL");
        std::env::remove_var("GITHUB_APP_NAME");
    }
    let s = server();
    let res = s
        .get_git_hub_install_url(Request::new(pb::GetGitHubInstallUrlRequest {}))
        .await
        .unwrap()
        .into_inner();
    assert!(res.configured);
    assert!(res.url.contains("ameliso"));
    unsafe {
        std::env::remove_var("GITHUB_APP_ID");
        std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
    }
}
