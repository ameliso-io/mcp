use std::net::SocketAddr;

use ameliso_server::proto::ameliso_v1::ameliso_service_server::AmelisoServiceServer;
use ameliso_server::service::AmelisoServer;
use anyhow::Result;
use tonic::transport::Server;

fn validate_env() {
    let required = [
        ("GITHUB_APP_ID", "numeric GitHub App ID from the app settings page"),
        ("GITHUB_APP_PRIVATE_KEY", "PEM-encoded RSA private key downloaded from the app settings page"),
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
    validate_env();

    let addr: SocketAddr = "[::1]:50051".parse()?;
    println!("ameliso-server listening on {}", addr);

    Server::builder()
        .accept_http1(true)
        .add_service(tonic_web::enable(AmelisoServiceServer::new(AmelisoServer)))
        .serve(addr)
        .await?;

    Ok(())
}
