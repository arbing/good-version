import { Bookmark, CheckCircle, Download, Folder, Pencil, X } from "lucide-react";
import { useMemo } from "react";
import { formatBytes, formatDate, versionLabel } from "../formatters";
import type { ProjectDetail, Version } from "../types";

export function ProjectDetailView({
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

export function ChangeSummaryDrawer({ version, onClose }: { version: Version; onClose: () => void }) {
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
