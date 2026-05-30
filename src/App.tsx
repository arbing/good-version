import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, Plus, PlusCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { EmptyState, FolderIllustration, LocalDataNote } from "./components/EmptyStates";
import { ChangeSummaryDrawer, ProjectDetailView } from "./components/ProjectDetailView";
import { numberedVersionNote } from "./formatters";
import type { AppStatus, ProjectDetail, ProjectListItem, Version } from "./types";
import { useFolderDrop } from "./useFolderDrop";

const DEFAULT_SIDEBAR_WIDTH = 420;
const MIN_SIDEBAR_WIDTH = 300;
const MIN_CONTENT_WIDTH = 560;

function App() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [detail, setDetail] = useState<ProjectDetail>();
  const [status, setStatus] = useState<AppStatus>();
  const [note, setNote] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<Version>();
  const [rollbackVersion, setRollbackVersion] = useState<Version>();
  const [message, setMessage] = useState<string>();
  const [toast, setToast] = useState<{ id: number; text: string }>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string }>();
  const [loading, setLoading] = useState(false);
  const [draggingFolder, setDraggingFolder] = useState(false);
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

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(undefined), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = () => setContextMenu(undefined);
    window.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("keydown", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeContextMenu);
      window.removeEventListener("keydown", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [contextMenu]);

  function showToast(text: string) {
    setToast({ id: Date.now(), text });
  }

  const selectProject = useCallback((projectId: string | undefined) => {
    setSelectedVersion(undefined);
    setSelectedProjectId(projectId);
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
      selectProject(loadedProjects[0]?.id);
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

  const addProjectPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const projectIdByPath = new Map(projects.map((project) => [normalizePath(project.path), project.id]));
      let lastProjectId: string | undefined;
      let lastProjectDetail: ProjectDetail | undefined;
      let addedCount = 0;

      for (const path of paths) {
        const normalizedPath = normalizePath(path);
        const existingProjectId = projectIdByPath.get(normalizedPath);
        if (existingProjectId) {
          lastProjectId = existingProjectId;
          continue;
        }

        lastProjectDetail = await invoke<ProjectDetail>("add_project", { path });
        lastProjectId = lastProjectDetail.project.id;
        projectIdByPath.set(normalizedPath, lastProjectId);
        addedCount += 1;
      }

      if (addedCount > 0) {
        setProjects(await invoke<ProjectListItem[]>("list_projects"));
      }
      if (lastProjectId) {
        selectProject(lastProjectId);
      }
      if (lastProjectDetail?.project.id === lastProjectId) {
        setDetail(lastProjectDetail);
      }
      showToast(addedCount > 0 ? "已添加项目，并保存了初始好版本。" : "这个项目已经在列表中，已为你切换过去。");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }, [projects, selectProject]);

  const startFolderDrag = useCallback(() => setDraggingFolder(true), []);
  const stopFolderDrag = useCallback(() => setDraggingFolder(false), []);

  const handleFolderDrop = useCallback((paths: string[]) => void addProjectPaths(paths), [addProjectPaths]);

  useFolderDrop({
    onEnter: startFolderDrag,
    onLeave: stopFolderDrag,
    onDrop: handleFolderDrop,
  });

  async function addProject() {
    setMessage(undefined);
    let selected: string | null | string[];
    try {
      selected = await open({ directory: true, multiple: true, title: "选择项目文件夹" });
    } catch (error) {
      setMessage(toMessage(error));
      return;
    }
    const selectedPaths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    await addProjectPaths(selectedPaths);
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
        note: note.trim() || nextVersionNote(detail),
      });
      const loadedProjects = await invoke<ProjectListItem[]>("list_projects");
      setProjects(loadedProjects);
      await loadDetail(detail.project.id);
      setShowSave(false);
      setNote("");
      showToast("已保存当前好版本。");
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
      showToast("已经回到选择的好版本。");
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
      showToast("项目显示名已更新。");
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
      showToast("已重新关联项目文件夹。");
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

  async function copySelectedText(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    if (!contextMenu?.text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(contextMenu.text);
      setContextMenu(undefined);
      showToast("已复制");
    } catch {
      setMessage("复制失败，请使用快捷键复制。请检查系统剪贴板权限。");
    }
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const selectedText = window.getSelection()?.toString().trim();
    event.preventDefault();
    setContextMenu(selectedText ? { x: event.clientX, y: event.clientY, text: selectedText } : undefined);
  }

  return (
    <main className={`app-shell ${draggingFolder ? "dragging-folder" : ""}`} onContextMenu={handleContextMenu}>
      {draggingFolder && <div className="toast drag-overlay">松开鼠标，添加这个项目文件夹</div>}
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
                  onClick={() => selectProject(project.id)}
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
        {message && <div className="message error">{message}</div>}
        {loading && <div className="message muted">正在处理，请稍等…</div>}
        {detail ? (
          <ProjectDetailView
            detail={detail}
            loading={loading}
            onOpenSave={() => setShowSave(true)}
            onSelectVersion={setSelectedVersion}
            onRollback={setRollbackVersion}
            onOpenFolder={openProjectFolder}
            editingName={editingName}
            projectName={projectName}
            onStartEditName={() => {
              setProjectName(detail.project.displayName);
              setEditingName(true);
            }}
            onProjectNameChange={setProjectName}
            onCancelEditName={() => setEditingName(false)}
            onSubmitEditName={renameProject}
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

      {toast && <div className="toast" role="status">{toast.text}</div>}

      {contextMenu && (
        <button
          className="selection-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={copySelectedText}
        >
          复制
        </button>
      )}

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

      {selectedVersion && (
        <>
          <button className="drawer-backdrop" aria-label="关闭变化抽屉" onClick={() => setSelectedVersion(undefined)} />
          <ChangeSummaryDrawer version={selectedVersion} onClose={() => setSelectedVersion(undefined)} />
        </>
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

function nextVersionNote(detail: ProjectDetail) {
  return numberedVersionNote(detail.versions.length + 1);
}

function normalizePath(path: string) {
  return path.trim().toLowerCase();
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default App;
