use anyhow::anyhow;
use sqlx::PgPool;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct StoredRepo {
    pub id: String,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub installation_id: String,
    pub added_at: String,
}

fn map_db(e: sqlx::Error) -> anyhow::Error {
    anyhow!(e)
}

pub async fn load(pool: &PgPool) -> anyhow::Result<Vec<StoredRepo>> {
    sqlx::query_as::<_, StoredRepo>(
        "SELECT id, name, full_name, html_url, installation_id, added_at
         FROM repositories ORDER BY added_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_db)
}

pub async fn get(pool: &PgPool, id: &str) -> anyhow::Result<Option<StoredRepo>> {
    sqlx::query_as::<_, StoredRepo>(
        "SELECT id, name, full_name, html_url, installation_id, added_at
         FROM repositories WHERE id=$1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(map_db)
}

pub async fn add_or_update(pool: &PgPool, repo: &StoredRepo) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO repositories (id, name, full_name, html_url, installation_id, added_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
             name=$2, full_name=$3, html_url=$4, installation_id=$5",
    )
    .bind(&repo.id)
    .bind(&repo.name)
    .bind(&repo.full_name)
    .bind(&repo.html_url)
    .bind(&repo.installation_id)
    .bind(&repo.added_at)
    .execute(pool)
    .await
    .map_err(map_db)?;
    Ok(())
}

pub async fn remove(pool: &PgPool, id: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM repositories WHERE id=$1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(map_db)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    fn lazy_pool() -> PgPool {
        PgPoolOptions::new()
            .connect_lazy("postgres://user:pass@localhost/db_does_not_exist")
            .expect("lazy pool")
    }

    fn sample_repo() -> StoredRepo {
        StoredRepo {
            id: "owner/repo".to_owned(),
            name: "repo".to_owned(),
            full_name: "owner/repo".to_owned(),
            html_url: "https://github.com/owner/repo".to_owned(),
            installation_id: "inst-1".to_owned(),
            added_at: "2026-04-21T00:00:00Z".to_owned(),
        }
    }

    #[tokio::test]
    async fn load_returns_db_error_when_no_connection() {
        let err = load(&lazy_pool()).await.unwrap_err();
        assert!(err.to_string().contains("pool") || !err.to_string().is_empty());
    }

    #[tokio::test]
    async fn get_returns_db_error_when_no_connection() {
        let err = get(&lazy_pool(), "owner/repo").await.unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[tokio::test]
    async fn add_or_update_returns_db_error_when_no_connection() {
        let err = add_or_update(&lazy_pool(), &sample_repo())
            .await
            .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[tokio::test]
    async fn remove_returns_db_error_when_no_connection() {
        let err = remove(&lazy_pool(), "owner/repo").await.unwrap_err();
        assert!(!err.to_string().is_empty());
    }
}
