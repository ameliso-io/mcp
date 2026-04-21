use anyhow::{Context, Result};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

fn github_api_base() -> String {
    std::env::var("AMELISO_GITHUB_API").unwrap_or_else(|_| "https://api.github.com".to_owned())
}

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
    let base = github_api_base();
    let raw = client
        .post(format!(
            "{base}/app/installations/{installation_id}/access_tokens"
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
    total_count: usize,
    repositories: Vec<GitHubRepo>,
}

pub async fn list_installation_repos(token: &str) -> Result<Vec<GitHubRepo>> {
    let client = reqwest::Client::new();
    let base = github_api_base();
    let mut all: Vec<GitHubRepo> = Vec::new();
    let mut page = 1u32;
    loop {
        let resp: RepoListResponse = client
            .get(format!("{base}/installation/repositories"))
            .query(&[("per_page", "100"), ("page", &page.to_string())])
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
        let done = resp.repositories.len() < 100
            || all.len() + resp.repositories.len() >= resp.total_count;
        all.extend(resp.repositories);
        if done {
            break;
        }
        page += 1;
    }
    Ok(all)
}

pub async fn get_repo(full_name: &str, token: &str) -> Result<GitHubRepo> {
    let client = reqwest::Client::new();
    let base = github_api_base();
    let repo: GitHubRepo = client
        .get(format!("{base}/repos/{full_name}"))
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
// App installations
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug, Clone)]
pub struct AppInstallation {
    pub id: u64,
}

pub async fn list_app_installations(jwt: &str) -> Result<Vec<AppInstallation>> {
    let client = reqwest::Client::new();
    let base = github_api_base();
    let installations: Vec<AppInstallation> = client
        .get(format!("{base}/app/installations"))
        .header("Authorization", format!("Bearer {jwt}"))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "ameliso/1.0")
        .send()
        .await
        .context("request failed")?
        .error_for_status()
        .context("list app installations: bad status")?
        .json()
        .await
        .context("list app installations: parse error")?;
    Ok(installations)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Serialize env-var tests so parallel test threads don't stomp each other.
    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    // RSA-2048 test private key (PKCS#1 PEM) — not used in production.
    const TEST_RSA_KEY: &str = "-----BEGIN RSA PRIVATE KEY-----\n\
MIIEpAIBAAKCAQEAw2wv7U6rRzygvVk2OyQRdZQTQbXtlA0HeouzaH8r9kDxUhy4\n\
wsI7FbxDhgC2o7jJa9SA8K8sapGPsCXv4ve9gjV8JOUdKSGobutcqdnBB9fhS+CZ\n\
Kp77IUMaCDGx2cA/CPpOOpsgMho8c+vzxdQIsQjK4h/8Pb7MHCt9AlOJeWj6ljQv\n\
fTV6HI9+ljFkyBbW9VqCKiMmytqDI59d39Dy5t4+z7s7rCiNTKFF5AM/wIXoVE5q\n\
pA29cyWG+V1Ou1jqUsFQ7lOWn6ZNphswQI0AYhMXKRr6uO+HXbi2U1FLOwzFg8gv\n\
m5A76WLypoP5bCVo1Db+BLsYm5hzJnqTYIRE+wIDAQABAoIBAAN+p8zCn2WCvA0m\n\
z0V3e6hyoXWHX1xKb1vNq8Ouooag2q/xO4ygFJZq63o2AQ4ke9Wl0zh6qXyuZbds\n\
tkGE1KrDchjm0AKwS2bQZrPS5RTS04Cb36FXfn41yP1khh2yxm3OrB94Lrc2qOYZ\n\
zh43kIA5/AbXM5eXFedbD70+6TJ2miH3SlPP2PHxzc9dFdM6zqDfmI7JgWBiE0hL\n\
ekISqJhDdyvug8nS0qY7lV0ERC08P/tLpNDrnMHw+T+s7PAcjs292oG2T/YWLjKr\n\
pD6/N42V2dr6glczy3YCyDyNGugasOnDQLgLx9qnJJ9Xn5oWoFp81973CKMlUQk/\n\
UgRXuEECgYEA62RoQRBexbBpi3WKAxUH5ud2K0kDy0vRumdfgQbsOajO940GOlv/\n\
ARTY75S2RVdVcYNnY1pZzRDYis9UrgePcjH1KAgk44f6nQegyML1Ye22Lrvcv6Dj\n\
UXEmrYZexZQ4Ru0XKm5GB5pJ84a61oLeULwQUdMQq4qBHX6rQHra8WkCgYEA1If7\n\
7AAFuGZOMcfGk27FI6xsU7zZbI7hii76R/nlA757vjfaouChJONq7/QT7PoiOAHp\n\
oBDRR2qo5w2ZiAL4A2vLO1eWTocJ/VIQDBobDF42lh2nqa68HtAfFg1PQTzCzEAo\n\
LYVtLMmjM+DS+ligjc2fmsLxSMSmlcAyNwL9EsMCgYBXRMVmAdSxBANNQcll9SEV\n\
2RA1Yf93Gmfp7LM6mb9wbQY2PuFlN4Al/X2j7QVaVdOGnwnwiqmqXil55P3m+0SS\n\
OLVEHyjV9i7SkuZoJ+djZAbb8qgXn2VHZ2TIhn2SUK5AlVu2TmXGIcxy7atNJf2X\n\
/vEp9M9EWbgeoDyLTkDnqQKBgQDG8lRcYtj3+KyR5NR6BmL8Nddhu5I8ELQHyln3\n\
LnG2w4TKVzaO6X9vLINaAzzzxGJr0z6C27tMAwgA4bYqn7zSVwFzl1XYRIiRXVQw\n\
P++58Cdg9nmQWUU4AtJWrjbWdq5SzGvP0OqV1lqzoW1dc8E3fJg/IuUCnTLjU3qu\n\
DFoiSQKBgQC+6WUAq6YpaxGmD/QwJlYu6KVZWy58hwLyIwB18PuFR3bwwmYo6iM+\n\
ZxGHjlrdx5cq2mEfhNzgFSuQfPuRO6BNmcIUIRH8zj/kUVr2c0h43UxKVirl0pdU\n\
jCzFIYdciSH3XQUnT03k+b+uOCYpQlu6Xce8POyogm1+5kfLefwP0A==\n\
-----END RSA PRIVATE KEY-----";

    #[test]
    fn config_returns_none_when_env_vars_absent() {
        let _g = ENV_LOCK.lock().unwrap();
        unsafe {
            std::env::remove_var("GITHUB_APP_ID");
            std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
        }
        assert!(config().is_none());
    }

    #[test]
    fn config_returns_some_when_env_vars_present() {
        let _g = ENV_LOCK.lock().unwrap();
        unsafe {
            std::env::set_var("GITHUB_APP_ID", "my-app");
            std::env::set_var("GITHUB_APP_PRIVATE_KEY", "my-key");
            std::env::remove_var("GITHUB_APP_INSTALLATION_URL");
            std::env::remove_var("GITHUB_APP_NAME");
        }
        let cfg = config().expect("config should be Some");
        assert_eq!(cfg.app_id, "my-app");
        assert_eq!(cfg.private_key, "my-key");
        assert!(cfg.installation_url.contains("ameliso"));
        unsafe {
            std::env::remove_var("GITHUB_APP_ID");
            std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
        }
    }

    #[test]
    fn config_uses_custom_installation_url() {
        let _g = ENV_LOCK.lock().unwrap();
        unsafe {
            std::env::set_var("GITHUB_APP_ID", "my-app");
            std::env::set_var("GITHUB_APP_PRIVATE_KEY", "my-key");
            std::env::set_var("GITHUB_APP_INSTALLATION_URL", "https://example.com/install");
        }
        let cfg = config().expect("config should be Some");
        assert_eq!(cfg.installation_url, "https://example.com/install");
        unsafe {
            std::env::remove_var("GITHUB_APP_ID");
            std::env::remove_var("GITHUB_APP_PRIVATE_KEY");
            std::env::remove_var("GITHUB_APP_INSTALLATION_URL");
        }
    }

    #[test]
    fn generate_jwt_returns_err_for_invalid_key() {
        let result = generate_jwt("app-id", "not-a-valid-pem");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("invalid RSA private key"));
    }

    #[test]
    fn generate_jwt_returns_ok_for_valid_key() {
        let token = generate_jwt("test-app", TEST_RSA_KEY);
        assert!(token.is_ok(), "expected Ok, got: {:?}", token.err());
        let t = token.unwrap();
        // JWT has 3 dot-separated parts
        assert_eq!(t.split('.').count(), 3);
    }

    // -----------------------------------------------------------------------
    // HTTP client tests (wiremock)
    // -----------------------------------------------------------------------

    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn fake_repo_json(name: &str) -> serde_json::Value {
        serde_json::json!({
            "id": 1,
            "name": name,
            "full_name": format!("owner/{name}"),
            "html_url": format!("https://github.com/owner/{name}"),
            "clone_url": format!("https://github.com/owner/{name}.git"),
            "private": false
        })
    }

    #[tokio::test]
    async fn get_installation_token_returns_token_on_success() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        Mock::given(method("POST"))
            .and(path("/app/installations/42/access_tokens"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"token": "ghs_test_token"})),
            )
            .mount(&server)
            .await;

        let result = get_installation_token("42", "my-jwt").await;
        assert_eq!(result.unwrap(), "ghs_test_token");
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }

    #[tokio::test]
    async fn get_installation_token_errors_on_http_failure() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        Mock::given(method("POST"))
            .and(path("/app/installations/99/access_tokens"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&server)
            .await;

        let result = get_installation_token("99", "bad-jwt").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("HTTP 401"));
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }

    #[tokio::test]
    async fn list_installation_repos_returns_repos() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        Mock::given(method("GET"))
            .and(path("/installation/repositories"))
            .and(query_param("page", "1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "total_count": 1,
                "repositories": [fake_repo_json("my-repo")]
            })))
            .mount(&server)
            .await;

        let result = list_installation_repos("tok").await;
        let repos = result.unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "my-repo");
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }

    #[tokio::test]
    async fn list_installation_repos_paginates() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        // First page: 100 repos (triggers pagination)
        let page1: Vec<_> = (0..100)
            .map(|i| fake_repo_json(&format!("repo-{i}")))
            .collect();
        Mock::given(method("GET"))
            .and(path("/installation/repositories"))
            .and(query_param("page", "1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "total_count": 101,
                "repositories": page1
            })))
            .mount(&server)
            .await;
        // Second page: 1 repo
        Mock::given(method("GET"))
            .and(path("/installation/repositories"))
            .and(query_param("page", "2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "total_count": 101,
                "repositories": [fake_repo_json("repo-100")]
            })))
            .mount(&server)
            .await;

        let result = list_installation_repos("tok").await;
        assert_eq!(result.unwrap().len(), 101);
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }

    #[tokio::test]
    async fn get_repo_returns_repo() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        Mock::given(method("GET"))
            .and(path("/repos/owner/my-repo"))
            .respond_with(ResponseTemplate::new(200).set_body_json(fake_repo_json("my-repo")))
            .mount(&server)
            .await;

        let result = get_repo("owner/my-repo", "tok").await;
        assert_eq!(result.unwrap().name, "my-repo");
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }

    #[tokio::test]
    async fn list_app_installations_returns_installations() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        Mock::given(method("GET"))
            .and(path("/app/installations"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!([{"id": 7}, {"id": 8}])),
            )
            .mount(&server)
            .await;

        let result = list_app_installations("my-jwt").await;
        let installs = result.unwrap();
        assert_eq!(installs.len(), 2);
        assert_eq!(installs[0].id, 7);
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }

    #[tokio::test]
    async fn compare_returns_commits_and_files() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        Mock::given(method("GET"))
            .and(path("/repos/owner/repo/compare/abc123...HEAD"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "commits": [
                    {"commit": {"message": "fix: bug"}},
                    {"commit": {"message": "feat: thing"}}
                ],
                "files": [
                    {"filename": "src/main.rs"},
                    {"filename": "README.md"}
                ]
            })))
            .mount(&server)
            .await;

        let result = compare("owner", "repo", "abc123", "tok").await;
        let cr = result.unwrap();
        assert_eq!(cr.commit_messages, vec!["fix: bug", "feat: thing"]);
        assert_eq!(cr.changed_files, vec!["src/main.rs", "README.md"]);
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }

    #[tokio::test]
    async fn compare_errors_on_http_failure() {
        let _g = ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        unsafe {
            std::env::set_var("AMELISO_GITHUB_API", server.uri());
        }
        Mock::given(method("GET"))
            .and(path("/repos/owner/repo/compare/abc123...HEAD"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let result = compare("owner", "repo", "abc123", "tok").await;
        assert!(result.is_err(), "expected an error for 404 response");
        let msg = format!("{:#}", result.err().unwrap());
        assert!(
            msg.contains("compare: bad status") || msg.contains("404"),
            "err: {msg}"
        );
        unsafe {
            std::env::remove_var("AMELISO_GITHUB_API");
        }
    }
}

pub async fn compare(owner: &str, repo: &str, base: &str, token: &str) -> Result<CompareResult> {
    let client = reqwest::Client::new();
    let api = github_api_base();
    let resp: CompareResponse = client
        .get(format!("{api}/repos/{owner}/{repo}/compare/{base}...HEAD"))
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
