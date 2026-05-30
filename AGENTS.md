# AGENTS.md

## 项目定位

「好版本」是面向非技术用户的本地桌面版本管理工具。
核心用途是在使用 Coding Agent 修改项目时，保存和恢复“当前能正常工作的好版本”。

## 测试要求

涉及功能变更时，同步评估是否需要补充或更新：

- Vitest 前端单元测试
- Rust 单元测试
- Playwright E2E 测试

## 参考目录

- `docs/`
- `prototypes/`
- `src/`
- `tests/e2e/`
- `src-tauri/`

## 常用命令

```bash
pnpm install
pnpm build
pnpm test
pnpm test:types
pnpm test:e2e
pnpm exec tauri dev
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml
```
