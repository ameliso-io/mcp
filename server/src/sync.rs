use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Deserialize;
use sqlx::PgPool;

use crate::repo::LoadedCase;

pub fn case_to_markdown(case: &LoadedCase) -> String {
    let tags_yaml = if case.tags.is_empty() {
        "tags: []".to_owned()
    } else {
        let items = case
            .tags
            .iter()
            .map(|t| format!("  - {t}"))
            .collect::<Vec<_>>()
            .join("\n");
        format!("tags:\n{items}")
    };
    format!(
        "---\ntitle: {}\ndescription: {}\n{tags_yaml}\npriority: {}\ncreated_at: {}\nupdated_at: {}\n---\n\n{}",
        case.title, case.description, case.priority, case.created_at, case.updated_at, case.body,
    )
}

#[derive(Debug, PartialEq)]
pub struct ParsedCase {
    pub case_path: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub priority: String,
    pub created_at: String,
    pub updated_at: String,
    pub body: String,
}

#[derive(Deserialize)]
struct FrontMatter {
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
}

fn default_priority() -> String {
    "medium".to_owned()
}

pub fn parse_case_markdown(file_path: &str, content: &str) -> Result<ParsedCase> {
    let case_path = file_path
        .strip_prefix("cases/")
        .and_then(|p| p.strip_suffix(".md"))
        .with_context(|| format!("file path must start with cases/ and end with .md: {file_path}"))?
        .to_owned();

    let text = content.trim_start();
    let rest = text
        .strip_prefix("---\n")
        .context("missing opening front matter delimiter")?;
    let (fm_str, body_with_prefix) = rest
        .split_once("\n---\n")
        .context("missing closing front matter delimiter")?;

    let fm: FrontMatter = serde_yaml::from_str(fm_str).context("invalid front matter YAML")?;

    let body = body_with_prefix.trim_start_matches('\n').to_owned();

    Ok(ParsedCase {
        case_path,
        title: fm.title,
        description: fm.description,
        tags: fm.tags,
        priority: fm.priority,
        created_at: fm.created_at,
        updated_at: fm.updated_at,
        body,
    })
}

pub fn parse_case_from_base64(file_path: &str, content_b64: &str) -> Result<ParsedCase> {
    let clean = content_b64.replace('\n', "");
    let bytes = BASE64.decode(clean).context("base64 decode failed")?;
    let content = String::from_utf8(bytes).context("file content is not valid UTF-8")?;
    parse_case_markdown(file_path, &content)
}

async fn get_token_and_parts(pool: &PgPool, repo_id: &str) -> Result<(String, String, String)> {
    let stored = crate::repos_store::get(pool, repo_id)
        .await?
        .with_context(|| format!("repository {repo_id} not found"))?;
    let cfg = crate::github::config().context("GitHub App not configured")?;
    let jwt = crate::github::generate_jwt(&cfg.app_id, &cfg.private_key)?;
    let token = crate::github::get_installation_token(&stored.installation_id, &jwt).await?;
    let parts: Vec<&str> = stored.full_name.splitn(2, '/').collect();
    anyhow::ensure!(
        parts.len() == 2,
        "invalid repo full_name: {}",
        stored.full_name
    );
    Ok((token, parts[0].to_owned(), parts[1].to_owned()))
}

pub async fn push_case(pool: &PgPool, repo_id: &str, case: &LoadedCase) -> Result<()> {
    let (token, owner, repo_name) = get_token_and_parts(pool, repo_id).await?;
    let file_path = format!("cases/{}.md", case.case_path);
    let markdown = case_to_markdown(case);
    let content_b64 = BASE64.encode(markdown.as_bytes());
    let existing = crate::github::get_file(&owner, &repo_name, &file_path, &token).await?;
    let sha = existing.as_ref().map(|(_, s)| s.as_str());
    let message = format!("chore(cases): upsert {}", case.case_path);
    match crate::github::put_file(
        &owner,
        &repo_name,
        &file_path,
        &content_b64,
        &message,
        sha,
        &token,
    )
    .await
    {
        Ok(()) => Ok(()),
        Err(e) if e.to_string().contains("HTTP 409") => {
            let current = crate::github::get_file(&owner, &repo_name, &file_path, &token).await?;
            let fresh_sha = current.as_ref().map(|(_, s)| s.as_str());
            crate::github::put_file(
                &owner,
                &repo_name,
                &file_path,
                &content_b64,
                &message,
                fresh_sha,
                &token,
            )
            .await
        }
        Err(e) => Err(e),
    }
}

pub async fn delete_case_file(pool: &PgPool, repo_id: &str, case_path: &str) -> Result<()> {
    let (token, owner, repo_name) = get_token_and_parts(pool, repo_id).await?;
    let file_path = format!("cases/{case_path}.md");
    let existing = crate::github::get_file(&owner, &repo_name, &file_path, &token).await?;
    let Some((_, sha)) = existing else {
        return Ok(());
    };
    let message = format!("chore(cases): delete {case_path}");
    crate::github::delete_file(&owner, &repo_name, &file_path, &message, &sha, &token).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::LoadedCase;

    fn sample_case() -> LoadedCase {
        LoadedCase {
            case_path: "auth/login".to_owned(),
            title: "User Login".to_owned(),
            description: "Verify login".to_owned(),
            tags: vec!["auth".to_owned(), "smoke".to_owned()],
            priority: "high".to_owned(),
            body: "## Steps\n\n1. Go to /login".to_owned(),
            created_at: "2026-04-21".to_owned(),
            updated_at: "2026-04-21".to_owned(),
        }
    }

    #[test]
    fn case_to_markdown_formats_correctly() {
        let md = case_to_markdown(&sample_case());
        assert!(md.starts_with("---\n"));
        assert!(md.contains("title: User Login"));
        assert!(md.contains("priority: high"));
        assert!(md.contains("  - auth"));
        assert!(md.contains("  - smoke"));
        assert!(md.contains("## Steps"));
    }

    #[test]
    fn case_to_markdown_empty_tags() {
        let mut c = sample_case();
        c.tags = vec![];
        let md = case_to_markdown(&c);
        assert!(md.contains("tags: []"));
    }

    #[test]
    fn parse_case_markdown_roundtrips() {
        let case = sample_case();
        let md = case_to_markdown(&case);
        let parsed = parse_case_markdown("cases/auth/login.md", &md).unwrap();
        assert_eq!(parsed.case_path, "auth/login");
        assert_eq!(parsed.title, "User Login");
        assert_eq!(parsed.description, "Verify login");
        assert_eq!(parsed.tags, vec!["auth", "smoke"]);
        assert_eq!(parsed.priority, "high");
        assert_eq!(parsed.body, "## Steps\n\n1. Go to /login");
    }

    #[test]
    fn parse_case_markdown_empty_tags_roundtrips() {
        let mut case = sample_case();
        case.tags = vec![];
        let md = case_to_markdown(&case);
        let parsed = parse_case_markdown("cases/auth/login.md", &md).unwrap();
        assert!(parsed.tags.is_empty());
    }

    #[test]
    fn parse_case_markdown_invalid_path_errors() {
        let err = parse_case_markdown("runs/foo.md", "---\ntitle: T\n---\n\nbody").unwrap_err();
        assert!(err.to_string().contains("cases/"));
    }

    #[test]
    fn parse_case_markdown_missing_open_delimiter_errors() {
        let err = parse_case_markdown("cases/a/b.md", "title: T\n---\n\nbody").unwrap_err();
        assert!(err.to_string().contains("opening"));
    }

    #[test]
    fn parse_case_markdown_missing_close_delimiter_errors() {
        let err = parse_case_markdown("cases/a/b.md", "---\ntitle: T\n\nbody").unwrap_err();
        assert!(err.to_string().contains("closing"));
    }

    #[test]
    fn parse_case_from_base64_roundtrips() {
        let case = sample_case();
        let md = case_to_markdown(&case);
        let b64 = BASE64.encode(md.as_bytes());
        let parsed = parse_case_from_base64("cases/auth/login.md", &b64).unwrap();
        assert_eq!(parsed.case_path, "auth/login");
        assert_eq!(parsed.title, "User Login");
    }

    #[test]
    fn parse_case_markdown_missing_priority_defaults_to_medium() {
        let content = "---\ntitle: No Priority Case\n---\n\nbody";
        let parsed = parse_case_markdown("cases/auth/login.md", content).unwrap();
        assert_eq!(parsed.priority, "medium");
    }

    #[test]
    fn parse_case_markdown_invalid_yaml_returns_error() {
        let content = "---\ntitle: [unclosed bracket\n---\n\nbody";
        let err = parse_case_markdown("cases/auth/login.md", content).unwrap_err();
        assert!(err.to_string().contains("invalid front matter YAML"));
    }

    #[test]
    fn parse_case_from_base64_invalid_base64_returns_error() {
        let err = parse_case_from_base64("cases/auth/login.md", "not!!valid%%base64").unwrap_err();
        assert!(err.to_string().contains("base64 decode failed"));
    }

    #[test]
    fn parse_case_from_base64_invalid_utf8_returns_error() {
        // Valid base64 encoding of invalid UTF-8 bytes.
        let invalid_utf8 = BASE64.encode([0xFF, 0xFE]);
        let err = parse_case_from_base64("cases/auth/login.md", &invalid_utf8).unwrap_err();
        assert!(err.to_string().contains("not valid UTF-8"));
    }
}
