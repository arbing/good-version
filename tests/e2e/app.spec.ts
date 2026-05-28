import { expect, test } from "@playwright/test";

test("空项目状态显示添加入口", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        if (cmd === "get_app_status") {
          return { dataDir: "/tmp/good-version" };
        }
        if (cmd === "list_projects") {
          return [];
        }
        return null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => undefined,
      convertFileSrc: (filePath: string) => filePath,
    };
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "还没有项目" })).toBeVisible();
  await expect(page.getByText("添加项目后会在这里显示")).toBeVisible();
  await expect(page.getByText("选择一个项目文件夹，先保存一个初始好版本。")).toBeVisible();
  await expect(page.getByRole("button", { name: /所有数据都保存在本地设备中/ }).last()).toBeVisible();

  const projectList = await page.evaluate(() => {
    const element = document.querySelector(".project-list") as HTMLElement;

    return {
      scrollable: element.scrollHeight > element.clientHeight,
      overflowY: window.getComputedStyle(element).overflowY,
    };
  });

  expect(projectList.scrollable).toBe(false);
  expect(projectList.overflowY).toBe("hidden");
});

test("空项目状态连续点击本地数据区块会打开数据目录", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        if (cmd === "get_app_status") {
          return { dataDir: "/tmp/good-version" };
        }
        if (cmd === "list_projects") {
          return [];
        }
        if (cmd === "open_data_dir") {
          window.localStorage.setItem("open-data-dir-called", "yes");
        }
        return null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => undefined,
      convertFileSrc: (filePath: string) => filePath,
    };
  });

  await page.goto("/");

  const localDataNote = page.getByRole("button", { name: /所有数据都保存在本地设备中/ }).first();
  for (let index = 0; index < 6; index += 1) {
    await localDataNote.click();
  }

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("open-data-dir-called"))).toBe("yes");
});

test("长列表时左右滚动区域相互独立", async ({ page }) => {
  await page.addInitScript(() => {
    const versions = Array.from({ length: 24 }, (_, index) => ({
      id: `version-${index + 1}`,
      projectId: "project-1",
      title: `保存的好版本 ${index + 1}`,
      commitHash: `hash-${index + 1}`,
      tagName: `good-version/version-${index + 1}`,
      createdAt: "2026-05-27 10:00:00",
      isInitial: index === 23,
      isRollbackCheckpoint: false,
      changeSummary: { added: 0, modified: 0, deleted: 0, files: [] },
    }));
    const projects = Array.from({ length: 28 }, (_, index) => ({
      id: `project-${index + 1}`,
      displayName: `项目 ${index + 1}`,
      path: `/tmp/project-${index + 1}`,
      gitDirPath: `/tmp/data/repositories/project-${index + 1}`,
      usesExternalGitDir: true,
      createdAt: "2026-05-27 10:00:00",
      updatedAt: "2026-05-27 10:00:00",
      currentVersionId: "version-1",
      versionCount: versions.length,
      latestVersionAt: versions[0].createdAt,
    }));

    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        if (cmd === "get_app_status") {
          return { dataDir: "/tmp/good-version" };
        }
        if (cmd === "list_projects") {
          return projects;
        }
        if (cmd === "get_project_detail") {
          return {
            project: projects[0],
            versions,
            pathExists: true,
            storageUsage: { workTreeBytes: 1024, versionDataBytes: 2048 },
            currentChangeSummary: { added: 0, modified: 0, deleted: 0, files: [] },
          };
        }
        return null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => undefined,
      convertFileSrc: (filePath: string) => filePath,
    };
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "项目 1" })).toBeVisible();

  const layout = await page.evaluate(() => {
    const projectList = document.querySelector(".project-list") as HTMLElement;
    const content = document.querySelector(".content") as HTMLElement;
    const brand = document.querySelector(".brand") as HTMLElement;
    const addButton = document.querySelector(".add-button") as HTMLElement;
    const localNote = document.querySelector(".sidebar > .local-note") as HTMLElement;
    const sidebar = document.querySelector(".sidebar") as HTMLElement;

    const timelineScroll = document.querySelector(".timeline-scroll") as HTMLElement;
    const resizer = document.querySelector(".sidebar-resizer") as HTMLElement;

    return {
      bodyScrollable: document.documentElement.scrollHeight > window.innerHeight || document.body.scrollHeight > window.innerHeight,
      projectListScrollable: projectList.scrollHeight > projectList.clientHeight,
      contentScrollable: content.scrollHeight > content.clientHeight,
      timelineScrollable: timelineScroll.scrollHeight > timelineScroll.clientHeight,
      resizerLineCount: window.getComputedStyle(resizer, "::before").width,
      sidebarBorderRight: window.getComputedStyle(sidebar).borderRightWidth,
      brandVisible: brand.getBoundingClientRect().top >= 0,
      addButtonVisible: addButton.getBoundingClientRect().top >= 0,
      localNoteVisible: localNote.getBoundingClientRect().bottom <= window.innerHeight,
      sidebarWidth: sidebar.getBoundingClientRect().width,
      contentLeft: content.getBoundingClientRect().left,
    };
  });

  expect(layout.bodyScrollable).toBe(false);
  expect(layout.projectListScrollable).toBe(true);
  expect(layout.contentScrollable).toBe(false);
  expect(layout.timelineScrollable).toBe(true);
  expect(layout.resizerLineCount).toBe("1px");
  expect(layout.sidebarBorderRight).toBe("0px");
  expect(layout.brandVisible).toBe(true);
  expect(layout.addButtonVisible).toBe(true);
  expect(layout.localNoteVisible).toBe(true);
  expect(layout.sidebarWidth).toBe(380);

  await page.setViewportSize({ width: 1280, height: 620 });
  const shortListHeight = await page.evaluate(() => (document.querySelector(".project-list") as HTMLElement).clientHeight);

  await page.setViewportSize({ width: 1280, height: 860 });
  const tallListHeight = await page.evaluate(() => (document.querySelector(".project-list") as HTMLElement).clientHeight);

  expect(tallListHeight).toBeGreaterThan(shortListHeight);

  const resizer = page.getByRole("separator", { name: "调整左侧栏宽度" });
  await resizer.hover();
  await page.mouse.down();
  await page.mouse.move(460, 300);
  await page.mouse.up();

  const expandedLayout = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    const content = document.querySelector(".content") as HTMLElement;

    return {
      sidebarWidth: sidebar.getBoundingClientRect().width,
      contentLeft: content.getBoundingClientRect().left,
    };
  });

  expect(expandedLayout.sidebarWidth).toBeGreaterThan(layout.sidebarWidth);
  expect(expandedLayout.contentLeft).toBeGreaterThan(layout.contentLeft);

  await resizer.hover();
  await page.mouse.down();
  await page.mouse.move(120, 300);
  await page.mouse.up();

  const minSidebarWidth = await page.evaluate(() => (document.querySelector(".sidebar") as HTMLElement).getBoundingClientRect().width);
  expect(minSidebarWidth).toBeGreaterThanOrEqual(300);
});
test("有未保存变化时保存入口亮起并展示提示", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
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
      changeSummary: { added: 0, modified: 0, deleted: 0, files: [] },
    };

    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        if (cmd === "get_app_status") {
          return { dataDir: "/tmp/good-version" };
        }
        if (cmd === "list_projects") {
          return [{ ...project, versionCount: 1, latestVersionAt: version.createdAt }];
        }
        if (cmd === "get_project_detail") {
          return {
            project,
            versions: [version],
            pathExists: true,
            storageUsage: { workTreeBytes: 1024, versionDataBytes: 2048 },
            currentChangeSummary: {
              added: 1,
              modified: 0,
              deleted: 0,
              files: [{ path: "README.md", status: "added" }],
            },
          };
        }
        return null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => undefined,
      convertFileSrc: (filePath: string) => filePath,
    };
  });

  await page.goto("/");

  await expect(page.getByText("有未保存的变化")).toBeVisible();
  await expect(page.getByText("新增 1 · 修改 0 · 删除 0")).toBeVisible();
  await expect(page.getByRole("button", { name: /保存当前好版本/ })).toBeEnabled();

  const headerLayout = await page.evaluate(() => {
    const title = document.querySelector(".project-name-row") as HTMLElement;
    const saveButton = document.querySelector(".save-version-button") as HTMLElement;
    return {
      saveBelowTitle: saveButton.getBoundingClientRect().top > title.getBoundingClientRect().bottom,
      exportButtonVisible: Boolean([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("导出当前项目副本"))),
    };
  });

  expect(headerLayout.saveBelowTitle).toBe(true);
  expect(headerLayout.exportButtonVisible).toBe(false);
});
