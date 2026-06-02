use sqlx::SqlitePool;
use anyhow::Result;
use crate::db::schema::AppSettings;

const SETTINGS_KEY: &str = "app";

pub async fn load(pool: &SqlitePool) -> Result<AppSettings> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = ?"
    )
    .bind(SETTINGS_KEY)
    .fetch_optional(pool)
    .await?;

    match row {
        Some((value,)) => Ok(serde_json::from_str(&value).unwrap_or_default()),
        None => Ok(AppSettings::default()),
    }
}

pub async fn save(pool: &SqlitePool, settings: &AppSettings) -> Result<()> {
    let value = serde_json::to_string(settings)?;
    sqlx::query(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        "#
    )
    .bind(SETTINGS_KEY)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}
