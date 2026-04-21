use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredRepo {
    pub id: String,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub local_path: String,
    pub installation_id: String,
    pub cloned: bool,
    pub added_at: String,
}

pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("AMELISO_DATA_DIR") {
        PathBuf::from(dir)
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".ameliso")
    }
}

pub fn repos_dir() -> PathBuf {
    data_dir().join("repos")
}

fn store_path() -> PathBuf {
    data_dir().join("repos.json")
}

pub fn load() -> Vec<StoredRepo> {
    let path = store_path();
    if !path.exists() {
        return vec![];
    }
    let data = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

pub fn save(repos: &[StoredRepo]) {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).ok();
    let data = serde_json::to_string_pretty(repos).unwrap_or_default();
    std::fs::write(store_path(), data).ok();
}

pub fn add_or_update(repo: StoredRepo) {
    let mut repos = load();
    match repos.iter_mut().find(|r| r.id == repo.id) {
        Some(existing) => *existing = repo,
        None => repos.push(repo),
    }
    save(&repos);
}

pub fn remove(id: &str) {
    let mut repos = load();
    repos.retain(|r| r.id != id);
    save(&repos);
}
