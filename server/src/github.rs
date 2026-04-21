use anyhow::{Context, Result};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
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

#[derive(Deserialize)]
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

pub async fn get_repo(full_name: &str, token: &str) -> Result<GitHubRepo> {
    let client = reqwest::Client::new();
    let repo: GitHubRepo = client
        .get(format!("https://api.github.com/repos/{full_name}"))
        .header("Authorization", format!("token {token}"))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "ameliso/1.0")
        .send()
        .await
        .context("request failed")?
        .error_for_status()
        .context("get repo: bad status")?
        .json()
        .await
        .context("get repo: parse error")?;
    Ok(repo)
}

// ---------------------------------------------------------------------------
// Compare API for affected-cases analysis
// ---------------------------------------------------------------------------

pub struct CompareResult {
    pub commit_messages: Vec<String>,
    pub changed_files: Vec<String>,
}

#[derive(Deserialize)]
struct CompareResponse {
    commits: Vec<CommitWrapper>,
    #[serde(default)]
    files: Vec<ChangedFile>,
}

#[derive(Deserialize)]
struct CommitWrapper {
    commit: CommitData,
}

#[derive(Deserialize)]
struct CommitData {
    message: String,
}

#[derive(Deserialize)]
struct ChangedFile {
    filename: String,
}

pub async fn compare(owner: &str, repo: &str, base: &str, token: &str) -> Result<CompareResult> {
    let client = reqwest::Client::new();
    let resp: CompareResponse = client
        .get(format!(
            "https://api.github.com/repos/{owner}/{repo}/compare/{base}...HEAD"
        ))
        .header("Authorization", format!("token {token}"))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "ameliso/1.0")
        .send()
        .await
        .context("compare request failed")?
        .error_for_status()
        .context("compare: bad status")?
        .json()
        .await
        .context("compare: parse error")?;

    Ok(CompareResult {
        commit_messages: resp.commits.into_iter().map(|c| c.commit.message).collect(),
        changed_files: resp.files.into_iter().map(|f| f.filename).collect(),
    })
}
