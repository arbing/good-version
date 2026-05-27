# 好版本

「好版本」是一个面向非技术用户的本地桌面版本管理工具。

它帮助用户在使用 Coding Agent 创建和修改项目时，手动保存“当前能正常工作的好版本”，并在项目被改坏后，一键回到之前的好版本。

## 核心目标

- 不懂 Git 也能保存项目版本
- 项目改坏后能回到旧的好版本
- 回退前自动保存当前状态，避免误操作
- 所有数据本地保存，不自动上传

## 首版形态

- 桌面应用
- 支持 macOS + Windows
- Tauri + 内置 Git 操作层
- 中文界面
- 本地优先

## 文档

- [MVP 需求说明](docs/mvp-requirements.md)
- [PRD](docs/prd.md)
- [竞品调研摘要](docs/competitor-research.md)
- [首版功能边界](docs/scope.md)
- [技术实现约束](docs/technical-constraints.md)
- [技术方案](docs/technical-plan.md)
- [开发任务拆分](docs/development-tasks.md)
- [原型页面结构](docs/prototype-structure.md)

## 原型

高保真原型保存在 [`prototypes/`](prototypes/)：

- `*.png`：高保真原型设计稿
- `*.html`：HTML + Tailwind 高保真还原稿，可直接用浏览器打开
- `assets/good-version-prototype.css`：原型共享样式
