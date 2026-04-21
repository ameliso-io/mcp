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
            Ok(()) => eprintln!("loaded env from {}", path.display()),
            Err(dotenvy::Error::Io(_)) => {}
            Err(e) => eprintln!("warning: .env error ({}): {e}", path.display()),
        }
    }
}

async fn sync_installations(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    let cfg = match ameliso_server::github::config() {
        Some(c) => c,
        None => return Ok(()),
    };
    let jwt = ameliso_server::github::generate_jwt(&cfg.app_id, &cfg.private_key)?;
    let installations = ameliso_server::github::list_app_installations(&jwt).await?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    for inst in &installations {
        let installation_id = inst.id.to_string();
        let token = ameliso_server::github::get_installation_token(&installation_id, &jwt).await?;
        let repos = ameliso_server::github::list_installation_repos(&token).await?;
        for gh_repo in &repos {
            let stored = ameliso_server::repos_store::StoredRepo {
                id: gh_repo.full_name.clone(),
                name: gh_repo.name.clone(),
                full_name: gh_repo.full_name.clone(),
                html_url: gh_repo.html_url.clone(),
                installation_id: installation_id.clone(),
                added_at: now.clone(),
            };
            ameliso_server::repos_store::add_or_update(pool, &stored).await?;
        }
    }
    eprintln!(
        "startup installation sync complete ({} installation(s))",
        installations.len()
    );
    Ok(())
}

fn validate_env() {
    let required = [
        (
            "DATABASE_URL",
            "PostgreSQL connection string, e.g. postgres://user:pass@host/db",
        ),
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

    let database_url = std::env::var("DATABASE_URL").unwrap();
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;

    ameliso_server::db::run_migrations(&pool).await?;
    eprintln!("database schema ready");

    if let Err(e) = sync_installations(&pool).await {
        eprintln!("warning: startup installation sync failed: {e}");
    }

    let port = std::env::var("AMELISO_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(50052);
    let addr: SocketAddr = format!("0.0.0.0:{port}").parse()?;
    println!("ameliso-server listening on {}", addr);

    Server::builder()
        .accept_http1(true)
        .add_service(tonic_web::enable(AmelisoServiceServer::new(
            AmelisoServer { pool },
        )))
        .serve(addr)
        .await?;

    Ok(())
}
