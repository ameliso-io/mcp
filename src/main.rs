mod proto;
mod repo;
mod service;

use std::net::SocketAddr;

use anyhow::Result;
use tonic::transport::Server;

use crate::proto::ameliso_v1::ameliso_service_server::AmelisoServiceServer;
use crate::service::AmelisoServer;

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
