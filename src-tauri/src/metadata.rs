use rusqlite::{params, params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub data_dir: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub display_name: String,
    pub path: String,
    pub git_dir_path: String,
    pub uses_external_git_dir: bool,
    pub created_at: String,
    pub updated_at: String,
    pub current_version_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListItem {
    #[serde(flatten)]
    pub project: Project,
    pub version_count: usize,
    pub latest_version_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub project: Project,
    pub versions: Vec<Version>,
    pub path_exists: bool,
    pub storage_usage: StorageUsage,
    pub current_change_summary: ChangeSummary,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub work_tree_bytes: u64,
    pub version_data_bytes: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub note: Option<String>,
    pub commit_hash: String,
    pub tag_name: String,
    pub created_at: String,
    pub is_initial: bool,
    pub is_rollback_checkpoint: bool,
    pub change_summary: ChangeSummary,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSummary {
    pub added: usize,
    pub modified: usize,
    pub deleted: usize,
    pub files: Vec<FileChange>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub status: FileChangeStatus,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileChangeStatus {
    Added,
    Modified,
    Deleted,
}

const DATABASE_FILE_NAME: &str = "metadata.db";
const REPOSITORIES_DIR_NAME: &str = "repositories";

#[derive(Clone)]
pub struct MetadataStore {
    data_dir: PathBuf,
}

impl MetadataStore {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(data_dir.join(REPOSITORIES_DIR_NAME))
            .map_err(|error| error.to_string())?;
        let store = Self { data_dir };
        store.migrate()?;
        Ok(store)
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn repositories_dir(&self) -> PathBuf {
        self.data_dir.join(REPOSITORIES_DIR_NAME)
    }

    pub fn load_projects(&self) -> Result<Vec<Project>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, display_name, path, git_dir_path, uses_external_git_dir, created_at, updated_at, current_version_id
                 FROM projects
                 ORDER BY created_at ASC",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(Project {
                    id: row.get(0)?,
                    display_name: row.get(1)?,
                    path: row.get(2)?,
                    git_dir_path: row.get(3)?,
                    uses_external_git_dir: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    current_version_id: row.get(7)?,
                })
            })
            .map_err(|error| error.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn save_projects(&self, projects: &[Project]) -> Result<(), String> {
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        for project in projects {
            insert_project(&transaction, project)?;
        }
        delete_missing_projects(&transaction, projects)?;
        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn load_versions(&self, project_id: &str) -> Result<Vec<Version>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, project_id, title, note, commit_hash, tag_name, created_at,
                        is_initial, is_rollback_checkpoint, change_summary_json
                 FROM versions
                 WHERE project_id = ?1
                 ORDER BY created_at DESC",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![project_id], |row| {
                let change_summary_json: String = row.get(9)?;
                let change_summary =
                    serde_json::from_str(&change_summary_json).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            9,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?;
                Ok(Version {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    note: row.get(3)?,
                    commit_hash: row.get(4)?,
                    tag_name: row.get(5)?,
                    created_at: row.get(6)?,
                    is_initial: row.get(7)?,
                    is_rollback_checkpoint: row.get(8)?,
                    change_summary,
                })
            })
            .map_err(|error| error.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn save_versions(&self, project_id: &str, versions: &[Version]) -> Result<(), String> {
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "DELETE FROM versions WHERE project_id = ?1",
                params![project_id],
            )
            .map_err(|error| error.to_string())?;
        for version in versions {
            let version = Version {
                project_id: project_id.to_string(),
                ..version.clone()
            };
            insert_version(&transaction, &version)?;
        }
        transaction.commit().map_err(|error| error.to_string())
    }

    fn migrate(&self) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY
                 );
                 CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    git_dir_path TEXT NOT NULL,
                    uses_external_git_dir INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    current_version_id TEXT
                 );
                 CREATE TABLE IF NOT EXISTS versions (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    note TEXT,
                    commit_hash TEXT NOT NULL,
                    tag_name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    is_initial INTEGER NOT NULL,
                    is_rollback_checkpoint INTEGER NOT NULL,
                    change_summary_json TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                 );
                 CREATE INDEX IF NOT EXISTS idx_versions_project_created_at
                    ON versions(project_id, created_at DESC);",
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)",
                [],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn connection(&self) -> Result<Connection, String> {
        let connection = Connection::open(self.data_dir.join(DATABASE_FILE_NAME))
            .map_err(|error| error.to_string())?;
        connection
            .execute("PRAGMA foreign_keys = ON", [])
            .map_err(|error| error.to_string())?;
        Ok(connection)
    }
}

fn insert_project(connection: &Connection, project: &Project) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO projects (
                id, display_name, path, git_dir_path, uses_external_git_dir,
                created_at, updated_at, current_version_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                display_name = excluded.display_name,
                path = excluded.path,
                git_dir_path = excluded.git_dir_path,
                uses_external_git_dir = excluded.uses_external_git_dir,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                current_version_id = excluded.current_version_id",
            params![
                project.id,
                project.display_name,
                project.path,
                project.git_dir_path,
                project.uses_external_git_dir,
                project.created_at,
                project.updated_at,
                project.current_version_id,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn delete_missing_projects(connection: &Connection, projects: &[Project]) -> Result<(), String> {
    if projects.is_empty() {
        connection
            .execute("DELETE FROM projects", [])
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let placeholders = std::iter::repeat_n("?", projects.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("DELETE FROM projects WHERE id NOT IN ({placeholders})");
    let ids = projects.iter().map(|project| project.id.as_str());
    connection
        .execute(&sql, params_from_iter(ids))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn insert_version(connection: &Connection, version: &Version) -> Result<(), String> {
    let change_summary_json =
        serde_json::to_string(&version.change_summary).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO versions (
                id, project_id, title, note, commit_hash, tag_name, created_at,
                is_initial, is_rollback_checkpoint, change_summary_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
                project_id = excluded.project_id,
                title = excluded.title,
                note = excluded.note,
                commit_hash = excluded.commit_hash,
                tag_name = excluded.tag_name,
                created_at = excluded.created_at,
                is_initial = excluded.is_initial,
                is_rollback_checkpoint = excluded.is_rollback_checkpoint,
                change_summary_json = excluded.change_summary_json",
            params![
                version.id,
                version.project_id,
                version.title,
                version.note,
                version.commit_hash,
                version.tag_name,
                version.created_at,
                version.is_initial,
                version.is_rollback_checkpoint,
                change_summary_json,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
