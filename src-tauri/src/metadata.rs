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

#[derive(Clone)]
pub struct MetadataStore {
    data_dir: PathBuf,
}

impl MetadataStore {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(data_dir.join("versions")).map_err(|error| error.to_string())?;
        fs::create_dir_all(data_dir.join("repositories")).map_err(|error| error.to_string())?;
        Ok(Self { data_dir })
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn repositories_dir(&self) -> PathBuf {
        self.data_dir.join("repositories")
    }

    pub fn load_projects(&self) -> Result<Vec<Project>, String> {
        let path = self.data_dir.join("projects.json");
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str(&content).map_err(|error| error.to_string())
    }

    pub fn save_projects(&self, projects: &[Project]) -> Result<(), String> {
        let content = serde_json::to_string_pretty(projects).map_err(|error| error.to_string())?;
        fs::write(self.data_dir.join("projects.json"), content).map_err(|error| error.to_string())
    }

    pub fn load_versions(&self, project_id: &str) -> Result<Vec<Version>, String> {
        let path = self.versions_path(project_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str(&content).map_err(|error| error.to_string())
    }

    pub fn save_versions(&self, project_id: &str, versions: &[Version]) -> Result<(), String> {
        let content = serde_json::to_string_pretty(versions).map_err(|error| error.to_string())?;
        fs::write(self.versions_path(project_id), content).map_err(|error| error.to_string())
    }

    fn versions_path(&self, project_id: &str) -> PathBuf {
        self.data_dir
            .join("versions")
            .join(format!("{project_id}.json"))
    }
}
