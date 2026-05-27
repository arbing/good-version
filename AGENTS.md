# AGENTS.md

## 项目概述

「好版本」是一个面向非技术用户的本地桌面版本管理工具。

核心目标是让不会 Git 的用户，在使用 Coding Agent 创建和修改项目时，可以保存“当前能正常工作的好版本”，并在项目被改坏后安全回到旧版本。

## 当前阶段

当前处于产品定义和技术方案阶段。

主要资料分为两类：

需求与方案文档在 `docs/` 目录：

- `docs/mvp-requirements.md`：MVP 需求说明
- `docs/prd.md`：产品需求文档
- `docs/competitor-research.md`：竞品调研摘要
- `docs/scope.md`：首版功能边界
- `docs/technical-constraints.md`：技术实现约束
- `docs/technical-plan.md`：技术方案
- `docs/development-tasks.md`：开发任务拆分
- `docs/prototype-structure.md`：原型页面结构

高保真原型在 `prototypes/` 目录：

- `prototypes/*.png`：高保真原型设计稿
- `prototypes/*.html`：对应的 HTML + Tailwind 高保真还原稿
- `prototypes/assets/good-version-prototype.css`：原型共享样式

## 产品原则

- 面向非技术用户，不要求理解 Git
- 界面不暴露 Git、commit、branch、tag 等概念
- 底层可以使用 Git 实现版本保存和回退
- 本地优先，不自动上传、不自动推送
- 回退前必须先保存当前状态
- 每个好版本必须能长期找回

## 首版技术方向

- Tauri 桌面应用
- 支持 macOS + Windows
- 应用内置 Git 能力，不要求用户安装 Git
- 中文界面

## 协作要求

- 修改需求前先确认产品决策是否已记录在 `docs/`
- 不主动扩大 MVP 范围
- 不引入云同步、团队协作、分支管理、代码 diff、自动测试等首版明确不做的能力
- 涉及回退逻辑时，优先保证可恢复和可验证
