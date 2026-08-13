# 开发环境

## 仓库结构

```
apps/
  desktop/        Tauri v2 桌面客户端 + React 前端（同一前端也可独立构建为 Web 端）
    src/styles/    设计令牌 + 4 套皮肤（skins.css）+ Arco 覆盖
    src-tauri/     Rust 壳 与 lumina-proxy（3002 → 3001 端口转发）
  server/         Express 5 + tRPC 11 + Drizzle + libSQL 后端
  extension/      WXT + MV3 浏览器扩展（网页收藏）
packages/
  shared/         跨端共享类型（Note / AiProvider / McpServer / GraphData 等）
```

## 系统依赖

桌面端（Tauri）构建需要：

```bash
# macOS
xcode-select --install
# 其他平台见 https://v2.tauri.app/start/prerequisites/
```

之后：

```bash
rustc --version   # Rust stable
pnpm --version    # ≥ 9
node --version    # ≥ 22
```

## 常用脚本

| 命令 | 位置 | 作用 |
|------|------|------|
| `pnpm dev:server` | 根 | 后端 tsx watch（:3001） |
| `pnpm dev:desktop` | 根 | 前端 vite dev（:1420） |
| `pnpm tauri dev` | apps/desktop | Tauri 开发（自动跑 vite + 编译壳） |
| `pnpm build` | 根 / apps/desktop | 构建前端产物 dist/ |
| `pnpm tauri build` | apps/desktop | 生成桌面安装包 |
| `pnpm typecheck` | 根 | 全仓 TS 检查 |
| `pnpm test` | 根 | vitest（前端 + 后端） |
| `pnpm db:push` | apps/server | drizzle-kit 同步 schema 到本地库 |
| `pnpm db:studio` | apps/server | Drizzle Studio 可视化 |

## 测试

- 前端：`apps/desktop/src/**/*.test.{ts,tsx}`，jsdom 环境。
- 后端：`apps/server/src/**/*.test.ts`，node 环境；tRPC 路由用 mock db 的 `createCaller` 直接测。

## 皮肤

4 套皮肤由 `body[data-skin]` 驱动，见 `apps/desktop/src/styles/skins.css`。每套皮肤覆盖
语义令牌（`--bg-*`、`--text-*`、`--accent-*` 等）与 Arco 令牌（`--color-*`、`--primary-*`）；
明暗模式固定（Glass 亮 / Nothing、Bloomberg、Effect 暗），由 `lib/theme.ts` 的 `skinMode()` 决定。