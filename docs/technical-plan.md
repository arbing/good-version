# 好版本技术方案

## 1. 架构概览

「好版本」采用 Tauri 桌面应用架构：

- 前端负责项目列表、时间线、确认弹窗、变化摘要展示
- Rust 侧负责文件系统、Git 操作、导出、存储统计
- Git 作为底层版本存储引擎
- 应用元数据用于维护非线性时间线和用户说明

## 2. 核心模块

### 项目管理模块

职责：

- 添加项目文件夹
- 读取项目列表
- 修改项目显示名
- 打开项目文件夹
- 判断项目是否已有 `.git/`
- 初始化新项目 Git 仓库

### 版本保存模块

职责：

- 收集当前文件状态
- 应用内部排除规则
- 更新 Git 索引
- 创建 commit
- 创建内部 tag
- 生成变化摘要
- 写入版本元数据

### 时间线模块

职责：

- 读取所有版本元数据
- 校验内部 tag 是否存在
- 标记当前版本
- 按时间倒序展示版本卡片

### 回退模块

职责：

- 回退前创建「回退前状态」
- 校验保存成功
- 解析目标版本 commit
- hard reset 到目标版本
- 更新时间线状态

### 导出模块

职责：

- 复制当前项目文件
- 排除 `.git/`
- 排除工具元数据
- 保留 `.env`
- 生成项目副本

### 存储统计模块

职责：

- 计算 `.git/` 占用大小
- 计算项目目录占用大小
- 展示版本占用估算

## 3. 数据模型

### Project

```ts
type Project = {
  id: string
  displayName: string
  path: string
  createdAt: string
  updatedAt: string
}
```

### Version

```ts
type Version = {
  id: string
  projectId: string
  title: string
  note?: string
  commitHash: string
  tagName: string
  createdAt: string
  isInitial: boolean
  isRollbackCheckpoint: boolean
  changeSummary: ChangeSummary
}
```

### ChangeSummary

```ts
type ChangeSummary = {
  added: number
  modified: number
  deleted: number
  files: Array<{
    path: string
    status: 'added' | 'modified' | 'deleted'
  }>
}
```

## 4. Git 操作策略

### 初始化项目

无 `.git/` 时：

1. 初始化 Git 仓库
2. 创建初始好版本 commit
3. 创建内部 tag
4. 写入项目和版本元数据

已有 `.git/` 时：

1. 读取当前分支和当前 HEAD
2. 不切换分支
3. 不修改远端
4. 创建初始好版本 commit
5. 创建内部 tag

### 保存好版本

1. 扫描工作区
2. 应用内部排除规则
3. stage 应保存文件
4. 创建 commit
5. 创建内部 tag
6. 计算变化摘要
7. 写入版本元数据

### 回退版本

1. 创建回退前状态版本
2. 确认 commit 和 tag 已创建
3. 从目标版本 tag 解析 commit
4. 执行 hard reset
5. 更新时间线当前状态

## 5. 元数据存储

应用需要存储项目列表和版本列表。

建议首版存在应用数据目录，避免污染项目文件；版本可找回性由 Git tag 保证。

项目复制到另一台电脑后，如果只复制项目目录和 `.git/`，内部 tag 仍在，但应用项目列表和说明可能不在。后续可考虑把元数据同步写入 Git notes 或项目内隐藏文件。

## 6. 排除规则

MVP 不随意修改用户 `.gitignore`。

内部排除规则只排除：

- 工具自身临时文件
- 操作系统临时文件
- 明确不应进入版本的中间文件

`.env`、大文件、构建产物在当前产品决策下默认保存。

## 7. 错误处理

### 保存失败

- 显示保存失败原因
- 不创建时间线卡片
- 不执行后续回退

### 回退前保存失败

- 阻止 hard reset
- 提示用户当前状态未保存，不能回退

### 目标版本丢失

- 如果 tag 不存在，禁用「回到这里」
- 提示该版本无法找回

### Git 仓库异常

- 首版只提示项目状态异常
- 不自动修复外部 Git 操作

## 8. 实施顺序

### 阶段 1：基础项目与版本保存

- Tauri 项目骨架
- 项目列表
- 添加项目
- 初始化 Git
- 保存当前好版本
- 创建 tag

### 阶段 2：时间线与变化摘要

- 版本元数据
- 时间线卡片
- 文件变化摘要
- 当前版本标记

### 阶段 3：回退闭环

- 二次确认
- 回退前状态保存
- hard reset
- 回退前状态可找回

### 阶段 4：导出与存储占用

- 导出当前项目副本
- 排除 `.git/`
- 展示存储占用

### 阶段 5：体验打磨

- 中文文案
- 空状态
- 错误提示
- 低压力视觉风格
