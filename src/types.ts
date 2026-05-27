export type FileChangeStatus = "added" | "modified" | "deleted";

export type FileChange = {
  path: string;
  status: FileChangeStatus;
};

export type ChangeSummary = {
  added: number;
  modified: number;
  deleted: number;
  files: FileChange[];
};

export type Project = {
  id: string;
  displayName: string;
  path: string;
  gitDirPath: string;
  usesExternalGitDir: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersionId?: string;
};

export type ProjectListItem = Project & {
  versionCount: number;
  latestVersionAt?: string;
};

export type Version = {
  id: string;
  projectId: string;
  title: string;
  note?: string;
  commitHash: string;
  tagName: string;
  createdAt: string;
  isInitial: boolean;
  isRollbackCheckpoint: boolean;
  changeSummary: ChangeSummary;
};

export type ProjectDetail = {
  project: Project;
  versions: Version[];
  pathExists: boolean;
  storageUsage: StorageUsage;
};

export type StorageUsage = {
  workTreeBytes: number;
  versionDataBytes: number;
};

export type AppStatus = {
  dataDir: string;
};
