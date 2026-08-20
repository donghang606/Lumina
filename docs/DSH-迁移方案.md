# Lumina → DSH 整体迁移方案

> 状态：**待评审**（2026-08-20）
> 目标：把 Lumina 从自建 tRPC + libSQL 栈**整体迁移到 DSH 插件架构**（DeepSeek Harness + Cordis），保留全部四大能力域：知识管理核心、图谱可视化、AI/RAG 管道、扩展生态。
> 决策依据：用户明确选择"整体迁移到 DSH 插件架构"、"先出迁移方案文档"。

---

## 1. 背景与目标

Lumina 当前是自建全栈：Express 5 + tRPC 11 + Drizzle + libSQL 单文件数据库 + Tauri 桌面壳 + WXT 扩展。经过多轮迭代已具备知识管理核心、图谱、AI/RAG、审核队列、MCP、同步等完整能力。

用户希望把"底部的内核"替换为 [deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)（DSH Desktop），即整体迁移到 DSH 插件架构。

### 1.1 为什么值得迁移

| 维度 | 现状 | 迁移后 |
|---|---|---|
| 内核维护 | 自建 tRPC/Express/LLM 层，全部自己维护 | 复用 DSH 的 agent/llm/tool/session 内核 |
| Agent 能力 | 仅 RAG 问答 + 少量工具 | 完整编码 Agent（subprocess/terminal/plan/todo） |
| 生态 | 无插件生态 | Cordis 插件体系 + DSH 插件市场 |
| AI Provider | 自建 OpenAI 兼容适配（anthropic 未真正支持） | DSH 官方 adapter + 社区适配器 |
| 桌面 | Tauri 自研 | DSH Desktop（Electron 封装 + 插件化外壳） |

### 1.2 为什么有成本

| 维度 | 现状 | 迁移后 | 差距 |
|---|---|---|---|
| 存储 | libSQL 单文件 + 原生 SQL + FTS 缺口靠 LIKE | DSH `ctx.storage` 仅 KV（json/sqlite），**无 SQL/FTS/索引/向量** | 需自建查询层或自开 sqlite 连接 |
| UI | 自建 React 路由（工作台/笔记/图谱/时间线/设置） | DSH web-app 是 **Agent 会话界面**，插件只能注册 slot 区块，**不能定义路由页面** | 知识管理 UI 需整体作为自定义 bundle |
| MCP | 自己是 MCP **server**（对外暴露 9 工具） | DSH 是 MCP **client**（连接外部） | 角色反转，需自己起 server |
| 扩展/同步 | 自有 REST `/api/extension/collect` + LWW 同步 | DSH 无对应 | 需自建 Host 插件 |

---

## 2. 目标架构

```
┌────────────────────────────────────────────────────────────┐
│  DSH Desktop（Electron 壳）                                  │
│   ├─ deepseek-harness Host（fixed 上游版本）                 │
│   │    ├─ dsh-base（core: agent/llm/tool/session/subprocess）│
│   │    ├─ dsh-web-app（官方 Agent Web UI）                   │
│   │    └─ lumina-* 插件（自建知识管理层）                     │
│   │         ├─ lumina-storage    存储域（KV + 自建 sqlite）   │
│   │         ├─ lumina-core       笔记/标签/收藏/同步逻辑      │
│   │         ├─ lumina-web-client 知识管理 UI bundle          │
│   │         ├─ lumina-rag        混合检索（BM25+向量）        │
│   │         ├─ lumina-mcp        MCP server（对外暴露）       │
│   │         └─ lumina-sync       多设备同步                  │
│   └─ desktop-shell（窗口/托盘/profile）                      │
└────────────────────────────────────────────────────────────┘
        │ loopback HTTP/WebSocket
┌───────▼────────────────────────────────────────────────────┐
│  浏览器扩展（WXT MV3）→ 经 /api/extension/collect（Host 插件）│
└────────────────────────────────────────────────────────────┘
```

**核心决策**：知识管理 UI 不嵌进官方 web-app 的 slot，而是作为**独立 bundle（cordis patch 层）挂载一个自定义 web-runtime 页面**，或与官方 Agent UI 并行渲染。这需要先验证（见 PoC）。

---

## 3. 能力域 → 插件映射

### 3.1 知识管理核心（笔记/标签/收藏/时间线/双链/块引用）

| Lumina 现状 | DSH 插件 | 迁移方式 |
|---|---|---|
| `notes`/`tags`/`tags_on_notes`/`note_links`/`note_blocks`/`collections`/`attachments`/`note_tombstones` 8 表 | `lumina-storage` | 声明 `DomainSpec`（KV 域）**或**自开 node:sqlite 连接保留原表结构 |
| tRPC `note.*`（19 procedures） | `lumina-core`（Host 插件）+ `ctx.storage` | 逻辑保留，改为 Cordis service |
| 多标签页编辑器（Tiptap + NoteLinker） | `lumina-web-client` | Tiptap 作为 bundle 内组件引入 |
| feed 过滤/分页 | `lumina-web-client` + `lumina-core` | 前端组合逻辑保留 |

### 3.2 图谱可视化

| Lumina 现状 | DSH 插件 | 迁移方式 |
|---|---|---|
| `graph.getGraphData`（d3 forceSimulation） | `lumina-web-client`（GraphPage bundle） | d3 作为 bundle 内依赖；图数据由 `lumina-core` 服务提供 |
| 双击展开/邻居查询 | 同上 | 保留 |
| `note_links` 双链数据 | `lumina-storage` | 保留 |

### 3.3 AI / RAG 管道

| Lumina 现状 | DSH 插件 | 迁移方式 |
|---|---|---|
| 多 Provider 路由（openai/deepseek/ollama/custom） | DSH `ctx.llm.registerAdapter` | 用 DSH 原生 LLM 层替换自建 `llm/provider.ts` |
| 混合检索（BM25 + 向量余弦 + RRF） | `lumina-rag` | 逻辑保留；向量仍存 sqlite BLOB 或 DSH KV |
| 审核队列（ai_suggestions + review.*） | `lumina-core` service + web 弹层 | 保留（KnowMe 借鉴的设计） |
| autoProcess（分块嵌入+摘要+标签） | `lumina-core` + `ctx.llm` | 保留逻辑，改用 DSH LLM |
| RAG 问答（ai.chat） | `ctx.llm.stream` + `lumina-rag` | 迁移到 DSH agent/llm 能力，**可获得流式** |

### 3.4 扩展生态

| Lumina 现状 | DSH 插件 | 迁移方式 |
|---|---|---|
| MCP server（luminaServer 9 工具，HTTP /mcp） | `lumina-mcp` | 自建 `McpServer` + 注册到 Host 的 HTTP 路由 |
| 浏览器扩展（WXT collect → /api/extension/collect） | `lumina-core` Host 插件 + HTTP route | Host 插件挂 `/api/extension/collect` 等价端点 |
| Obsidian 兼容导出/导入 | `lumina-web-client` + `lumina-core` | 保留（markdown 工具链不变） |
| 多设备同步（LWW + 墓碑） | `lumina-sync` | 逻辑保留，改用 storage 域 |

---

## 4. 数据模型映射

### 4.1 方案 A：自开 sqlite（推荐）

Lumina 的查询（BM25 排序、feed 过滤、图谱度数统计、like 反链）严重依赖 SQL。DSH storage 仅 KV，**无法承载**。官方已有先例：`session-query-sqlite` 插件自开 node:sqlite 连接。

- 插件 `lumina-storage` 用 `node:sqlite` 打开 `$DSH_HOME/profiles/<name>/lumina.db`
- **原 17 表结构原样保留**（`CREATE TABLE IF NOT EXISTS` + 增量列迁移），只迁移连接层
- `ctx.storage` 域仅用于轻量配置（provider 设置、布局），重数据走 sqlite
- 数据迁移：Lumina 现有 `lumina.db` 文件直接拷贝到 profile 目录即可（同格式）

**风险**：`node:sqlite` 在 Host 环境 Node ≥22.19 可用（DSH 要求）；不依赖 DSH storage 版本迁移语义。

### 4.2 方案 B：DSH storage 域 + 自建查询

- 每张表 → 一个 KV 域表（key = 主键，value = JSON）
- BM25/图谱/feed 过滤全部改为**内存索引**（启动时全量载入 + 增量更新）
- 适合轻量场景，但 Lumina 的查询复杂度高，性能与代码量都不如方案 A

> **结论：采用方案 A**，DSH storage 域仅做配置项持久化。

---

## 5. UI 迁移（最大不确定点）

### 5.1 现状差异

- DSH 官方 web-app 是 Agent 会话界面，页面由 `apps/web`（Vite shell）+ UI 插件 slot 组合
- **插件不能注册路由页面**，只能注册 slot 区块
- Lumina 需要 5 个独立页面：工作台 / 笔记 / 图谱 / 时间线 / 设置 + AI 侧栏 + 审核队列弹层

### 5.2 三条可选路径

| 路径 | 做法 | 优劣 |
|---|---|---|
| A. 独立 web-runtime bundle | 自定义 bundle 挂一个"知识管理"入口，内部用自建 React 路由渲染 5 页面；官方 Agent UI 保留 | 迁移最快，UI 几乎不改；与官方 UI 双轨并存 |
| B. 混入官方 slot | 笔记列表/编辑器注册进官方布局 slot | 符合 DSH 组合哲学，但 slot 能力不足以承载完整知识管理 UI，需大量适配 |
| C. 替换 web-app | 用 Lumina UI 整个替换官方 web-app 的 shell | 放弃官方 Agent UI 的会话界面，Agent 能力降级为服务 |

> **建议 PoC 验证路径 A**：`lumina-web-client` 包同时带 `dsh.client` 清单，在官方 web-app 挂一个"Lumina"导航入口，内部独立渲染。验证 slot 注入能否承载完整页面。

---

## 6. 分期里程碑

### Phase 0 — PoC 验证（1 周，先做）
- [ ] 搭建 DSH 本地开发环境（clone deepseek-harness-desktop + submodule init + yarn dev）
- [ ] 写最小插件 `lumina-poc`：自定义 storage 域 + 自开 sqlite + 一个 web bundle 挂独立页面 + 渲染 Tiptap 编辑器
- [ ] 数据迁移脚本：把现有 lumina.db 拷入 profile，验证读写
- [ ] 验证三条关键假设：
  1. 插件能否自开 node:sqlite 并完整保留原表
  2. web bundle 能否承载完整 React 路由页面（含 d3、Tiptap 第三方库）
  3. `ctx.llm` 能否替代自建 provider（含 embedding）

**PoC 通过标准**：在 DSH Desktop 里打开自定义"笔记"页面，能列出并编辑原库笔记，AI 摘要可用。

### Phase 1 — 数据与核心（2-3 周）
- [ ] `lumina-storage`：sqlite 连接层 + 17 表 DDL + 配置域
- [ ] `lumina-core`：note/tag/feed/view 逻辑迁移为 Cordis service（Cordis service 或 ctx.provide）
- [ ] `lumina-web-client`：工作台 / 笔记列表 / 多标签页编辑器 / 设置页 bundle
- [ ] 数据迁移工具 + 校验

### Phase 2 — 图谱 / AI / 审核（2 周）
- [ ] `lumina-web-client`：GraphPage（d3）、TimelinePage bundle
- [ ] `lumina-rag`：混合检索迁移 + embedding（接 `ctx.llm` 或保留自建 embed 端点）
- [ ] 审核队列：autoProcess → ai_suggestions → review 全链路
- [ ] RAG 问答迁到 DSH LLM（获得流式输出）

### Phase 3 — 扩展生态（2 周）
- [ ] `lumina-mcp`：MCP server 注册进 Host HTTP
- [ ] `lumina-sync`：多设备同步
- [ ] 浏览器扩展对接新端点 + Obsidian 导入导出
- [ ] 浏览器扩展 / MCP / 同步回归测试

### Phase 4 — 收尾（1 周）
- [ ] 测试全量迁移（server 111 用例 → 插件测试）
- [ ] 旧 tRPC 栈删除决策（保留 web 形态备用还是彻底移除）
- [ ] 文档 + Obsidian 沉淀

**总计约 8-9 周**。

---

## 7. 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| web bundle 承载完整 React 路由页面可能受限（DSH 客户端 slot 体系只为区块设计） | **高** | Phase 0 优先验证；失败则转路径 C（替换 web-app shell） |
| DSH 固定上游版本，`node:sqlite`/Tiptap/d3 依赖可能与其构建基线冲突 | 中 | PoC 验证第三方库可被 bundle 引入（平台 externals 隐式生效） |
| `ctx.llm` embedding 能力不确定（LLM 层是 stream 契约，embedding 需自建适配） | 中 | 保留 Lumina 自有 /embeddings 调用，仅对话/摘要走 DSH LLM |
| 知识管理 UI 与官方 Agent UI 并存，体验割裂 | 中 | 路径 A 设计统一导航；不行则路径 C |
| DSH Desktop 是社区项目，上游变动快 | 中 | 固定 pin 版本（仓库已 pin 上游 submodule） |
| MCP server 与 DSH MCP client 共存需注意端口/路由冲突 | 低 | lumina-mcp 挂独立路径 `/lumina/mcp` |
| 同步 LWW 时钟基于 notes.updatedAt，迁移后写路径变化需保持版本语义 | 低 | 保留原表结构与 updatedAt 语义 |

---

## 8. 决策点（待确认）

1. **UI 路径**：A（独立 bundle 双轨）vs C（替换官方 web-app shell）→ PoC 决定
2. **embedding**：走 DSH LLM 适配 vs 保留 Lumina 自有 /embeddings 端点 → PoC 决定
3. **web 形态去留**：迁移完成后，Lumina 自建 tRPC 栈是删除还是保留为"web 轻量版"
4. **AI Provider**：全部迁到 DSH adapter，还是允许 lumina-core 同时维护自建 provider 作为 fallback
5. **数据库位置**：沿用现有 lumina.db 文件，还是迁入 DSH profile 目录统一管理

---

## 9. 迁移后收益评估

- **Agent 能力跃升**：编码 Agent（subprocess/terminal/plan/todo/skill）取代纯 RAG 问答
- **流式输出**：RAG 问答获得 stream（DSH llm/stream 原生）
- **Provider 生态**：DSH adapter 体系 + 社区适配器，anthropic 等可真正接入
- **插件生态**：知识管理可拆成可组合插件，对接 DSH 插件市场
- **维护负担**：内核（agent/llm/tool/session）不再自维护

---

*本文档由 opencode 基于 Lumina 源码盘点与 DSH 上游/桌面仓库调研产出，供评审后开工。*