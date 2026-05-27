import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const secondProject = {
  id: "project-2",
  displayName: "第二个项目",
  path: "/tmp/project-2",
  gitDirPath: "/tmp/data/repositories/project-2",
  usesExternalGitDir: true,
  createdAt: "2026-05-27 11:00:00",
  updatedAt: "2026-05-27 11:00:00",
  currentVersionId: "version-2",
};

const secondVersion = {
  ...version,
  id: "version-2",
  projectId: "project-2",
};

function projectList(): ProjectListItem[] {
  return [
    { ...baseProject, versionCount: 1, latestVersionAt: version.createdAt },
    { ...secondProject, versionCount: 1, latestVersionAt: secondVersion.createdAt },
  ];
}

function projectDetail(hasChanges: boolean, projectId = "project-1"): ProjectDetail {
  const project = projectId === "project-2" ? secondProject : baseProject;
  const currentVersion = projectId === "project-2" ? secondVersion : version;

  return {
    project,
    versions: [currentVersion],
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

  it("保存第二个项目后仍停留在当前项目", async () => {
    const savedVersion = { ...secondVersion, id: "version-3", title: "保存的好版本" };
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        const projectId = payload?.projectId === "project-2" ? "project-2" : "project-1";
        return projectDetail(projectId === "project-2", projectId);
      }
      if (cmd === "save_version") {
        expect(payload?.projectId).toBe("project-2");
        return savedVersion;
      }
    });

    render(<App />);

    await screen.findByText("当前没有未保存变化");
    fireEvent.click(screen.getByRole("button", { name: "第二个项目/tmp/project-21 个好版本" }));
    await screen.findByText("有未保存的变化");
    fireEvent.click(screen.getByRole("button", { name: /保存当前好版本/ }));
    fireEvent.change(screen.getByPlaceholderText("比如：首页能正常打开，按钮也能点击"), {
      target: { value: "第二个项目可用" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByText("已保存当前好版本。");
    expect(screen.getByRole("heading", { name: "第二个项目" })).toBeInTheDocument();
  });
});
