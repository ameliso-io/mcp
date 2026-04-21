use std::net::SocketAddr;

use ameliso_server::proto::ameliso_v1::ameliso_service_server::AmelisoServiceServer;
use ameliso_server::service::AmelisoServer;
use anyhow::Result;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<()> {
    let addr: SocketAddr = "[::1]:50051".parse()?;
    println!("ameliso-server listening on {}", addr);

    Server::builder()
        .add_service(AmelisoServiceServer::new(AmelisoServer))
        .serve(addr)
        .await?;

    Ok(())
}
