use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use serde_json::Value;

const DATABASE_SCHEMA_VERSION: i64 = 1;
const DATABASE_BACKUP_LIMIT: i64 = 20;
const FILE_BACKUP_LIMIT: usize = 10;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("데이터 폴더를 열 수 없습니다: {0}")]
    Io(#[from] std::io::Error),
    #[error("SQLite 저장소를 처리할 수 없습니다: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("저장할 데이터가 올바른 JSON이 아닙니다: {0}")]
    Json(#[from] serde_json::Error),
    #[error("지원하지 않는 Daymark 데이터 형식입니다.")]
    UnsupportedSchema,
    #[error("데이터 변경 번호를 확인할 수 없습니다.")]
    InvalidRevision,
    #[error("REVISION_CONFLICT: {0}")]
    RevisionConflict(String),
    #[error("저장소 잠금이 손상되었습니다.")]
    LockPoisoned,
}

pub type StorageResult<T> = Result<T, StorageError>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub id: i64,
    pub created_at: String,
    pub label: String,
    pub data_json: String,
}

pub struct DaymarkDatabase {
    connection: Mutex<Connection>,
    backup_directory: PathBuf,
}

impl DaymarkDatabase {
    pub fn open(data_directory: &Path) -> StorageResult<Self> {
        fs::create_dir_all(data_directory)?;
        let backup_directory = data_directory.join("backups");
        fs::create_dir_all(&backup_directory)?;

        let connection = Connection::open(data_directory.join("daymark.sqlite3"))?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        migrate(&connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
            backup_directory,
        })
    }

    pub fn load(&self) -> StorageResult<Option<String>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| StorageError::LockPoisoned)?;
        connection
            .query_row("SELECT data_json FROM documents WHERE id = 1", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(Into::into)
    }

    pub fn save(&self, data_json: &str, expected_revision: Option<i64>) -> StorageResult<()> {
        let next_revision = validate_document(data_json)?;
        if let Some(expected) = expected_revision {
            if next_revision != expected + 1 {
                return Err(StorageError::InvalidRevision);
            }
        } else if next_revision != 0 {
            return Err(StorageError::InvalidRevision);
        }

        let mut connection = self
            .connection
            .lock()
            .map_err(|_| StorageError::LockPoisoned)?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let existing: Option<(i64, String)> = transaction
            .query_row(
                "SELECT revision, data_json FROM documents WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        match (&existing, expected_revision) {
            (None, None) => {}
            (Some((actual, _)), Some(expected)) if *actual == expected => {}
            (None, Some(expected)) => {
                return Err(StorageError::RevisionConflict(format!(
                    "저장 데이터가 없습니다. 예상 변경 번호: {expected}"
                )));
            }
            (Some((actual, _)), expected) => {
                return Err(StorageError::RevisionConflict(format!(
                    "현재 변경 번호는 {actual}, 이 창이 예상한 번호는 {}입니다.",
                    expected
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "없음".to_string())
                )));
            }
        }

        let now = timestamp();
        if let Some((_, previous_json)) = existing {
            transaction.execute(
                "INSERT INTO backups(created_at, label, data_json)
                 VALUES (?1, '변경 전 자동 백업', ?2)",
                params![now, previous_json],
            )?;
        }
        transaction.execute(
            "INSERT INTO documents(id, revision, data_json, updated_at)
             VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
               revision = excluded.revision,
               data_json = excluded.data_json,
               updated_at = excluded.updated_at",
            params![next_revision, data_json, now],
        )?;
        prune_database_backups(&transaction)?;
        // A file-backup failure must abort the SQLite transaction. Returning an
        // error after commit would make the caller retry with a stale revision.
        self.write_file_backup(data_json, next_revision)?;
        transaction.commit()?;
        drop(connection);

        // Retention cleanup is best-effort because the durable SQLite commit has
        // already succeeded. Old extra backups are safer than a false save error.
        if let Err(error) = self.prune_file_backups() {
            eprintln!("Daymark could not prune old file backups: {error}");
        }
        Ok(())
    }

    pub fn create_backup(&self, data_json: &str, label: &str) -> StorageResult<()> {
        validate_document(data_json)?;
        let connection = self
            .connection
            .lock()
            .map_err(|_| StorageError::LockPoisoned)?;
        connection.execute(
            "INSERT INTO backups(created_at, label, data_json)
             VALUES (?1, ?2, ?3)",
            params![timestamp(), normalized_label(label, "수동 백업"), data_json],
        )?;
        connection.execute(
            "DELETE FROM backups
             WHERE id NOT IN (
               SELECT id FROM backups ORDER BY id DESC LIMIT ?1
             )",
            [DATABASE_BACKUP_LIMIT],
        )?;
        Ok(())
    }

    pub fn list_backups(&self) -> StorageResult<Vec<BackupRecord>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| StorageError::LockPoisoned)?;
        let mut statement = connection.prepare(
            "SELECT id, created_at, label, data_json
             FROM backups
             ORDER BY id DESC
             LIMIT ?1",
        )?;
        let records = statement
            .query_map([DATABASE_BACKUP_LIMIT], |row| {
                Ok(BackupRecord {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    label: row.get(2)?,
                    data_json: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(records)
    }

    fn write_file_backup(&self, data_json: &str, revision: i64) -> StorageResult<()> {
        let millis = Utc::now().timestamp_millis();
        let filename = format!("daymark-{millis}-{revision}.json");
        let final_path = self.backup_directory.join(filename);
        let temporary_path = final_path.with_extension("json.tmp");
        {
            let mut file = fs::File::create(&temporary_path)?;
            file.write_all(data_json.as_bytes())?;
            file.sync_all()?;
        }
        fs::rename(&temporary_path, &final_path)?;

        Ok(())
    }

    fn prune_file_backups(&self) -> StorageResult<()> {
        let mut backups = fs::read_dir(&self.backup_directory)?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.file_name().to_string_lossy().starts_with("daymark-")
                    && entry
                        .path()
                        .extension()
                        .is_some_and(|value| value == "json")
            })
            .collect::<Vec<_>>();
        backups.sort_by_key(|entry| entry.file_name());
        let excess = backups.len().saturating_sub(FILE_BACKUP_LIMIT);
        for entry in backups.into_iter().take(excess) {
            fs::remove_file(entry.path())?;
        }
        Ok(())
    }
}

fn migrate(connection: &Connection) -> StorageResult<()> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY,
           applied_at TEXT NOT NULL
         );",
    )?;
    let current: i64 = transaction.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    if current < 1 {
        transaction.execute_batch(
            "CREATE TABLE documents (
               id INTEGER PRIMARY KEY CHECK (id = 1),
               revision INTEGER NOT NULL CHECK (revision >= 0),
               data_json TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE TABLE backups (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               created_at TEXT NOT NULL,
               label TEXT NOT NULL,
               data_json TEXT NOT NULL
             );
             CREATE INDEX backups_created_at_idx
               ON backups(created_at DESC);",
        )?;
        transaction.execute(
            "INSERT INTO schema_migrations(version, applied_at)
             VALUES (1, ?1)",
            [timestamp()],
        )?;
    }
    if current > DATABASE_SCHEMA_VERSION {
        return Err(StorageError::UnsupportedSchema);
    }
    transaction.commit()?;
    Ok(())
}

fn validate_document(data_json: &str) -> StorageResult<i64> {
    let parsed: Value = serde_json::from_str(data_json)?;
    if parsed.get("schemaVersion").and_then(Value::as_i64) != Some(3) {
        return Err(StorageError::UnsupportedSchema);
    }
    parsed
        .get("revision")
        .and_then(Value::as_i64)
        .filter(|revision| *revision >= 0)
        .ok_or(StorageError::InvalidRevision)
}

fn prune_database_backups(transaction: &rusqlite::Transaction<'_>) -> StorageResult<()> {
    transaction.execute(
        "DELETE FROM backups
         WHERE id NOT IN (
           SELECT id FROM backups ORDER BY id DESC LIMIT ?1
         )",
        [DATABASE_BACKUP_LIMIT],
    )?;
    Ok(())
}

fn normalized_label<'a>(label: &'a str, fallback: &'a str) -> &'a str {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    }
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn document(revision: i64) -> String {
        serde_json::json!({
            "schemaVersion": 3,
            "revision": revision,
            "tasks": [],
            "plans": [],
            "archive": { "legacyFocusRecords": [] },
            "updatedAt": "2026-07-30T00:00:00.000Z"
        })
        .to_string()
    }

    #[test]
    fn saves_with_revision_compare_and_swap() {
        let temporary = tempfile::tempdir().unwrap();
        let database = DaymarkDatabase::open(temporary.path()).unwrap();
        database.save(&document(0), None).unwrap();
        database.save(&document(1), Some(0)).unwrap();
        let error = database.save(&document(1), Some(0)).unwrap_err();
        assert!(matches!(error, StorageError::RevisionConflict(_)));
        assert_eq!(database.list_backups().unwrap().len(), 1);
    }

    #[test]
    fn file_backup_failure_rolls_back_sqlite_revision() {
        let temporary = tempfile::tempdir().unwrap();
        let database = DaymarkDatabase::open(temporary.path()).unwrap();
        database.save(&document(0), None).unwrap();

        let backup_directory = temporary.path().join("backups");
        for entry in fs::read_dir(&backup_directory).unwrap() {
            fs::remove_file(entry.unwrap().path()).unwrap();
        }
        fs::remove_dir(&backup_directory).unwrap();
        fs::write(&backup_directory, "not a directory").unwrap();

        assert!(database.save(&document(1), Some(0)).is_err());
        let stored = database.load().unwrap().unwrap();
        assert_eq!(validate_document(&stored).unwrap(), 0);

        fs::remove_file(&backup_directory).unwrap();
        fs::create_dir(&backup_directory).unwrap();
        database.save(&document(1), Some(0)).unwrap();
        let stored = database.load().unwrap().unwrap();
        assert_eq!(validate_document(&stored).unwrap(), 1);
    }
}
