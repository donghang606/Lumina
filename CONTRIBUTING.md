# Contributing

感谢你愿意为 Lumina 贡献！请先阅读本指南，保证提交质量。

## 环境

- Node.js ≥ 22
- pnpm ≥ 9（本仓使用 `pnpm` workspace）
- 桌面端构建需要 Rust stable 与 Tauri 系统依赖（见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)）

## 常用命令

```bash
pnpm install        # 安装依赖
pnpm dev:server     # 启动后端（:3001）
pnpm dev:desktop    # 启动前端 vite
pnpm typecheck      # 全仓 TS 类型检查
pnpm test           # 全仓测试
pnpm build          # 全仓构建
```

## 提交前

- 涉及数据表 / AI 读写 / 导入导出 / 迁移时，必须同时更新或补充测试。
- 至少运行 `pnpm typecheck && pnpm test` 且全部通过。
- 提交信息用简洁的祈使句描述"做了什么"，例如 `feat: add server url setting`。

## 代码风格

- 遵循已有目录约定（`apps/desktop/src/components`、`apps/server/src/routers`、`packages/shared/src`）。
- 前端组件使用已有 `Glass` / `UiButton` 等原语，不新增重复实现。
- 服务端新增接口统一走 tRPC router，并把输入 schema 交给 zod 校验。
