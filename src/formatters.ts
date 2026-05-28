import type { Version } from "./types";

export function versionLabel(version: Version) {
  if (version.isInitial) {
    return "初始好版本";
  }
  if (version.isRollbackCheckpoint) {
    return "回退前状态";
  }
  return "保存的好版本";
}

export function formatBytes(bytes: number) {
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

export function formatDate(value: string) {
  return value.slice(5, 16).replace("-", "/");
}
