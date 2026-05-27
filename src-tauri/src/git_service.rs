use crate::metadata::{ChangeSummary, FileChange, FileChangeStatus};
use git2::{build::CheckoutBuilder, IndexAddOption, Oid, Repository, Status, StatusOptions};
use std::path::Path;

#[derive(Clone)]
pub struct GitService;

impl GitService {
    pub fn ensure_repository(
        work_tree: &Path,
        external_git_dir: Option<&Path>,
    ) -> Result<Repository, String> {
        if let Some(git_dir) = external_git_dir {
            std::fs::create_dir_all(git_dir).map_err(|error| error.to_string())?;
            if !git_dir.join("HEAD").exists() {
                Repository::init_bare(git_dir).map_err(|error| error.message().to_string())?;
            }

            let repository =
                Repository::open_bare(git_dir).map_err(|error| error.message().to_string())?;
            repository
                .set_workdir(work_tree, false)
                .map_err(|error| error.message().to_string())?;
            Ok(repository)
        } else {
            Repository::open(work_tree)
                .or_else(|_| Repository::init(work_tree))
                .map_err(|error| error.message().to_string())
        }
    }

    pub fn change_summary(repository: &Repository) -> Result<ChangeSummary, String> {
        let statuses = repository
            .statuses(Some(
                StatusOptions::new()
                    .include_untracked(true)
                    .recurse_untracked_dirs(true)
                    .include_ignored(false),
            ))
            .map_err(|error| error.message().to_string())?;

        let mut summary = ChangeSummary::default();

        for entry in statuses.iter() {
            let status = entry.status();
            let Some(path) = entry.path() else {
                continue;
            };

            let change_status = if status.intersects(Status::WT_NEW | Status::INDEX_NEW) {
                summary.added += 1;
                FileChangeStatus::Added
            } else if status.intersects(Status::WT_DELETED | Status::INDEX_DELETED) {
                summary.deleted += 1;
                FileChangeStatus::Deleted
            } else if status.intersects(
                Status::WT_MODIFIED
                    | Status::INDEX_MODIFIED
                    | Status::WT_RENAMED
                    | Status::INDEX_RENAMED
                    | Status::WT_TYPECHANGE
                    | Status::INDEX_TYPECHANGE,
            ) {
                summary.modified += 1;
                FileChangeStatus::Modified
            } else {
                continue;
            };

            summary.files.push(FileChange {
                path: path.to_string(),
                status: change_status,
            });
        }

        summary.files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(summary)
    }

    pub fn create_version(
        repository: &Repository,
        title: &str,
        tag_name: &str,
        allow_empty: bool,
    ) -> Result<Oid, String> {
        let summary = Self::change_summary(repository)?;
        if summary.files.is_empty() && !allow_empty {
            return Err("当前没有需要保存的变化。".to_string());
        }

        let mut index = repository
            .index()
            .map_err(|error| error.message().to_string())?;
        index
            .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
            .map_err(|error| error.message().to_string())?;
        index.write().map_err(|error| error.message().to_string())?;
        let tree_oid = index
            .write_tree()
            .map_err(|error| error.message().to_string())?;
        let tree = repository
            .find_tree(tree_oid)
            .map_err(|error| error.message().to_string())?;
        let signature = repository
            .signature()
            .or_else(|_| git2::Signature::now("好版本", "good-version@local"))
            .map_err(|error| error.message().to_string())?;

        let parents = match repository.head() {
            Ok(head) => match head.target() {
                Some(oid) => vec![repository
                    .find_commit(oid)
                    .map_err(|error| error.message().to_string())?],
                None => Vec::new(),
            },
            Err(_) => Vec::new(),
        };
        let parent_refs = parents.iter().collect::<Vec<_>>();

        let commit_oid = repository
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                title,
                &tree,
                &parent_refs,
            )
            .map_err(|error| error.message().to_string())?;
        let commit = repository
            .find_commit(commit_oid)
            .map_err(|error| error.message().to_string())?;
        repository
            .tag(tag_name, commit.as_object(), &signature, title, false)
            .map_err(|error| error.message().to_string())?;

        Ok(commit_oid)
    }

    pub fn reset_to_version(repository: &Repository, tag_name: &str) -> Result<Oid, String> {
        let object = repository
            .revparse_single(&format!("refs/tags/{tag_name}"))
            .map_err(|_| "这个好版本暂时无法找回。".to_string())?;
        let commit = object
            .peel_to_commit()
            .map_err(|_| "这个好版本暂时无法找回。".to_string())?;
        repository
            .reset(
                commit.as_object(),
                git2::ResetType::Hard,
                Some(CheckoutBuilder::new().force().remove_untracked(true)),
            )
            .map_err(|error| error.message().to_string())?;
        Ok(commit.id())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn external_repository_tracks_add_modify_delete_without_polluting_work_tree() {
        let work_tree = tempdir().unwrap();
        let git_dir = tempdir().unwrap();
        fs::write(work_tree.path().join("README.md"), "hello").unwrap();

        let repository = GitService::ensure_repository(work_tree.path(), Some(git_dir.path())).unwrap();
        assert!(!work_tree.path().join(".git").exists());

        let initial = GitService::create_version(&repository, "初始好版本", "good-version/initial", true)
            .unwrap();
        assert_eq!(GitService::change_summary(&repository).unwrap().files.len(), 0);

        fs::write(work_tree.path().join("README.md"), "hello updated").unwrap();
        fs::write(work_tree.path().join("new.txt"), "new").unwrap();
        let summary = GitService::change_summary(&repository).unwrap();
        assert_eq!(summary.added, 1);
        assert_eq!(summary.modified, 1);
        assert_eq!(summary.deleted, 0);

        GitService::create_version(&repository, "保存的好版本", "good-version/second", false)
            .unwrap();
        fs::remove_file(work_tree.path().join("new.txt")).unwrap();
        let summary = GitService::change_summary(&repository).unwrap();
        assert_eq!(summary.deleted, 1);

        GitService::reset_to_version(&repository, "good-version/initial").unwrap();
        assert_eq!(repository.head().unwrap().target(), Some(initial));
        assert_eq!(fs::read_to_string(work_tree.path().join("README.md")).unwrap(), "hello");
        assert!(!work_tree.path().join("new.txt").exists());
    }

    #[test]
    fn create_version_rejects_empty_non_initial_save() {
        let work_tree = tempdir().unwrap();
        let git_dir = tempdir().unwrap();
        let repository = GitService::ensure_repository(work_tree.path(), Some(git_dir.path())).unwrap();

        GitService::create_version(&repository, "初始好版本", "good-version/initial", true)
            .unwrap();
        let error = GitService::create_version(&repository, "保存的好版本", "good-version/empty", false)
            .unwrap_err();

        assert_eq!(error, "当前没有需要保存的变化。");
    }
}
