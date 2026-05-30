import { open } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { AppStatus, ProjectDetail, ProjectListItem } from "./types";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const mockedOpen = vi.mocked(open);

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

function multiProjectDetails(prefix: string): Record<string, ProjectDetail> {
  return {
    [`/tmp/${prefix}-a`]: {
      ...projectDetail(false, "project-2"),
      project: { ...secondProject, path: `/tmp/${prefix}-a` },
    },
    [`/tmp/${prefix}-b`]: {
      ...projectDetail(false, "project-2"),
      project: { ...secondProject, id: "project-3", displayName: "第三个项目", path: `/tmp/${prefix}-b` },
    },
  };
}

function multiProjectList(paths: string[]): ProjectListItem[] {
  return [
    projectList()[0],
    ...paths.map((path, index) => ({
      ...secondProject,
      id: `project-${index + 2}`,
      displayName: index === 0 ? "第二个项目" : "第三个项目",
      path,
      versionCount: 1,
      latestVersionAt: secondVersion.createdAt,
    })),
  ];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("App", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedOpen.mockReset();
    clearMocks();
  });

  it("启动失败时不永久停留在启动页", async () => {
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        throw new Error("状态读取失败");
      }
      if (cmd === "list_projects") {
        return [];
      }
    });

    render(<App />);

    await screen.findByText("状态读取失败");
    expect(screen.queryByRole("main", { busy: true })).not.toBeInTheDocument();
    expect(screen.getByText("AI 改项目，先保存一个好版本")).toBeInTheDocument();
  });

  it("选择文本后右键菜单只显示复制", async () => {
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return [];
      }
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "选择的文本" } as Selection);

    render(<App />);
    const main = await screen.findByRole("main");
    fireEvent.contextMenu(main, { clientX: 120, clientY: 140 });

    const copyButton = screen.getByRole("button", { name: "复制" });
    expect(copyButton).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toContain(copyButton);

    fireEvent.pointerDown(copyButton);
    fireEvent.click(copyButton);

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("选择的文本"));
    expect(await screen.findByRole("status")).toHaveTextContent("已复制");
  });

  it("已有项目启动加载中不显示空项目入口", async () => {
    const projects = deferred<ProjectListItem[]>();
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projects.promise;
      }
      if (cmd === "get_project_detail") {
        return projectDetail(false);
      }
    });

    render(<App />);

    expect(screen.queryByText("还没有项目")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 改项目，先保存一个好版本")).not.toBeInTheDocument();
    expect(screen.getByRole("main", { busy: true })).toHaveClass("startup-screen");

    await act(async () => {
      projects.resolve(projectList());
    });

    await screen.findByText("当前已经是已保存的好版本。");
  });

  it("已有项目详情加载中不显示添加项目空态", async () => {
    const detail = deferred<ProjectDetail>();
    mockIPC((cmd) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        return detail.promise;
      }
    });

    render(<App />);

    expect(screen.getByRole("main", { busy: true })).toHaveClass("startup-screen");
    expect(screen.queryByText("AI 改项目，先保存一个好版本")).not.toBeInTheDocument();
    expect(screen.queryByText("正在加载项目…")).not.toBeInTheDocument();

    await act(async () => {
      detail.resolve(projectDetail(false));
    });

    await screen.findByText("当前已经是已保存的好版本。");
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

    expect(await screen.findAllByText("AI 改项目，先保存一个好版本")).toHaveLength(1);
    expect(screen.getByText("把项目文件夹拖进来，好用就保存，坏了就回去。支持一次添加多个项目。")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /选择文件夹/ })).toHaveLength(1);
    expect(screen.getByText("支持同时添加多个文件夹")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /所有数据都保存在本地设备中/ })).toHaveLength(1);
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
    expect(screen.getByRole("status")).toHaveTextContent("已保存当前好版本。");
    expect(screen.queryByText("已保存当前好版本。", { selector: ".message" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("status")).toHaveTextContent("已保存当前好版本。");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2700);
    });

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("添加项目按钮支持一次选择多个文件夹", async () => {
    const selectedDetails = multiProjectDetails("selected");
    const addProjectPaths: string[] = [];
    mockedOpen.mockResolvedValue(["/tmp/selected-a", "/tmp/selected-b"]);
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return multiProjectList(addProjectPaths);
      }
      if (cmd === "get_project_detail") {
        const projectId = projectIdFromPayload(payload);
        if (projectId === "project-3") {
          return selectedDetails["/tmp/selected-b"];
        }
        if (projectId === "project-2") {
          return selectedDetails["/tmp/selected-a"];
        }
        return projectDetail(false);
      }
      if (cmd === "add_project") {
        const path = payloadField(payload, "path")?.toString() ?? "";
        addProjectPaths.push(path);
        return selectedDetails[path];
      }
    });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    fireEvent.click(screen.getByRole("button", { name: /选择文件夹/ }));

    await screen.findByText("已添加 2 个项目，并保存了初始好版本。");
    expect(mockedOpen).toHaveBeenCalledWith({ directory: true, multiple: true, title: "选择项目文件夹" });
    expect(addProjectPaths).toEqual(["/tmp/selected-a", "/tmp/selected-b"]);
    expect(screen.getByRole("heading", { name: "第三个项目" })).toBeInTheDocument();
  });

  it("添加项目按钮选择已存在项目时直接切换过去", async () => {
    let addProjectCalled = false;
    mockedOpen.mockResolvedValue(["/tmp/project-2"]);
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        const projectId = projectIdFromPayload(payload) === "project-2" ? "project-2" : "project-1";
        return projectDetail(false, projectId);
      }
      if (cmd === "add_project") {
        addProjectCalled = true;
      }
    });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    fireEvent.click(screen.getByRole("button", { name: /选择文件夹/ }));

    await screen.findByText("这个项目已经在列表中，已为你切换过去。");
    expect(addProjectCalled).toBe(false);
    expect(screen.getByRole("heading", { name: "第二个项目" })).toBeInTheDocument();
  });

  it("添加项目按钮选择多个已存在项目时提示数量并切到最后一个", async () => {
    let addProjectCalled = false;
    mockedOpen.mockResolvedValue(["/tmp/project-1", "/tmp/project-2"]);
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        const projectId = projectIdFromPayload(payload) === "project-2" ? "project-2" : "project-1";
        return projectDetail(false, projectId);
      }
      if (cmd === "add_project") {
        addProjectCalled = true;
      }
    });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    fireEvent.click(screen.getByRole("button", { name: /选择文件夹/ }));

    await screen.findByText("2 个项目已经在列表中，已为你切换到最后一个。");
    expect(addProjectCalled).toBe(false);
    expect(screen.getByRole("heading", { name: "第二个项目" })).toBeInTheDocument();
  });

  it("拖拽新文件夹后创建项目并切换过去", async () => {
    const draggedProject = {
      ...projectDetail(false, "project-2"),
      project: { ...secondProject, path: "/tmp/dragged-project" },
    };
    let addProjectPath: string | undefined;
    mockWindows("main");
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return addProjectPath
          ? [projectList()[0], { ...secondProject, path: addProjectPath, versionCount: 1, latestVersionAt: secondVersion.createdAt }]
          : [projectList()[0]];
      }
      if (cmd === "get_project_detail") {
        return projectIdFromPayload(payload) === "project-2" ? draggedProject : projectDetail(false);
      }
      if (cmd === "add_project") {
        addProjectPath = payloadField(payload, "path")?.toString();
        return draggedProject;
      }
    }, { shouldMockEvents: true });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    await act(async () => {
      await emit("tauri://drag-enter", { paths: ["/tmp/dragged-project"], position: { x: 10, y: 10 } });
    });
    expect(screen.getByText("松开即可添加文件夹")).toBeInTheDocument();

    await act(async () => {
      await emit("tauri://drag-drop", { paths: ["/tmp/dragged-project"], position: { x: 10, y: 10 } });
    });

    await screen.findByText("已添加 1 个项目，并保存了初始好版本。");
    expect(addProjectPath).toBe("/tmp/dragged-project");
    expect(screen.getByRole("heading", { name: "第二个项目" })).toBeInTheDocument();
  });

  it("拖拽已在列表中的项目时直接切换过去", async () => {
    let addProjectCalled = false;
    mockWindows("main");
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        const projectId = projectIdFromPayload(payload) === "project-2" ? "project-2" : "project-1";
        return projectDetail(false, projectId);
      }
      if (cmd === "add_project") {
        addProjectCalled = true;
      }
    }, { shouldMockEvents: true });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    await act(async () => {
      await emit("tauri://drag-drop", { paths: ["/tmp/project-2"], position: { x: 10, y: 10 } });
    });

    await screen.findByText("这个项目已经在列表中，已为你切换过去。");
    expect(addProjectCalled).toBe(false);
    expect(screen.getByRole("heading", { name: "第二个项目" })).toBeInTheDocument();
  });

  it("拖拽多个新文件夹后逐个创建项目并切到最后一个", async () => {
    const draggedDetails = multiProjectDetails("dragged");
    const addProjectPaths: string[] = [];
    mockWindows("main");
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return multiProjectList(addProjectPaths);
      }
      if (cmd === "get_project_detail") {
        const projectId = projectIdFromPayload(payload);
        if (projectId === "project-3") {
          return draggedDetails["/tmp/dragged-b"];
        }
        if (projectId === "project-2") {
          return draggedDetails["/tmp/dragged-a"];
        }
        return projectDetail(false);
      }
      if (cmd === "add_project") {
        const path = payloadField(payload, "path")?.toString() ?? "";
        addProjectPaths.push(path);
        return draggedDetails[path];
      }
    }, { shouldMockEvents: true });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    await act(async () => {
      await emit("tauri://drag-drop", { paths: ["/tmp/dragged-a", "/tmp/dragged-b"], position: { x: 10, y: 10 } });
    });

    await screen.findByText("已添加 2 个项目，并保存了初始好版本。");
    expect(addProjectPaths).toEqual(["/tmp/dragged-a", "/tmp/dragged-b"]);
    expect(screen.getByRole("heading", { name: "第三个项目" })).toBeInTheDocument();
  });

  it("拖拽已在列表中的项目切换时关闭变化抽屉", async () => {
    const changedVersion = {
      ...version,
      changeSummary: {
        added: 1,
        modified: 0,
        deleted: 0,
        files: [{ path: "README.md", status: "added" as const }],
      },
    };
    mockWindows("main");
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        const projectId = projectIdFromPayload(payload) === "project-2" ? "project-2" : "project-1";
        return projectId === "project-1"
          ? { ...projectDetail(false), versions: [changedVersion] }
          : projectDetail(false, projectId);
      }
    }, { shouldMockEvents: true });

    render(<App />);

    await screen.findByText("当前已经是已保存的好版本。");
    fireEvent.click(screen.getByRole("button", { name: "查看变化" }));
    expect(screen.getByRole("heading", { name: "这次变化" })).toBeInTheDocument();

    await act(async () => {
      await emit("tauri://drag-drop", { paths: ["/tmp/project-2"], position: { x: 10, y: 10 } });
    });

    await screen.findByText("这个项目已经在列表中，已为你切换过去。");
    expect(screen.getByRole("heading", { name: "第二个项目" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "这次变化" })).not.toBeInTheDocument();
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
    const nameInput = screen.getByLabelText("项目显示名");
    expect(nameInput).toHaveStyle({ width: "6em" });
    fireEvent.change(nameInput, { target: { value: "新项目名" } });
    expect(nameInput).toHaveStyle({ width: "4em" });
    fireEvent.click(screen.getByRole("button", { name: "提交项目显示名" }));

    await screen.findByText("项目显示名已更新。");
    expect(screen.getByRole("heading", { name: "新项目名" })).toBeInTheDocument();
  });

  it("切换项目时退出项目名编辑状态", async () => {
    mockIPC((cmd, payload) => {
      if (cmd === "get_app_status") {
        return appStatus();
      }
      if (cmd === "list_projects") {
        return projectList();
      }
      if (cmd === "get_project_detail") {
        const projectId = projectIdFromPayload(payload) === "project-2" ? "project-2" : "project-1";
        return projectDetail(false, projectId);
      }
    });

    render(<App />);

    await screen.findByRole("heading", { name: "缺货处理工具" });
    fireEvent.click(screen.getByRole("button", { name: "修改项目显示名" }));
    expect(screen.getByLabelText("项目显示名")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "第二个项目/tmp/project-21 个好版本" }));

    await screen.findByRole("heading", { name: "第二个项目" });
    expect(screen.queryByLabelText("项目显示名")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修改项目显示名" })).toBeInTheDocument();
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

  it("导出版本压缩包时选择目录并调用后端", async () => {
    let exportPayload: unknown;
    mockedOpen.mockResolvedValue("/tmp/exports");
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
      if (cmd === "export_version_archive") {
        exportPayload = payload;
        return "/tmp/exports/缺货处理工具-初始好版本-2026-05-27.zip";
      }
    });

    render(<App />);

    await screen.findByText("当前已经是已保存的好版本。");
    fireEvent.click(screen.getByRole("button", { name: /导出压缩包/ }));

    await screen.findByText("已导出这个好版本的压缩包。");
    expect(mockedOpen).toHaveBeenCalledWith({ directory: true, multiple: false, title: "选择压缩包导出位置" });
    expect(projectIdFromPayload(exportPayload)).toBe("project-1");
    expect(payloadField(exportPayload, "versionId")).toBe("version-1");
    expect(payloadField(exportPayload, "targetDir")).toBe("/tmp/exports");
    expect(payloadField(exportPayload, "archiveName")).toBe("缺货处理工具-初始好版本-2026-05-27.zip");
  });

  it("取消选择导出目录时不调用后端", async () => {
    let exportCalled = false;
    mockedOpen.mockResolvedValue(null);
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
      if (cmd === "export_version_archive") {
        exportCalled = true;
      }
    });

    render(<App />);

    await screen.findByText("当前已经是已保存的好版本。");
    fireEvent.click(screen.getByRole("button", { name: /导出压缩包/ }));

    await waitFor(() => expect(mockedOpen).toHaveBeenCalled());
    expect(exportCalled).toBe(false);
  });

  it("回退失败时在弹窗上方显示中文提示", async () => {
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
        throw new Error("failed to resolve path '/tmp/missing-project': No such file or directory");
      }
    });

    render(<App />);

    await screen.findByText("当前已经是已保存的好版本。");
    fireEvent.click(screen.getAllByRole("button", { name: "回到这里" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "确认回到这里" }));

    expect(await screen.findByRole("status")).toHaveTextContent("项目文件夹不见了，请重新选择位置后再操作。");
    expect(screen.getByText("回到这个好版本？")).toBeInTheDocument();
    expect(screen.queryByText(/failed to resolve path/)).not.toBeInTheDocument();
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
