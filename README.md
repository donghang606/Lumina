# Lumina · 萤光

> AI-First 个人知识中心 —— 碎片即入，AI 即理，问即所得。
> 桌面优先的本地知识工作台：混合输入、全自动整理、语义检索、Agent 对话。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![tRPC](https://img.shields.io/badge/tRPC-11-2596BE)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 项目定位

Lumina 不是又一个"手打笔记 + 插件拼装"的知识库，而是**把 AI 整理作为默认动作**的个人知识工作台：

目标

Lumina 的做法

扔进去就不用管

卡片 / 网页收藏 / 文件拖入即入库，自动打标签、自动摘要、自动四象限分类

问即所得

对话面板 + 向量语义检索，直接问你自己的知识库

双链成图

笔记间 `[[双链]]` 自动成图，关系图谱可视化浏览与展开

数据自控

自部署、单用户、无账户体系；核心数据存本地 libSQL 单文件

界面可选

4 套皮肤（Glass / Nothing / Bloomberg / Effect），桌面 & 浏览器双形态

---

## English TL;DR

**Lumina** is a local-first, AI-first personal knowledge center. Toss in notes, bookmarks and files; Lumina auto-tags, auto-summarizes and auto-classifies them, then lets you ask your own knowledge base through a chat panel backed by vector semantic search and a `[[wiki-link]]` graph.

- **Local-first**: notes live in a single embedded libSQL file; no cloud account, no vendor lock-in.
- **Bring your own AI**: OpenAI / Anthropic / DeepSeek / Ollama / any OpenAI-compatible endpoint.
- **Two flavors**: a Tauri **desktop client** (macOS / Windows / Linux installers) and a self-hostable **web build** — pick whichever fits.
- **Tool-calling**: MCP servers can be attached so the AI can call external tools.

---

## 安装方式选择（客户端 / Web 端）

Lumina 前端只有一套代码，两种形态，按你的习惯二选一即可：

| 形态 | 是什么 | 适合谁 | 数据落在哪 |
|------|--------|--------|-----------|
| 🖥️ **桌面客户端**（推荐） | Tauri 打包的原生应用（`.dmg` / `.exe` / `.deb`） | 想要"安装即用"、常驻本地的人 | 本地 libSQL 文件 + 本地或远程 Lumina 服务端 |
| 🌐 **Web 端（自部署）** | 前端静态构建 + 自托管服务端，浏览器访问 | 想要跨设备、只跑一个服务端的人 | 部署机器的 libSQL 文件 |

两者共用同一套代码与功能，仅运行形态不同：

```
┌────────────────────────── Lumina ──────────────────────────┐
│                                                             │
│   桌面客户端 (Tauri)         Web 端 (Vite build + 服务端)     │
│   ├─ 原生窗口 / 系统托盘      ├─ 浏览器访问                    │
│   └─ 连接服务端               └─ 连接服务端                    │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  后端服务 apps/server (Express + tRPC + Drizzle)      │   │
│   │  ├─ tRPC routers：笔记/标签/图谱/AI/MCP/配置/传输      │   │
│   │  ├─ AI 层：Provider 工厂 + 自动标签/摘要/分类 + RAG    │   │
│   │  └─ 数据：libSQL 单文件 + 向量检索                    │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

> 提示：桌面客户端的"设置 → 数据 → 服务端地址"支持连接远程服务端，方便多人各连一台共享服务。

### 方式一：桌面客户端（推荐）

**下载安装包**：到 [Releases](../../releases) 下载对应平台的安装包（macOS `.dmg` / Windows `.exe` / Linux `.deb`，由 CI 自动构建）。

**本地自建服务端**（数据存本机）：

```bash
git clone https://github.com/<你的账号>/Lumina.git
cd Lumina
pnpm install

# 1) 启动后端服务（默认 3001 端口）
pnpm dev:server

# 2) 构建并运行桌面客户端
cd apps/desktop
pnpm tauri dev
```

生产打包安装包：

```bash
cd apps/desktop
pnpm tauri build          # 产物在 src-tauri/target/release/bundle/
```

> 依赖：Node.js ≥ 22、pnpm ≥ 9、Rust stable 与 Tauri 系统依赖（见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)）。

### 方式二：Web 端（自部署）

```bash
git clone https://github.com/<你的账号>/Lumina.git
cd Lumina
pnpm install

# 1) 启动后端服务
pnpm dev:server            # http://localhost:3001

# 2) 构建前端（apps/desktop 即同一套前端）
cd apps/desktop
pnpm build                # 产物在 dist/

# 3) 用任意静态服务器托管 dist/，浏览器访问
```

部署到生产：建议将 `apps/server` 用 `tsx src/index.ts`（或编译后 `node dist/index.js`）常驻运行，并用 Nginx 反代静态前端与服务端 `:3001/trpc`。示例见 [docs/QUICK-START.md](docs/QUICK-START.md)。

### 方式三：浏览器扩展（可选）

WXT 构建的 MV3 扩展，用于一键收藏网页正文：

```bash
cd apps/extension
pnpm dev                  # 开发模式，按 WXT 提示加载到浏览器
pnpm build                # 产物在 .wxt/dist
```

---

## 核心能力

### 输入：碎片即入

- **写卡片 / 笔记**：Tiptap 编辑器，Markdown 工具栏，`[[双链]]` 自动补全与链接悬停预览。
- **网页收藏**：浏览器扩展一键抓取正文（Readability 提取），清洗后入库。
- **文件 / 书签导入**：Markdown / JSON 备份导入，Obsidian 兼容 frontmatter 解析。

### 整理：AI 即理

- **自动打标签**、**自动摘要**、**自动四象限分类**，入库即异步补齐。
- 4 象限视图按"重要/紧急"组织卡片，倒计时 / 待办 / 本周视图都在工作台。

### 检索：问即所得

- **三层检索**：向量（noteBlocks embedding）→ 全文（LIKE 打分）→ 网页语义。
- **AI 对话面板**：RAG 直接回答你的知识库，支持流式输出与 MCP 工具调用。

### 探索：双链成图

- d3 力导向图谱：节点大小随连接度变化，单击打开、双击展开关联、拖拽调整、滚轮缩放。
- 统计角标：笔记总数 / 今日新增 / 类型筛选。

### 工作台（总览）

- 可自定义组件：周视图、统计、动态、灵感、四象限、待办、倒计时、Feed 动态流。
- 拖拽排序、增删组件、恢复默认布局；整套布局保存在本地。

### 自定义

- **4 套皮肤**：Glass（科技玻璃 · 亮）、Nothing（极简工业 · 暗）、Bloomberg（终端 · 暗）、Effect（赛博玻璃 · 暗）。
- **AI Providers**：OpenAI / Anthropic / DeepSeek / Ollama / 任意 OpenAI 兼容端点，API Key 本地 AES 加密。
- **MCP Servers**：挂载外部工具，让 AI 具备行动能力。

---

## 数据与安全边界

| 数据 / 动作 | 去向 |
|-------------|------|
| 笔记、标签、图谱、设置 | 本地 libSQL 单文件（`apps/server/data`），可完整导出 |
| AI API Key（Provider） | 服务端 AES 加密存储（`enc:v1:` 前缀，随机盐） |
| AI 生成 | 仅把相关上下文发送到你自己配置的 AI 服务 |
| 导出 | JSON 完整备份（含来源 URL / 标签 / 时间）/ Markdown 文件夹导出 |
| 浏览器扩展 | 网页正文发往你自己部署的 Lumina 服务端 |

单用户、无账户体系；生产环境不使用官方后端。

---

## 技术架构

### 总体架构

```
Tauri Desktop (v2)
  └── Renderer: React 19 + TS + Vite + Arco Design + Zustand + tRPC client
        ├── 工作台 / 笔记编辑器(Tiptap) / 图谱(d3) / AI 面板 / 设置
        └── 服务层：noteService / aiService / mcpService / transferService

Web 端：同一 React 前端，由任意静态服务器托管

Backend: Express 5 + tRPC 11 + Drizzle + libSQL
  ├── tRPC Routers：note / tag / graph / ai / mcp / config / transfer / feed / extension
  ├── AI Layer：Provider 工厂（OpenAI 兼容）+ 自动标签/摘要/分类 + RAG 检索
  ├── MCP：进程启停 + 工具注册
  └── Data：libSQL 单文件 + noteBlocks 向量

Browser Extension: WXT + MV3 + Readability
```

### 技术选型

| 类别 | 选择 | 版本 |
|------|------|------|
| 桌面壳 | Tauri | v2 |
| 前端 | React + TypeScript | 19 / 5 |
| 构建 | Vite | 6 |
| 状态 | Zustand | 5 |
| 组件库 | Arco Design | 2 |
| 编辑器 | Tiptap + Markdown | 3 |
| API | tRPC | 11 |
| 服务端 | Express | 5 |
| ORM / DB | Drizzle + libSQL | 0.39 / 0.15 |
| 图谱 | d3 | 7 |
| 扩展 | WXT | 0.19 |

---

## 快速启动

```bash
git clone https://github.com/<你的账号>/Lumina.git
cd Lumina
pnpm install

pnpm dev:server     # 终端 1：后端 http://localhost:3001
pnpm dev:desktop    # 终端 2：vite dev server（桌面窗口用 `pnpm tauri dev`）
```

更多见 [docs/QUICK-START.md](docs/QUICK-START.md) 与 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 开发与验证

```bash
pnpm typecheck       # 全仓 TS 检查
pnpm test            # vitest（前端 组件/服务 与 后端 tRPC 路由/库）
pnpm build           # 全仓构建
```

提交前建议至少跑 `pnpm typecheck && pnpm test`。CI（`.github/workflows/ci.yml`）在 push / PR 时自动执行类型检查与测试。

---

## 文档入口

| 文档 | 用途 |
|------|------|
| [docs/QUICK-START.md](docs/QUICK-START.md) | 零基础安装（桌面 / Web 双路径）|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发环境、脚本与系统依赖 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
| [SECURITY.md](SECURITY.md) | 安全报告政策 |

---

## License

Lumina 使用 [MIT License](LICENSE) 开源。你可以自由使用、复制、修改、分发和商用本项目代码；请保留原始版权与许可声明。
