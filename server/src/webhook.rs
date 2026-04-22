use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sqlx::PgPool;
use std::sync::Arc;

pub struct WebhookState {
    pub pool: PgPool,
    pub secret: Option<String>,
}

fn verify_signature(secret: &str, body: &[u8], sig_header: &str) -> bool {
    let sig_hex = match sig_header.strip_prefix("sha256=") {
        Some(s) => s,
        None => return false,
    };
    let Ok(sig_bytes) = hex::decode(sig_hex) else {
        return false;
    };
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(body);
    mac.verify_slice(&sig_bytes).is_ok()
}

#[derive(serde::Deserialize)]
struct PushPayload {
    #[serde(default)]
    commits: Vec<Commit>,
    repository: Repo,
}

#[derive(serde::Deserialize)]
struct Commit {
    #[serde(default)]
    added: Vec<String>,
    #[serde(default)]
    modified: Vec<String>,
    #[serde(default)]
    removed: Vec<String>,
}

#[derive(serde::Deserialize)]
struct Repo {
    full_name: String,
}

fn is_case_file(path: &str) -> bool {
    path.starts_with("cases/") && path.ends_with(".md")
}

fn collect_case_changes(
    commits: &[Commit],
) -> (
    std::collections::HashSet<String>,
    std::collections::HashSet<String>,
) {
    let mut upsert: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut remove: std::collections::HashSet<String> = std::collections::HashSet::new();
    for commit in commits {
        for path in commit.added.iter().chain(commit.modified.iter()) {
            if is_case_file(path) {
                upsert.insert(path.clone());
            }
        }
        for path in &commit.removed {
            if is_case_file(path) {
                upsert.remove(path);
                remove.insert(path.clone());
            }
        }
    }
    (upsert, remove)
}

pub async fn github_push(
    State(state): State<Arc<WebhookState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    if let Some(ref secret) = state.secret {
        let sig = headers
            .get("x-hub-signature-256")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !verify_signature(secret, &body, sig) {
            return (StatusCode::UNAUTHORIZED, "invalid signature");
        }
    }

    let payload: PushPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("webhook: json parse error: {e}");
            return (StatusCode::BAD_REQUEST, "invalid payload");
        }
    };

    let repo_id = payload.repository.full_name.clone();

    let (upsert, remove) = collect_case_changes(&payload.commits);

    if upsert.is_empty() && remove.is_empty() {
        return (StatusCode::OK, "no case files changed");
    }

    let token_result = get_token(&state.pool, &repo_id).await;
    let (token, owner, repo_name) = match token_result {
        Ok(t) => t,
        Err(e) => {
            eprintln!("webhook: token error for {repo_id}: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "token error");
        }
    };

    for file_path in &upsert {
        if let Err(e) =
            process_upsert(&state.pool, &repo_id, &owner, &repo_name, &token, file_path).await
        {
            eprintln!("webhook: upsert failed for {file_path}: {e}");
        }
    }

    for file_path in &remove {
        let case_path = match file_path
            .strip_prefix("cases/")
            .and_then(|p| p.strip_suffix(".md"))
        {
            Some(p) => p,
            None => continue,
        };
        if let Err(e) = crate::repo::delete_case_if_exists(&state.pool, &repo_id, case_path).await {
            eprintln!("webhook: delete failed for {case_path}: {e}");
        }
    }

    (StatusCode::OK, "ok")
}

async fn get_token(pool: &PgPool, repo_id: &str) -> anyhow::Result<(String, String, String)> {
    use anyhow::Context as _;
    let stored = crate::repos_store::get(pool, repo_id)
        .await?
        .with_context(|| format!("repository {repo_id} not found"))?;
    let cfg = crate::github::config().context("GitHub App not configured")?;
    let jwt = crate::github::generate_jwt(&cfg.app_id, &cfg.private_key)?;
    let token = crate::github::get_installation_token(&stored.installation_id, &jwt).await?;
    let parts: Vec<&str> = stored.full_name.splitn(2, '/').collect();
    anyhow::ensure!(parts.len() == 2, "invalid full_name: {}", stored.full_name);
    Ok((token, parts[0].to_owned(), parts[1].to_owned()))
}

async fn process_upsert(
    pool: &PgPool,
    repo_id: &str,
    owner: &str,
    repo_name: &str,
    token: &str,
    file_path: &str,
) -> anyhow::Result<()> {
    let file = crate::github::get_file(owner, repo_name, file_path, token).await?;
    let (content_b64, _) = match file {
        Some(f) => f,
        None => return Ok(()),
    };
    let parsed = crate::sync::parse_case_from_base64(file_path, &content_b64)?;
    crate::repo::upsert_case(
        pool,
        repo_id,
        &parsed.case_path,
        &parsed.title,
        &parsed.description,
        parsed.tags,
        &parsed.priority,
        &parsed.body,
        &parsed.created_at,
        &parsed.updated_at,
    )
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_signature_valid() {
        // echo -n "payload" | openssl dgst -sha256 -hmac "secret"
        let body = b"payload";
        let secret = "secret";
        // Compute expected
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let hex = hex::encode(mac.finalize().into_bytes());
        let header = format!("sha256={hex}");
        assert!(verify_signature(secret, body, &header));
    }

    #[test]
    fn verify_signature_wrong_secret() {
        let body = b"payload";
        let mut mac = Hmac::<Sha256>::new_from_slice(b"secret").unwrap();
        mac.update(body);
        let hex = hex::encode(mac.finalize().into_bytes());
        let header = format!("sha256={hex}");
        assert!(!verify_signature("wrong", body, &header));
    }

    #[test]
    fn verify_signature_missing_prefix() {
        assert!(!verify_signature("secret", b"payload", "invalidsig"));
    }

    #[test]
    fn verify_signature_invalid_hex() {
        assert!(!verify_signature(
            "secret",
            b"payload",
            "sha256=notvalidhex!!"
        ));
    }

    // GitHub's documented test vector from:
    // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
    #[test]
    fn verify_signature_github_test_vector() {
        let secret = "It's a Secret to Everybody";
        let payload = b"Hello, World!";
        let sig = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
        assert!(verify_signature(secret, payload, sig));
    }

    #[test]
    fn is_case_file_matches() {
        assert!(is_case_file("cases/auth/login.md"));
        assert!(is_case_file("cases/smoke.md"));
    }

    #[test]
    fn is_case_file_rejects_others() {
        assert!(!is_case_file("runs/2026-01-01.md"));
        assert!(!is_case_file("cases/auth/login.txt"));
        assert!(!is_case_file("README.md"));
    }

    fn commit(
        added: &[&str],
        modified: &[&str],
        removed: &[&str],
    ) -> Commit {
        Commit {
            added: added.iter().map(|s| s.to_string()).collect(),
            modified: modified.iter().map(|s| s.to_string()).collect(),
            removed: removed.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn collect_case_changes_added_case_goes_to_upsert() {
        let commits = vec![commit(&["cases/auth/login.md"], &[], &[])];
        let (upsert, remove) = collect_case_changes(&commits);
        assert!(upsert.contains("cases/auth/login.md"));
        assert!(remove.is_empty());
    }

    #[test]
    fn collect_case_changes_modified_case_goes_to_upsert() {
        let commits = vec![commit(&[], &["cases/auth/login.md"], &[])];
        let (upsert, remove) = collect_case_changes(&commits);
        assert!(upsert.contains("cases/auth/login.md"));
        assert!(remove.is_empty());
    }

    #[test]
    fn collect_case_changes_removed_case_goes_to_remove() {
        let commits = vec![commit(&[], &[], &["cases/auth/login.md"])];
        let (upsert, remove) = collect_case_changes(&commits);
        assert!(upsert.is_empty());
        assert!(remove.contains("cases/auth/login.md"));
    }

    #[test]
    fn collect_case_changes_non_case_files_ignored() {
        let commits = vec![commit(&["src/main.rs", "README.md"], &[], &[])];
        let (upsert, remove) = collect_case_changes(&commits);
        assert!(upsert.is_empty());
        assert!(remove.is_empty());
    }

    #[test]
    fn collect_case_changes_add_then_remove_lands_in_remove_only() {
        let commits = vec![
            commit(&["cases/auth/login.md"], &[], &[]),
            commit(&[], &[], &["cases/auth/login.md"]),
        ];
        let (upsert, remove) = collect_case_changes(&commits);
        assert!(!upsert.contains("cases/auth/login.md"));
        assert!(remove.contains("cases/auth/login.md"));
    }

    #[test]
    fn collect_case_changes_empty_commits_returns_empty() {
        let (upsert, remove) = collect_case_changes(&[]);
        assert!(upsert.is_empty());
        assert!(remove.is_empty());
    }
}
