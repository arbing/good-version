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

export function versionDisplayNote(version: Version, versionNumber: number) {
  return version.note || version.title || numberedVersionNote(versionNumber);
}

export function numberedVersionNote(versionNumber: number) {
  return `第 ${versionNumber} 个好版本`;
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
  const date = parseDate(value);
  const now = new Date();
  const dateDay = startOfDay(date).getTime();
  const today = startOfDay(now).getTime();
  const dayDiff = Math.round((today - dateDay) / 86_400_000);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (dayDiff === 0) {
    return `今天 ${time}`;
  }
  if (dayDiff === 1) {
    return `昨天 ${time}`;
  }
  if (dayDiff === 2) {
    return `前天 ${time}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

function parseDate(value: string) {
  return new Date(value.replace(" ", "T"));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
