import { FolderPlus, MousePointerClick } from "lucide-react";

type ProjectFolderDropzoneProps = {
  variant: "empty" | "compact";
  dragging: boolean;
  loading: boolean;
  onSelect: () => void;
};

export function ProjectFolderDropzone({ variant, dragging, loading, onSelect }: ProjectFolderDropzoneProps) {
  if (variant === "compact") {
    return (
      <div className={`folder-dropzone compact ${dragging ? "dragging" : ""}`}>
        <span className="folder-dropzone-icon"><FolderPlus size={22} /></span>
        <span className="folder-dropzone-copy">
          <strong>{dragging ? "松开即可添加到项目列表" : "拖入项目文件夹"}</strong>
          <small>好用就保存，坏了就回去。支持多个。</small>
        </span>
        <button className="secondary-button" disabled={loading} type="button" onClick={onSelect}>
          <MousePointerClick size={18} />
          选择文件夹
        </button>
      </div>
    );
  }

  return (
    <div className={`folder-dropzone empty ${dragging ? "dragging" : ""}`}>
      <span className="folder-dropzone-icon"><FolderPlus size={48} /></span>
      <h2>{dragging ? "松开即可添加文件夹" : "AI 改项目，先保存一个好版本"}</h2>
      <p>把项目文件夹拖进来，好用就保存，坏了就回去。支持一次添加多个项目。</p>
      <button className="primary-button hero-add-button" disabled={loading} type="button" onClick={onSelect}>
        <span><MousePointerClick size={20} /></span>
        选择文件夹
      </button>
      <small>支持同时添加多个文件夹</small>
    </div>
  );
}
