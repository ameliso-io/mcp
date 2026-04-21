use std::net::SocketAddr;

use ameliso_server::proto::ameliso_v1::ameliso_service_server::AmelisoServiceServer;
use ameliso_server::service::AmelisoServer;
use anyhow::Result;
use tonic::transport::Server;

fn load_env() {
    let candidates = [
        std::path::PathBuf::from(".env"),
        std::path::PathBuf::from("server/.env"),
    ];
    for path in &candidates {
        match dotenvy::from_path(path) {
            Ok(()) => {
                eprintln!("loaded env from {}", path.display());
                return;
            }
            Err(dotenvy::Error::Io(_)) => {}
            Err(e) => eprintln!("warning: .env error ({}): {e}", path.display()),
        }
    }
}

fn validate_env() {
    let required = [
        (
            "GITHUB_APP_ID",
            "numeric GitHub App ID from the app settings page",
        ),
        (
            "GITHUB_APP_PRIVATE_KEY",
            "PEM-encoded RSA private key downloaded from the app settings page",
        ),
    ];
    let mut missing = false;
    for (var, hint) in &required {
        if std::env::var(var).is_err() {
            eprintln!("error: required env var {var} is not set ({hint})");
            missing = true;
        }
    }
    if missing {
        std::process::exit(1);
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    load_env();
    validate_env();

    let port = std::env::var("AMELISO_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(50052);
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse()?;
    println!("ameliso-server listening on {}", addr);

    Server::builder()
        .accept_http1(true)
        .add_service(tonic_web::enable(AmelisoServiceServer::new(AmelisoServer)))
        .serve(addr)
        .await?;

    Ok(())
}
