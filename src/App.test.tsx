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

function payloadField(payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null || !(key in payload)) {
    return undefined;
  }

  return (payload as Record<string, unknown>)[key];
}

function projectIdFromPayload(payload: unknown) {
  return payloadField(payload, "projectId")?.toString();
}

describe("App", () => {
  afterEach(() => {
    clearMocks();
  });

  it("空项目状态对齐原型文案并保留添加入口", async () => {
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return [];
      }
    });

    render(<App />);

    expect(await screen.findAllByText("还没有项目")).toHaveLength(2);
    expect(screen.getByText("添加项目后会在这里显示")).toBeInTheDocument();
    expect(screen.getByText("选择一个项目文件夹，先保存一个初始好版本。")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /添加项目/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /所有数据都保存在本地设备中/ })).toHaveLength(2);
  });

  it("连续点击 6 次本地数据区块后打开数据目录", async () => {
    let openDataDirCalls = 0;
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return [];
      }
      if (cmd === "open_data_dir") {
        openDataDirCalls += 1;
      }
    });

    render(<App />);

    const localDataNote = (await screen.findAllByRole("button", { name: /所有数据都保存在本地设备中/ }))[0];
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(localDataNote);
    }
    expect(openDataDirCalls).toBe(0);

    fireEvent.click(localDataNote);
    expect(openDataDirCalls).toBe(1);

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(localDataNote);
    }
    expect(openDataDirCalls).toBe(1);
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

    await screen.findByText("当前已经是已保存的好版本。");
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

    await screen.findByText("当前已经是已保存的好版本。");

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
        const projectId = projectIdFromPayload(payload) === "project-2" ? "project-2" : "project-1";
        return projectDetail(projectId === "project-2", projectId);
      }
      if (cmd === "save_version") {
        expect(projectIdFromPayload(payload)).toBe("project-2");
        expect(payloadField(payload, "note")).toBe("第二个项目可用");
        return savedVersion;
      }
    });

    render(<App />);

    await screen.findByText("当前已经是已保存的好版本。");
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

  it("空说明保存时使用第 N 个好版本作为默认说明", async () => {
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        return projectDetail(true);
      }
      if (cmd === "save_version") {
        expect(payloadField(payload, "note")).toBe("第 2 个好版本");
        return { ...version, id: "version-2", title: "第 2 个好版本" };
      }
    });

    render(<App />);

    await screen.findByText("有未保存的变化");
    fireEvent.click(screen.getByRole("button", { name: /保存当前好版本/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByText("已保存当前好版本。");
  });

  it("可以在项目名右侧就地修改显示名", async () => {
    const renamedDetail = { ...projectDetail(false), project: { ...baseProject, displayName: "新项目名" } };
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        return projectDetail(false);
      }
      if (cmd === "update_project_name") {
        expect(payloadField(payload, "displayName")).toBe("新项目名");
        return renamedDetail;
      }
    });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    expect(screen.queryByRole("button", { name: /修改显示名/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "修改项目显示名" }));
    fireEvent.change(screen.getByLabelText("项目显示名"), { target: { value: "新项目名" } });
    fireEvent.click(screen.getByRole("button", { name: "提交项目显示名" }));

    await screen.findByText("项目显示名已更新。");
    expect(screen.getByRole("heading", { name: "新项目名" })).toBeInTheDocument();
  });

  it("变化抽屉可通过蒙版关闭且不展示说明文案", async () => {
    const changedVersion = {
      ...version,
      changeSummary: {
        added: 1,
        modified: 1,
        deleted: 1,
        files: [
          { path: "README.md", status: "added" as const },
          { path: "src/App.tsx", status: "modified" as const },
          { path: "old.txt", status: "deleted" as const },
        ],
      },
    };
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        return { ...projectDetail(false), versions: [changedVersion] };
      }
    });

    render(<App />);

    await screen.findByText("当前已经是已保存的好版本。");
    expect(screen.queryByRole("button", { name: /导出当前项目副本/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修改项目显示名" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看变化" }));

    expect(screen.getByRole("heading", { name: "这次变化" })).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText("old.txt")).toBeInTheDocument();
    expect(screen.queryByText("不展示代码内容，只显示文件变化情况。")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭变化抽屉" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "这次变化" })).not.toBeInTheDocument());
  });

  it("回退需要确认，取消后不会调用回退接口", async () => {
    let rollbackCalled = false;
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        return {
          ...projectDetail(false),
          project: { ...baseProject, currentVersionId: "version-current" },
          versions: [
            { ...version, id: "version-current", title: "当前版本", isInitial: false },
            version,
          ],
        };
      }
      if (cmd === "rollback_to_version") {
        rollbackCalled = true;
      }
    });

    render(<App />);

    await screen.findByText("当前已经是已保存的好版本。");
    fireEvent.click(screen.getAllByRole("button", { name: "回到这里" })[1]);
    expect(screen.getByText("回到这个好版本？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(screen.queryByText("回到这个好版本？")).not.toBeInTheDocument());
    expect(rollbackCalled).toBe(false);
  });
});
