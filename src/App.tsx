import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, Plus, PlusCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState, FolderIllustration, LocalDataNote } from "./components/EmptyStates";
import { ChangeSummaryDrawer, ProjectDetailView } from "./components/ProjectDetailView";
import type { AppStatus, ProjectDetail, ProjectListItem, Version } from "./types";

const DEFAULT_SIDEBAR_WIDTH = 380;
const MIN_SIDEBAR_WIDTH = 300;
const MIN_CONTENT_WIDTH = 520;

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
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const dataDirClickCount = useRef(0);
  const dataDirClickTimer = useRef<number | undefined>(undefined);

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

  useEffect(() => {
    const handleWindowResize = () => {
      setSidebarWidth((currentWidth) => {
        const nextWidth = nextSidebarWidth(currentWidth);
        return currentWidth === nextWidth ? currentWidth : nextWidth;
      });
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

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

  async function openDataDir() {
    try {
      await invoke("open_data_dir");
    } catch (error) {
      setMessage(toMessage(error));
    }
  }

  function handleDataDirClick() {
    window.clearTimeout(dataDirClickTimer.current);
    dataDirClickCount.current += 1;

    if (dataDirClickCount.current >= 6) {
      dataDirClickCount.current = 0;
      void openDataDir();
      return;
    }

    dataDirClickTimer.current = window.setTimeout(() => {
      dataDirClickCount.current = 0;
    }, 1200);
  }

  function nextSidebarWidth(clientX: number) {
    const maxSidebarWidth = Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - MIN_CONTENT_WIDTH);
    return Math.min(Math.max(clientX, MIN_SIDEBAR_WIDTH), maxSidebarWidth);
  }

  function resizeSidebar(clientX: number) {
    setSidebarWidth((currentWidth) => {
      const nextWidth = nextSidebarWidth(clientX);
      return currentWidth === nextWidth ? currentWidth : nextWidth;
    });
  }

  function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    resizeSidebar(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => resizeSidebar(moveEvent.clientX);
    const stopResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("blur", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
    window.addEventListener("blur", stopResize, { once: true });
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
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="brand">
          <span className="brand-icon"><ShieldCheck size={30} /></span>
          <h1>好版本</h1>
        </div>
        <p className="brand-subtitle">保存能用的状态，改坏了也能回来</p>

        <button className="add-button" disabled={loading} onClick={addProject}>
          <PlusCircle size={22} /> 添加项目
        </button>

        <section className="project-section">
          <h2>我的项目</h2>
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
        </section>

        {status && <LocalDataNote onClick={handleDataDirClick} />}
      </aside>

      <div
        aria-label="调整左侧栏宽度"
        aria-orientation="vertical"
        className="sidebar-resizer"
        role="separator"
        onPointerDown={startSidebarResize}
      />

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
            <FolderIllustration />
            <h2>还没有项目</h2>
            <p>选择一个项目文件夹，先保存一个初始好版本。</p>
            <button className="primary-button hero-add-button" disabled={loading} onClick={addProject}>
              <span><Plus size={20} /></span>
              添加项目
            </button>
            {status && <LocalDataNote variant="hero" onClick={handleDataDirClick} />}
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

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default App;
