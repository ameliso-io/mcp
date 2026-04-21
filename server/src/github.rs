use anyhow::{Context, Result};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct GitHubConfig {
    pub app_id: String,
    pub private_key: String,
    pub installation_url: String,
}

pub fn config() -> Option<GitHubConfig> {
    let app_id = std::env::var("GITHUB_APP_ID").ok()?;
    let private_key = std::env::var("GITHUB_APP_PRIVATE_KEY").ok()?;
    let installation_url = std::env::var("GITHUB_APP_INSTALLATION_URL").unwrap_or_else(|_| {
        let app_name = std::env::var("GITHUB_APP_NAME").unwrap_or_else(|_| "ameliso".to_owned());
        format!("https://github.com/apps/{app_name}/installations/new")
    });
    Some(GitHubConfig {
        app_id,
        private_key,
        installation_url,
    })
}

#[derive(Serialize)]
struct JwtClaims {
    iss: String,
    iat: u64,
    exp: u64,
}

pub fn generate_jwt(app_id: &str, private_key_pem: &str) -> Result<String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system time error")?
        .as_secs();
    let claims = JwtClaims {
        iss: app_id.to_owned(),
        iat: now - 60,
        exp: now + 540,
    };
    let key =
        EncodingKey::from_rsa_pem(private_key_pem.as_bytes()).context("invalid RSA private key")?;
    encode(&Header::new(Algorithm::RS256), &claims, &key).context("JWT encode failed")
}

#[derive(Deserialize, Debug)]
struct InstallationTokenResponse {
    token: String,
}

pub async fn get_installation_token(installation_id: &str, jwt: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let raw = client
        .post(format!(
            "https://api.github.com/app/installations/{installation_id}/access_tokens"
        ))
        .header("Authorization", format!("Bearer {jwt}"))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "ameliso/1.0")
        .send()
        .await
        .context("request failed")?;
    if !raw.status().is_success() {
        let status = raw.status();
        let body = raw.text().await.unwrap_or_default();
        anyhow::bail!("get installation token: HTTP {status}: {body}");
    }
    let resp: InstallationTokenResponse = raw
        .json()
        .await
        .context("get installation token: parse error")?;
    Ok(resp.token)
}

#[derive(Deserialize, Debug, Clone)]
pub struct GitHubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub clone_url: String,
    pub private: bool,
}

#[derive(Deserialize)]
struct RepoListResponse {
    repositories: Vec<GitHubRepo>,
}

pub async fn list_installation_repos(token: &str) -> Result<Vec<GitHubRepo>> {
    let client = reqwest::Client::new();
    let resp: RepoListResponse = client
        .get("https://api.github.com/installation/repositories")
        .header("Authorization", format!("token {token}"))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "ameliso/1.0")
        .send()
        .await
        .context("request failed")?
        .error_for_status()
        .context("list installation repos: bad status")?
        .json()
        .await
        .context("list installation repos: parse error")?;
    Ok(resp.repositories)
}

/// Clone repo if not present, or pull if already cloned.
/// Returns true on success.
pub fn clone_or_update(repo: &GitHubRepo, local_path: &Path, token: &str) -> Result<bool> {
    if local_path.exists() {
        let out = Command::new("git")
            .args(["-C", &local_path.to_string_lossy(), "pull", "--ff-only"])
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_INDEX_FILE")
            .output()?;
        return Ok(out.status.success());
    }

    if let Some(parent) = local_path.parent() {
        std::fs::create_dir_all(parent).context("create repo parent dir")?;
    }

    let auth_url = format!(
        "https://x-access-token:{token}@github.com/{}.git",
        repo.full_name
    );
    let out = Command::new("git")
        .args(["clone", &auth_url, &local_path.to_string_lossy()])
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .output()?;
    Ok(out.status.success())
}
