/// Git operations for the affected-cases analysis.
///
/// Scans commits and changed file paths since a base ref for references to case paths.
/// A case path reference is any substring matching a known case path (e.g. "auth/user-login")
/// found in a commit message or changed file path.
///
/// Falls back to flagging all cases when source files change with no explicit references.
use std::path::Path;
use std::process::Command;

use anyhow::Result;

fn git(repo: &Path, args: &[&str]) -> String {
    Command::new("git")
        .args(args)
        .current_dir(repo)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

/// Return the hash of the most recent commit that touched runs/.
pub fn last_run_commit(repo: &Path) -> Option<String> {
    let out = git(repo, &["log", "--oneline", "-1", "--", "runs/"]);
    out.split_whitespace().next().map(|s| s.to_owned())
}

/// Return commit messages since `base` as one big string.
fn commit_text_since(repo: &Path, base: &str) -> String {
    git(repo, &["log", &format!("{}..HEAD", base), "--format=%s %b"])
}

/// Return changed file paths since `base`.
pub fn changed_files_since(repo: &Path, base: &str) -> Vec<String> {
    git(repo, &["diff", "--name-only", &format!("{}..HEAD", base)])
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_owned())
        .collect()
}

/// True if a changed file path is likely to affect test outcomes.
/// Ignores documentation-only changes; treats source code changes as relevant.
fn is_source_relevant(path: &str) -> bool {
    let doc_extensions = [
        ".md",
        ".txt",
        ".gitignore",
        ".json",
        ".yaml",
        ".yml",
        ".toml",
    ];
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    // Changes inside cases/ are always relevant (case itself changed)
    if path.starts_with("cases/") {
        return true;
    }
    !doc_extensions.contains(&ext.as_str())
}

/// Find which known case paths are referenced in `text`.
fn refs_in_text<'a>(text: &str, known_paths: &'a [String]) -> Vec<&'a str> {
    known_paths
        .iter()
        .filter(|p| text.contains(p.as_str()))
        .map(|p| p.as_str())
        .collect()
}

#[derive(Debug)]
pub struct AffectedResult {
    /// Case paths that need re-running.
    pub case_paths: Vec<String>,
    /// Human-readable explanation.
    pub reason: String,
}

pub fn find_affected(
    repo: &Path,
    since_ref: Option<&str>,
    known_case_paths: &[String],
) -> Result<AffectedResult> {
    let base = match since_ref {
        Some(r) if !r.is_empty() => r.to_owned(),
        _ => match last_run_commit(repo) {
            Some(c) => c,
            None => {
                return Ok(AffectedResult {
                    case_paths: known_case_paths.to_vec(),
                    reason: "no test runs found; all cases flagged".to_owned(),
                });
            }
        },
    };

    let mut affected: Vec<String> = Vec::new();
    let mut reasons: Vec<String> = Vec::new();

    // Scan commit messages
    let commit_text = commit_text_since(repo, &base);
    let refs_from_commits = refs_in_text(&commit_text, known_case_paths);
    if !refs_from_commits.is_empty() {
        reasons.push(format!(
            "commit messages reference: {}",
            refs_from_commits.join(", ")
        ));
        for r in refs_from_commits {
            if !affected.contains(&r.to_owned()) {
                affected.push(r.to_owned());
            }
        }
    }

    // Scan changed file paths
    let changed = changed_files_since(repo, &base);
    for path in &changed {
        let refs = refs_in_text(path, known_case_paths);
        for r in refs {
            reasons.push(format!("file {path} references {r}"));
            if !affected.contains(&r.to_owned()) {
                affected.push(r.to_owned());
            }
        }
    }

    // If source files changed but no explicit case refs found, flag everything
    let source_changed: Vec<&str> = changed
        .iter()
        .filter(|p| is_source_relevant(p))
        .map(|p| p.as_str())
        .collect();

    if !source_changed.is_empty() && affected.is_empty() {
        reasons.push(format!(
            "{} source file(s) changed with no explicit case references — all {} case(s) flagged",
            source_changed.len(),
            known_case_paths.len()
        ));
        affected = known_case_paths.to_vec();
    }

    let reason = if reasons.is_empty() {
        "no relevant changes since last run".to_owned()
    } else {
        reasons.join("; ")
    };

    Ok(AffectedResult {
        case_paths: affected,
        reason,
    })
}
