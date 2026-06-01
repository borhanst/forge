use rand::seq::SliceRandom;
use uuid::Uuid;
use chrono::Utc;
use sqlx::SqlitePool;
use anyhow::Result;
use crate::db::schema::Workspace;

const CITY_NAMES: &[&str] = &[
    "Tokyo", "Oslo", "Nairobi", "Lima", "Vienna", "Lagos", "Seoul",
    "Lisbon", "Cairo", "Prague", "Sydney", "Helsinki", "Dubai", "Warsaw",
    "Bogota", "Athens", "Accra", "Beirut", "Hanoi", "Zurich", "Tunis",
    "Manila", "Riyadh", "Budapest", "Colombo", "Dakar", "Tbilisi",
    "Reykjavik", "Montevideo", "Almaty", "Kathmandu", "Harare", "Minsk",
    "Yerevan", "Tashkent", "Baku", "Bishkek", "Ulaanbaatar", "Lusaka",
];

pub fn generate_city_name(existing: &[String]) -> String {
    let mut rng = rand::thread_rng();
    let available: Vec<&&str> = CITY_NAMES
        .iter()
        .filter(|c| !existing.contains(&c.to_string()))
        .collect();

    if let Some(city) = available.choose(&mut rng) {
        city.to_string()
    } else {
        format!("{}-{}", CITY_NAMES.choose(&mut rng).unwrap(), rand::random::<u16>())
    }
}

pub fn make_branch_name(city_name: &str) -> String {
    format!("forge/{}", city_name.to_lowercase())
}

pub async fn create_workspace(
    pool: &SqlitePool,
    repo_id: &str,
    provider: &str,
    provider_config: Option<&str>,
    worktree_base: &str,
) -> Result<Workspace> {
    let existing: Vec<String> = sqlx::query_scalar!(
        "SELECT city_name FROM workspaces WHERE repo_id = ?",
        repo_id
    )
    .fetch_all(pool)
    .await?;

    let city_name = generate_city_name(&existing);
    let branch    = make_branch_name(&city_name);
    let ws_id     = Uuid::new_v4().to_string();
    let worktree_path = format!("{}/{}", worktree_base, city_name.to_lowercase());
    let now       = Utc::now().naive_utc();

    sqlx::query!(
        r#"INSERT INTO workspaces
           (id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'idle', ?)"#,
        ws_id, repo_id, city_name, branch, worktree_path, provider, provider_config, now
    )
    .execute(pool)
    .await?;

    let ws = sqlx::query_as!(
        Workspace,
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE id = ?",
        ws_id
    )
    .fetch_one(pool)
    .await?;

    Ok(ws)
}

pub async fn archive_workspace(pool: &SqlitePool, workspace_id: &str) -> Result<()> {
    let now = Utc::now().naive_utc();
    sqlx::query!(
        "UPDATE workspaces SET status = 'archived', archived_at = ? WHERE id = ?",
        now, workspace_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_workspace_record(pool: &SqlitePool, workspace_id: &str) -> Result<()> {
    sqlx::query!("DELETE FROM workspaces WHERE id = ?", workspace_id)
        .execute(pool)
        .await?;
    Ok(())
}
