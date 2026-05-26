# 好版本竞品调研摘要

## 结论

相似需求已经在多个产品里出现，说明“Coding Agent 修改代码后需要安全回退”是真实痛点。

现有产品大多分为三类：

1. Git GUI：降低 Git 操作门槛，但仍面向开发者
2. AI 编码工具：内置 checkpoint / rollback，但绑定具体平台
3. 本地历史与快照工具：用户心智更接近普通人，但不专门面向代码项目

「好版本」的差异化方向是：面向非技术用户、跨 Coding Agent、本地桌面、界面完全不暴露 Git。对于好版本创建的新仓库，版本历史保存在应用数据目录中，让项目文件夹被误删后仍有恢复空间。

## Git GUI 类

### GitHub Desktop

核心能力：GUI 提交、分支、stash、历史、diff、revert、compare versions。

启发：用“提交摘要 + 变更预览 + 一键回退”降低命令行依赖。

差异：仍围绕 GitHub 和开发流程，非技术用户仍需要理解 Git 概念。

来源：

- https://github.com/apps/desktop
- https://docs.github.com/en/desktop

### GitKraken Desktop

核心能力：可视化提交图、Diff View、File History、AI commit、Agent 会话/分支上下文。

启发：Agent 变更集中视图和可视化历史地图。

差异：功能较重，概念仍偏开发者。

来源：

- https://www.gitkraken.com/git-client

### Sourcetree

核心能力：免费 Git GUI、分支图、按文件/hunk/行暂存、diff、stash、cherry-pick。

启发：可以借鉴分块选择保存版本，但 MVP 不做选择文件。

差异：完整 Git 客户端，不适合完全不会 Git 的用户。

来源：

- https://www.sourcetreeapp.com/

### Tower

核心能力：Undo everything、File History、Blame、Diff、冲突向导、PR、Worktree。

启发：全局 Cmd+Z 式撤销能降低误操作恐惧。

差异：面向专业 Git 工作流。

来源：

- https://www.git-tower.com/

### Anchorpoint

核心能力：Git-based、checkpoint、Git LFS、文件锁、缩略图、批注、回退。

启发：把 commit 改成 checkpoint，面向艺术家和设计师，是最接近「好版本」的参考。

差异：偏美术资产、大文件和设计协作场景。

来源：

- https://www.anchorpoint.app/

### Unity Version Control / Gluon

核心能力：大文件/二进制、艺术家与程序员双工作流、桌面端、Unity 集成、云协作。

启发：轻量模式 + 专家模式分层设计。

差异：游戏和 3D 垂直场景更强。

来源：

- https://docs.unity.com/ugs/en-us/manual/devops/manual/unity-version-control

## AI 编码工具类

### Cursor

官方可确认 Agent Review、diff、对比 main 分支，未确认内置 checkpoint/restore。

解决程度：部分解决，能发现问题，回退依赖 Git 或手动 revert。

来源：

- https://cursor.com/docs/agent/agent-review
- https://cursor.com/learn/reviewing-testing

### Windsurf

Cascade 支持 named snapshot/checkpoint，可 revert 到某步；worktrees 隔离并行任务。

解决程度：能解决“上一步能跑，下一步坏了”的回退问题。

启发：每轮可命名快照、从对话步骤回退、并行隔离。

来源：

- https://docs.windsurf.com/windsurf/cascade/cascade.md
- https://docs.windsurf.com/windsurf/cascade/worktrees.md

### Lovable

主要靠 GitHub 双向同步、分支、fallback/sync 分支防丢失。

解决程度：部分解决。

启发：GitHub 分支/PR 可作为外部版本保险，但不适合 MVP。

来源：

- https://docs.lovable.dev/integrations/github.md

### Replit

Agent 自动创建 checkpoints，可 rollback 到任意旧状态，包含项目文件、上下文、环境、Agent memory；File History 支持单文件 diff/restore。

解决程度：覆盖最完整。

启发：未来可考虑项目文件、上下文、环境一起回退。

来源：

- https://docs.replit.com/references/version-control/checkpoints-and-rollbacks.md
- https://docs.replit.com/references/version-control/file-history.md

### Bolt

Version history 自动/手动备份，可预览旧版本后 Restore；聊天历史、zip、GitHub 也可恢复。

解决程度：能解决项目文件回退，但不回滚 Bolt/Supabase 数据库。

启发：恢复前预览、收藏关键版本。

来源：

- https://support.bolt.new/building/using-bolt/rollback-backup

### v0

部署文档提到失败时可 Go back one version，多版本建议用 Vercel preview/分支。

解决程度：偏部署级上一版本回退。

来源：

- https://v0.app/docs/deployments

### Claude Code

`/rewind` 自动 checkpoint，可恢复代码、会话或两者；SDK 支持 file checkpointing/rewindFiles；Bash 改动不跟踪。

解决程度：能解决，但限 Claude Code 编辑工具改动。

启发：代码与会话可分开回退。

来源：

- https://code.claude.com/docs/en/checkpointing.md
- https://code.claude.com/docs/en/agent-sdk/file-checkpointing.md

### GitHub Copilot Coding Agent

Coding Agent 在分支/PR 中改代码，用户可 review diff、继续迭代，无专门 rollback。

解决程度：部分解决。

启发：PR diff、commit/log 透明追踪。

来源：

- https://docs.github.com/en/copilot/concepts/coding-agent/coding-agent

## 快照与本地历史类

### JetBrains Local History

IDE 自动记录文件、目录、项目的有意义变更，可手动打标签。

启发：自动快照、局部恢复、标签。

来源：

- https://www.jetbrains.com/help/idea/local-history.html

### VS Code Timeline / Local History

Timeline 统一展示本地历史与 Git 事件。

启发：用时间线弱化版本控制概念。

来源：

- https://code.visualstudio.com/docs/sourcecontrol/overview

### macOS Time Machine

小时级本地或外置盘快照，按文件夹位置进入时间轴恢复。

启发：空间位置 + 时间轴，比项目概念更自然。

来源：

- https://support.apple.com/guide/mac-help/restore-files-mh11422/mac
- https://support.apple.com/en-us/102154

### Figma Version History

自动 30 分钟检查点，支持手动命名版本，Restore This Version，恢复是非破坏性的。

启发：恢复也生成新检查点，降低误操作恐惧。

来源：

- https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history

### WordPress Revisions

文章/页面保存点，颜色 diff，可 Restore 或复制局部块。

启发：面向非技术用户的可视化差异。

来源：

- https://wordpress.com/support/page-post-revisions/

### Wix / Webflow

站点级备份和页面恢复。

启发：用“发布 / 备份 / 恢复”替代 Git 术语。

来源：

- https://support.wix.com/en/article/wix-editor-viewing-and-restoring-previous-versions-of-your-site
- https://university.webflow.com/lesson/backups-versioning
