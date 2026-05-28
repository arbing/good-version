import { ChevronRight, Folder, ShieldCheck } from "lucide-react";

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <Folder size={54} />
        <strong>还没有项目</strong>
        <small>添加项目后会在这里显示</small>
      </div>
    </div>
  );
}

export function LocalDataNote({
  variant,
  onClick,
}: {
  variant?: "hero";
  onClick: () => void;
}) {
  return (
    <button className={`local-note ${variant === "hero" ? "hero" : ""}`} type="button" onClick={onClick}>
      <span className="local-note-icon"><ShieldCheck size={24} /></span>
      <span className="local-note-copy">
        <strong>所有数据都保存在本地设备中</strong>
        <small>安心使用，无需担心丢失</small>
      </span>
      <ChevronRight size={22} />
    </button>
  );
}

export function FolderIllustration() {
  return (
    <div className="folder-illustration" aria-hidden="true">
      <div className="folder-blob" />
      <div className="spark one">•</div>
      <div className="spark two">+</div>
      <div className="spark three">°</div>
      <div className="spark four">•</div>
      <div className="leaf"><span /><span /><span /></div>
      <div className="folder-back" />
      <div className="paper"><span className="paper-image" /></div>
      <div className="folder-front" />
      <div className="ground-shadow" />
    </div>
  );
}
