use crate::git_service::GitService;
use crate::metadata::{
    AppStatus, MetadataStore, Project, ProjectDetail, ProjectListItem, StorageUsage, Version,
};
use chrono::Local;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone)]
pub struct ProjectService {
    store: MetadataStore,
}

impl ProjectService {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        Ok(Self {
            store: MetadataStore::new(data_dir)?,
        })
    }

    pub fn app_status(&self) -> AppStatus {
        AppStatus {
            data_dir: self.store.data_dir().to_string_lossy().to_string(),
        }
    }

    pub fn list_projects(&self) -> Result<Vec<ProjectListItem>, String> {
        let mut items = Vec::new();
        for project in self.store.load_projects()? {
            let versions = self.store.load_versions(&project.id)?;
            items.push(ProjectListItem {
                project,
                version_count: versions.len(),
                latest_version_at: versions.first().map(|version| version.created_at.clone()),
            });
        }
        Ok(items)
    }

    pub fn add_project(&self, path: String) -> Result<ProjectDetail, String> {
        let work_tree = PathBuf::from(path.trim());
        if !work_tree.exists() || !work_tree.is_dir() {
            return Err("请选择一个存在的项目文件夹。".to_string());
        }

        let canonical_path = work_tree
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let canonical_text = canonical_path.to_string_lossy().to_string();
        let mut projects = self.store.load_projects()?;
        if projects
            .iter()
            .any(|project| project.path == canonical_text)
        {
            return Err("这个项目已经添加过了。".to_string());
        }

        let project_id = Uuid::new_v4().to_string();
        let uses_external_git_dir = !canonical_path.join(".git").exists();
        let git_dir_path = if uses_external_git_dir {
            self.store.repositories_dir().join(&project_id)
        } else {
            canonical_path.join(".git")
        };
        let now = now_text();
        let mut project = Project {
            id: project_id.clone(),
            display_name: folder_name(&canonical_path),
            path: canonical_text,
            git_dir_path: git_dir_path.to_string_lossy().to_string(),
            uses_external_git_dir,
            created_at: now.clone(),
            updated_at: now,
            current_version_id: None,
        };

        let repository = GitService::ensure_repository(
            &canonical_path,
            uses_external_git_dir.then_some(git_dir_path.as_path()),
        )?;
        let initial_version = self.create_version_record(
            &repository,
            &project.id,
            Some("初始好版本".to_string()),
            true,
            None,
            false,
        )?;
        project.current_version_id = Some(initial_version.id.clone());
        project.updated_at = initial_version.created_at.clone();
        projects.push(project.clone());
        self.store.save_projects(&projects)?;
        self.store
            .save_versions(&project.id, &[initial_version.clone()])?;

        Ok(ProjectDetail {
            storage_usage: storage_usage(&project),
            path_exists: Path::new(&project.path).exists(),
            project,
            versions: vec![initial_version],
        })
    }

    pub fn get_project_detail(&self, project_id: &str) -> Result<ProjectDetail, String> {
        let project = self
            .store
            .load_projects()?
            .into_iter()
            .find(|project| project.id == project_id)
            .ok_or_else(|| "没有找到这个项目。".to_string())?;
        let mut versions = self.store.load_versions(project_id)?;
        versions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        let path_exists = Path::new(&project.path).exists();
        let storage_usage = storage_usage(&project);
        Ok(ProjectDetail {
            project,
            versions,
            path_exists,
            storage_usage,
        })
    }

    pub fn save_version(&self, project_id: &str, note: Option<String>) -> Result<Version, String> {
        self.save_version_with_title(project_id, note, None, false)
    }

    pub fn update_project_name(
        &self,
        project_id: &str,
        display_name: String,
    ) -> Result<ProjectDetail, String> {
        let mut projects = self.store.load_projects()?;
        let project_index = projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| "没有找到这个项目。".to_string())?;
        let name = display_name.trim();
        if name.is_empty() {
            return Err("项目名称不能为空。".to_string());
        }
        projects[project_index].display_name = name.to_string();
        projects[project_index].updated_at = now_text();
        self.store.save_projects(&projects)?;
        self.get_project_detail(project_id)
    }

    pub fn relink_project_path(
        &self,
        project_id: &str,
        path: String,
    ) -> Result<ProjectDetail, String> {
        let new_path = PathBuf::from(path.trim());
        if !new_path.exists() || !new_path.is_dir() {
            return Err("请选择一个存在的项目文件夹。".to_string());
        }
        let canonical_path = new_path.canonicalize().map_err(|error| error.to_string())?;
        let mut projects = self.store.load_projects()?;
        let project_index = projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| "没有找到这个项目。".to_string())?;
        projects[project_index].path = canonical_path.to_string_lossy().to_string();
        if !projects[project_index].uses_external_git_dir {
            projects[project_index].git_dir_path =
                canonical_path.join(".git").to_string_lossy().to_string();
        }
        let updated_project = projects[project_index].clone();
        if updated_project.uses_external_git_dir && dir_is_empty(&canonical_path)? {
            let repository = open_project_repository(&updated_project)?;
            if let Some(version_id) = updated_project.current_version_id.as_deref() {
                let versions = self.store.load_versions(project_id)?;
                let version = versions
                    .iter()
                    .find(|version| version.id == version_id)
                    .ok_or_else(|| "没有找到最近的好版本。".to_string())?;
                GitService::reset_to_version(&repository, &version.tag_name)?;
            }
        }
        projects[project_index].updated_at = now_text();
        self.store.save_projects(&projects)?;
        self.get_project_detail(project_id)
    }

    pub fn open_project_folder(&self, project_id: &str) -> Result<(), String> {
        let project = self
            .store
            .load_projects()?
            .into_iter()
            .find(|project| project.id == project_id)
            .ok_or_else(|| "没有找到这个项目。".to_string())?;
        if !Path::new(&project.path).exists() {
            return Err("项目文件夹不见了，请重新选择位置。".to_string());
        }
        open_path(&project.path)
    }

    pub fn export_project_copy(&self, project_id: &str, target_path: String) -> Result<(), String> {
        let project = self
            .store
            .load_projects()?
            .into_iter()
            .find(|project| project.id == project_id)
            .ok_or_else(|| "没有找到这个项目。".to_string())?;
        let source = Path::new(&project.path);
        if !source.exists() {
            return Err("项目文件夹不见了，暂时无法导出。".to_string());
        }
        let target = PathBuf::from(target_path.trim());
        if target.exists()
            && target
                .read_dir()
                .map_err(|error| error.to_string())?
                .next()
                .is_some()
        {
            return Err("请选择一个空文件夹作为导出位置。".to_string());
        }
        fs::create_dir_all(&target).map_err(|error| error.to_string())?;
        copy_project_files(source, &target)
    }

    pub fn rollback_to_version(
        &self,
        project_id: &str,
        version_id: &str,
    ) -> Result<ProjectDetail, String> {
        let mut projects = self.store.load_projects()?;
        let project_index = projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| "没有找到这个项目。".to_string())?;
        let project = projects[project_index].clone();
        let versions = self.store.load_versions(project_id)?;
        let target = versions
            .iter()
            .find(|version| version.id == version_id)
            .ok_or_else(|| "没有找到要回到的好版本。".to_string())?;
        let repository = open_project_repository(&project)?;

        if !GitService::change_summary(&repository)?.files.is_empty() {
            let checkpoint = self.save_version_with_title(
                project_id,
                Some("回退前状态".to_string()),
                Some("回退前状态".to_string()),
                true,
            )?;
            projects = self.store.load_projects()?;
            projects[project_index].current_version_id = Some(checkpoint.id);
        }

        GitService::reset_to_version(&repository, &target.tag_name)?;
        projects[project_index].current_version_id = Some(target.id.clone());
        projects[project_index].updated_at = now_text();
        self.store.save_projects(&projects)?;
        self.get_project_detail(project_id)
    }

    fn save_version_with_title(
        &self,
        project_id: &str,
        note: Option<String>,
        title: Option<String>,
        is_rollback_checkpoint: bool,
    ) -> Result<Version, String> {
        let mut projects = self.store.load_projects()?;
        let project_index = projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| "没有找到这个项目。".to_string())?;
        let project = projects[project_index].clone();
        let repository = open_project_repository(&project)?;
        let version = self.create_version_record(
            &repository,
            &project.id,
            note,
            false,
            title,
            is_rollback_checkpoint,
        )?;
        let mut versions = self.store.load_versions(project_id)?;
        versions.insert(0, version.clone());
        projects[project_index].current_version_id = Some(version.id.clone());
        projects[project_index].updated_at = version.created_at.clone();
        self.store.save_projects(&projects)?;
        self.store.save_versions(project_id, &versions)?;
        Ok(version)
    }

    fn create_version_record(
        &self,
        repository: &git2::Repository,
        project_id: &str,
        note: Option<String>,
        is_initial: bool,
        title: Option<String>,
        is_rollback_checkpoint: bool,
    ) -> Result<Version, String> {
        let summary = GitService::change_summary(repository)?;
        if summary.files.is_empty() && !is_initial {
            return Err("当前没有需要保存的变化。".to_string());
        }

        let version_id = Uuid::new_v4().to_string();
        let created_at = now_text();
        let title = title.unwrap_or_else(|| {
            if is_initial {
                "初始好版本".to_string()
            } else {
                format_save_title(&created_at)
            }
        });
        let tag_name = format!("good-version/{version_id}");
        let commit_hash =
            GitService::create_version(repository, &title, &tag_name, is_initial)?.to_string();

        Ok(Version {
            id: version_id,
            project_id: project_id.to_string(),
            title,
            note: note.filter(|value| !value.trim().is_empty()),
            commit_hash,
            tag_name,
            created_at,
            is_initial,
            is_rollback_checkpoint,
            change_summary: summary,
        })
    }
}

fn open_project_repository(project: &Project) -> Result<git2::Repository, String> {
    GitService::ensure_repository(
        Path::new(&project.path),
        project
            .uses_external_git_dir
            .then_some(Path::new(&project.git_dir_path)),
    )
}

fn now_text() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn format_save_title(created_at: &str) -> String {
    format!("{} 保存的好版本", created_at)
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("未命名项目")
        .to_string()
}

fn storage_usage(project: &Project) -> StorageUsage {
    StorageUsage {
        work_tree_bytes: dir_size(Path::new(&project.path)),
        version_data_bytes: dir_size(Path::new(&project.git_dir_path)),
    }
}

fn dir_is_empty(path: &Path) -> Result<bool, String> {
    Ok(fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .next()
        .is_none())
}

fn dir_size(path: &Path) -> u64 {
    let Ok(metadata) = fs::metadata(path) else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }

    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| dir_size(&entry.path()))
        .sum()
}

fn copy_project_files(source: &Path, target: &Path) -> Result<(), String> {
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        let next_target = target.join(name);
        if path.is_dir() {
            fs::create_dir_all(&next_target).map_err(|error| error.to_string())?;
            copy_project_files(&path, &next_target)?;
        } else if path.is_file() {
            fs::copy(&path, &next_target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn open_path(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer");
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");

    command.arg(path);
    command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}
