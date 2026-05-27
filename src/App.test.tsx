import { act, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import type { AppStatus, ProjectDetail, ProjectListItem } from "./types";

const baseProject = {
  id: "project-1",
  displayName: "缺货处理工具",
  path: "/tmp/project-1",
  gitDirPath: "/tmp/data/repositories/project-1",
  usesExternalGitDir: true,
  createdAt: "2026-05-27 10:00:00",
  updatedAt: "2026-05-27 10:00:00",
  currentVersionId: "version-1",
};

const version = {
  id: "version-1",
  projectId: "project-1",
  title: "初始好版本",
  commitHash: "abc",
  tagName: "good-version/version-1",
  createdAt: "2026-05-27 10:00:00",
  isInitial: true,
  isRollbackCheckpoint: false,
  changeSummary: {
    added: 0,
    modified: 0,
    deleted: 0,
    files: [],
  },
};

function projectList(): ProjectListItem[] {
  return [{ ...baseProject, versionCount: 1, latestVersionAt: version.createdAt }];
}

function projectDetail(hasChanges: boolean): ProjectDetail {
  return {
    project: baseProject,
    versions: [version],
    pathExists: true,
    storageUsage: {
      workTreeBytes: 1024,
      versionDataBytes: 2048,
    },
    currentChangeSummary: hasChanges
      ? {
          added: 1,
          modified: 2,
          deleted: 0,
          files: [
            { path: "README.md", status: "added" },
            { path: "src/App.tsx", status: "modified" },
            { path: "src/types.ts", status: "modified" },
          ],
        }
      : {
          added: 0,
          modified: 0,
          deleted: 0,
          files: [],
        },
  };
}

function appStatus(): AppStatus {
  return { dataDir: "/tmp/good-version" };
}

describe("App", () => {
  afterEach(() => {
    clearMocks();
  });

  it("没有未保存变化时禁用保存入口", async () => {
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        return projectDetail(false);
      }
    });

    render(<App />);

    await screen.findByText("当前没有未保存变化");
    expect(screen.getByRole("button", { name: /保存当前好版本/ })).toBeDisabled();
  });

  it("有未保存变化时提示变化并启用保存入口", async () => {
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        return projectDetail(true);
      }
    });

    render(<App />);

    await screen.findByText("有未保存的变化");
    expect(screen.getByText("新增 1 · 修改 2 · 删除 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存当前好版本/ })).toBeEnabled();
  });

  it("轮询刷新后同步未保存变化状态", async () => {
    let detailCalls = 0;
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        detailCalls += 1;
        return projectDetail(detailCalls > 1);
      }
    });

    render(<App />);

    await screen.findByText("当前没有未保存变化");

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2100));
    });

    await waitFor(() => expect(screen.getByText("有未保存的变化")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /保存当前好版本/ })).toBeEnabled();
  });
});
