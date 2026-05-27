import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Bookmark, CheckCircle, Download, Folder, Pencil, PlusCircle, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppStatus, ProjectDetail, ProjectListItem, Version } from "./types";

function App() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [detail, setDetail] = useState<ProjectDetail>();
  const [status, setStatus] = useState<AppStatus>();
  const [note, setNote] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<Version>();
  const [rollbackVersion, setRollbackVersion] = useState<Version>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(undefined);
      return;
    }
    void loadDetail(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !detail?.pathExists) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDetail(selectedProjectId, false);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [selectedProjectId, detail?.pathExists]);

  async function bootstrap() {
    setLoading(true);
    try {
      const [appStatus, loadedProjects] = await Promise.all([
        invoke<AppStatus>("get_app_status"),
        invoke<ProjectListItem[]>("list_projects"),
      ]);
      setStatus(appStatus);
      setProjects(loadedProjects);
      setSelectedProjectId(loadedProjects[0]?.id);
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(projectId: string, showError = true) {
    try {
      setDetail(await invoke<ProjectDetail>("get_project_detail", { projectId }));
    } catch (error) {
      if (showError) {
        setMessage(toMessage(error));
      }
    }
  }

  async function addProject() {
    setMessage(undefined);
    let selected: string | null | string[];
    try {
      selected = await open({ directory: true, multiple: false });
    } catch (error) {
      setMessage(toMessage(error));
      return;
    }
    if (typeof selected !== "string") {
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const projectDetail = await invoke<ProjectDetail>("add_project", { path: selected });
      const loadedProjects = await invoke<ProjectListItem[]>("list_projects");
      setProjects(loadedProjects);
      setSelectedProjectId(projectDetail.project.id);
      setDetail(projectDetail);
      setMessage("已添加项目，并保存了初始好版本。");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrentVersion() {
    if (!detail) {
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      await invoke<Version>("save_version", {
        projectId: detail.project.id,
        note: note.trim() ? note : null,
      });
      const loadedProjects = await invoke<ProjectListItem[]>("list_projects");
      setProjects(loadedProjects);
      await loadDetail(detail.project.id);
      setShowSave(false);
      setNote("");
      setMessage("已保存当前好版本。");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function rollbackToVersion() {
    if (!detail || !rollbackVersion) {
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const projectDetail = await invoke<ProjectDetail>("rollback_to_version", {
        projectId: detail.project.id,
        versionId: rollbackVersion.id,
      });
      setDetail(projectDetail);
      setRollbackVersion(undefined);
      setSelectedVersion(undefined);
      setProjects(await invoke<ProjectListItem[]>("list_projects"));
      setMessage("已经回到选择的好版本。");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function renameProject() {
    if (!detail) {
      return;
    }
    setLoading(true);
    setMessage(undefined);
    try {
      const projectDetail = await invoke<ProjectDetail>("update_project_name", {
        projectId: detail.project.id,
        displayName: projectName,
      });
      setDetail(projectDetail);
      setProjects(await invoke<ProjectListItem[]>("list_projects"));
      setEditingName(false);
      setMessage("项目显示名已更新。");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function relinkProject() {
    if (!detail) {
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") {
      return;
    }
    setLoading(true);
    setMessage(undefined);
    try {
      const projectDetail = await invoke<ProjectDetail>("relink_project_path", {
        projectId: detail.project.id,
        path: selected,
      });
      setDetail(projectDetail);
      setProjects(await invoke<ProjectListItem[]>("list_projects"));
      setMessage("已重新关联项目文件夹。");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function openProjectFolder() {
    if (!detail) {
      return;
    }
    try {
      await invoke("open_project_folder", { projectId: detail.project.id });
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  async function exportProjectCopy() {
    if (!detail) {
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") {
      return;
    }
    setLoading(true);
    setMessage(undefined);
    try {
      await invoke("export_project_copy", {
        projectId: detail.project.id,
        targetPath: selected,
      });
      setExporting(false);
      setMessage("已导出当前项目副本，可以在目标文件夹中打开。");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon"><ShieldCheck size={30} /></span>
          <div>
            <h1>好版本</h1>
            <p>保存能用的状态，改坏了也能回来</p>
          </div>
        </div>

        <button className="add-button" disabled={loading} onClick={addProject}>
          <PlusCircle size={22} /> 添加项目
        </button>

        <div className="project-list">
          {projects.length === 0 ? (
            <EmptyState />
          ) : (
            projects.map((project) => (
              <button
                className={`project-card ${project.id === selectedProjectId ? "active" : ""}`}
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <span className="project-icon"><Folder size={24} /></span>
                <span>
                  <strong>{project.displayName}</strong>
                  <small>{project.path}</small>
                  <small>{project.versionCount} 个好版本</small>
                </span>
              </button>
            ))
          )}
        </div>

        {status && <p className="local-note">数据保存在本地：{status.dataDir}</p>}
      </aside>

      <section className="content">
        {message && <div className="message">{message}</div>}
        {loading && <div className="message muted">正在处理，请稍等…</div>}
        {detail ? (
          <ProjectDetailView
            detail={detail}
            loading={loading}
            onOpenSave={() => setShowSave(true)}
            onSelectVersion={setSelectedVersion}
            onRollback={setRollbackVersion}
            onOpenFolder={openProjectFolder}
            onEditName={() => {
              setProjectName(detail.project.displayName);
              setEditingName(true);
            }}
            onExport={() => setExporting(true)}
            onRelink={relinkProject}
          />
        ) : (
          <section className="hero-empty">
            <ShieldCheck size={60} />
            <h2>先添加一个项目</h2>
            <p>选择本地文件夹后，会自动保存第一个好版本。</p>
            <button className="primary-button" disabled={loading} onClick={addProject}>
              添加项目
            </button>
          </section>
        )}
      </section>

      {showSave && (
        <div className="modal-mask">
          <div className="modal">
            <h3>保存当前好版本</h3>
            <p>这次状态的说明（可选）</p>
            <textarea
              autoFocus
              placeholder="比如：首页能正常打开，按钮也能点击"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowSave(false)}>取消</button>
              <button className="primary-button" disabled={loading} onClick={saveCurrentVersion}>保存</button>
            </div>
          </div>
        </div>
      )}

      {editingName && (
        <div className="modal-mask">
          <div className="modal">
            <h3>修改显示名</h3>
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setEditingName(false)}>取消</button>
              <button className="primary-button" disabled={loading} onClick={renameProject}>保存</button>
            </div>
          </div>
        </div>
      )}

      {exporting && (
        <div className="modal-mask">
          <div className="modal">
            <h3>导出当前项目副本</h3>
            <p>请选择一个空文件夹，导出的副本不包含版本历史。</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setExporting(false)}>取消</button>
              <button className="primary-button" disabled={loading} onClick={exportProjectCopy}>选择文件夹</button>
            </div>
          </div>
        </div>
      )}

      {selectedVersion && (
        <ChangeSummaryDrawer version={selectedVersion} onClose={() => setSelectedVersion(undefined)} />
      )}

      {rollbackVersion && (
        <div className="modal-mask">
          <div className="modal">
            <h3>回到这个好版本？</h3>
            <p>会先保存当前状态，然后回到这个好版本。你之后也可以再回到现在。</p>
            <p className="rollback-target">目标：{rollbackVersion.note || rollbackVersion.title}</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setRollbackVersion(undefined)}>取消</button>
              <button className="warning-button" disabled={loading} onClick={rollbackToVersion}>确认回到这里</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ProjectDetailView({
  detail,
  loading,
  onOpenSave,
  onSelectVersion,
  onRollback,
  onOpenFolder,
  onEditName,
  onExport,
  onRelink,
}: {
  detail: ProjectDetail;
  loading: boolean;
  onOpenSave: () => void;
  onSelectVersion: (version: Version) => void;
  onRollback: (version: Version) => void;
  onOpenFolder: () => void;
  onEditName: () => void;
  onExport: () => void;
  onRelink: () => void;
}) {
  const currentVersionId = detail.project.currentVersionId;
  const hasVersions = detail.versions.length > 0;
  const hasChanges = detail.currentChangeSummary.files.length > 0;

  return (
    <>
      <header className="detail-header">
        <div>
          <h2>{detail.project.displayName}</h2>
          <p><Folder size={18} /> {detail.project.path}</p>
          <p>项目占用：{formatBytes(detail.storageUsage.workTreeBytes)} · 版本数据：{formatBytes(detail.storageUsage.versionDataBytes)}</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" disabled={loading || !detail.pathExists} onClick={onOpenFolder}><Folder size={18} /> 打开项目文件夹</button>
          <button className="secondary-button" disabled={loading} onClick={onEditName}><Pencil size={18} /> 修改显示名</button>
          <button className="secondary-button" disabled={loading || !detail.pathExists} onClick={onExport}><Download size={18} /> 导出当前项目副本</button>
          <button className="primary-button" disabled={loading || !detail.pathExists || !hasChanges} onClick={onOpenSave}>
            <Bookmark size={20} /> 保存当前好版本
          </button>
        </div>
      </header>

      {!detail.pathExists && (
        <section className="missing-state">
          <h3>项目文件夹不见了</h3>
          <p>可能被移动或删除了。你可以重新选择项目文件夹，外置保存的数据仍然保留在本地。</p>
          <button className="primary-button" disabled={loading} onClick={onRelink}>重新选择项目目录</button>
        </section>
      )}

      {detail.pathExists && (
        <section className={`change-state ${hasChanges ? "active" : ""}`}>
          {hasChanges ? (
            <>
              <strong>有未保存的变化</strong>
              <span>
                新增 {detail.currentChangeSummary.added} · 修改 {detail.currentChangeSummary.modified} · 删除 {detail.currentChangeSummary.deleted}
              </span>
            </>
          ) : (
            <>
              <strong><CheckCircle size={20} /> 当前已经是已保存的好版本。</strong>
              <span>继续修改后，记得再保存新的好版本。</span>
            </>
          )}
        </section>
      )}

      {hasVersions ? (
        <div className="timeline">
          {detail.versions.map((version) => (
            <VersionCard
              key={version.id}
              version={version}
              current={version.id === currentVersionId}
              onShowChanges={() => onSelectVersion(version)}
              onRollback={() => onRollback(version)}
            />
          ))}
        </div>
      ) : (
        <section className="hero-empty compact">
          <h3>还没有好版本</h3>
          <p>保存一次后，这里会显示时间线。</p>
        </section>
      )}
    </>
  );
}

function VersionCard({
  version,
  current,
  onShowChanges,
  onRollback,
}: {
  version: Version;
  current: boolean;
  onShowChanges: () => void;
  onRollback: () => void;
}) {
  const note = useMemo(() => version.note || version.title, [version]);

  return (
    <article className={`timeline-card ${current ? "current" : ""}`}>
      <span className={`timeline-dot ${current ? "current" : ""}`} />
      <div className="version-time">
        <strong>{formatDate(version.createdAt)}</strong>
        <small>{versionLabel(version)}</small>
      </div>
      <div className="version-body">
        <div className="version-title">
          <strong>{note}</strong>
          {current && <span>当前在这里</span>}
        </div>
        <div className="chips">
          <span className="chip add">新增 {version.changeSummary.added}</span>
          <span className="chip modify">修改 {version.changeSummary.modified}</span>
          <span className="chip delete">删除 {version.changeSummary.deleted}</span>
        </div>
      </div>
      <div className="version-actions">
        <button className="secondary-button" onClick={onShowChanges}>查看变化</button>
        <button className="secondary-button" disabled={current} onClick={onRollback}>回到这里</button>
      </div>
    </article>
  );
}

function ChangeSummaryDrawer({ version, onClose }: { version: Version; onClose: () => void }) {
  return (
    <aside className="drawer">
      <div className="drawer-header">
        <h3>这次变化</h3>
        <button className="icon-button" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="chips full">
        <span className="chip add">新增 {version.changeSummary.added}</span>
        <span className="chip modify">修改 {version.changeSummary.modified}</span>
        <span className="chip delete">删除 {version.changeSummary.deleted}</span>
      </div>
      <FileChangeGroup title="新增" status="added" version={version} />
      <FileChangeGroup title="修改" status="modified" version={version} />
      <FileChangeGroup title="删除" status="deleted" version={version} />
      <p className="drawer-note">不展示代码内容，只显示文件变化情况。</p>
    </aside>
  );
}

function FileChangeGroup({
  title,
  status,
  version,
}: {
  title: string;
  status: "added" | "modified" | "deleted";
  version: Version;
}) {
  const files = version.changeSummary.files.filter((file) => file.status === status);
  if (files.length === 0) {
    return null;
  }

  return (
    <section className="file-group">
      <h4>{title} · {files.length}</h4>
      {files.map((file) => (
        <div className="file-row" key={`${status}-${file.path}`}>
          <span>{file.path}</span>
          <strong>{title}</strong>
        </div>
      ))}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <ShieldCheck size={36} />
      <strong>还没有项目</strong>
      <small>添加项目后会自动保存初始好版本。</small>
    </div>
  );
}

function versionLabel(version: Version) {
  if (version.isInitial) {
    return "初始好版本";
  }
  if (version.isRollbackCheckpoint) {
    return "回退前状态";
  }
  return "保存的好版本";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value: string) {
  return value.slice(5, 16).replace("-", "/");
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default App;
