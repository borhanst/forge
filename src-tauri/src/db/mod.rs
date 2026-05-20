pub mod migrations;
pub mod schema;

use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use anyhow::Result;
use std::fs;

pub async fn init(app_data_dir: &str) -> Result<SqlitePool> {
    fs::create_dir_all(app_data_dir)?;

    let db_path = format!("{}/forge.db", app_data_dir);
    let db_url = format!("sqlite://{}?mode=rwc", db_path);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    sqlx::query("PRAGMA journal_mode=WAL;")
        .execute(&pool)
        .await?;

    migrations::run(&pool).await?;

    Ok(pool)
}
