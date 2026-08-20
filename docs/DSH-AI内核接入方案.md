# Lumina × DSH：AI 内核接入方案（方案 2）

> 状态：**已确认实施**（2026-08-20）
> 目标：保留 Lumina 现有知识管理栈（tRPC + libSQL + Tauri + WXT）不动，**仅把 AI/RAG 管道底层换成 DSH（DeepSeek Harness）能力**，让 Lumina 复用 DSH 的 Agent/LLM 内核。
> 决策依据：用户在整体迁移（方案 1）之后评估，选择先做"仅将 DSH 作为 AI 内核"的轻量方案；方案 1 降级为备选长线路线。

---

## 1. 为什么选方案 2

| 维度 | 方案 1（整体迁移） | 方案 2（AI 内核接入） |
|---|---|---|
| 改动面 | 存储/UI/MCP/同步全重写 | 只改 AI 层 |
| 工作量 | 8-9 周 | 1-2 周 |
| 风险 | 高（web bundle 承载 UI 不确定） | 低（不动现有栈） |
| 数据/UI/扩展 | 全部重建 | **全部保留，零改动** |
| 收益 | Agent 生态 + 插件市场 | **复用 DSH Agent/LLM，Lumina 仍是主人** |

方案 2 不取代方案 1，而是：
- **短期见效**：立即获得编码 Agent 能力 + 流式输出 + DeepSeek 生态
- **方案 1 的 P0 前置验证**：验证 DSH LLM/Agent 能力边界（ctx.llm 等价物），为将来整体迁移铺路

---

## 2. DSH 对外接口（已调研确认）

DSH 提供三种**外部进程调用**方式，Lumina 无需嵌入其 Host：

| 接口 | 形态 | 用途 |
|---|---|---|
| **ACP server**（`@deepseek-ai/dsh-acp`） | stdio JSON-RPC（Agent Client Protocol） | `session/new` → `session/prompt` 发文本/图片 → 流式收集 `agent_message_chunk` → 可自动应答权限请求。**最贴合 AI 内核角色** |
| **headless 模式** | `dsh --profile headless "task"` | 一次性任务，answer → print → exit。适合 autoProcess 的摘要/标签批处理 |
| **web loopback**（Typert RPC） | Host 的 `/api` 网关 | 为 DSH 自家 Web client 设计，外部接入成本高，**不推荐** |

### ACP 协议要点（`packages/acp/acp/README.md`）
- 传输：**stdio JSON-RPC**，stdout 保留给协议帧
- `initialize`：协商版本；无 session/editor/terminal/fs/MCP 能力（automation-only）
- `session/new`：创建全新 agent，绝对 `cwd`，额外目录与 mcpServers 非空拒绝
- `session/prompt`：有序文本 + 内联图片；每 session 单飞行请求；正常结束报 `end_turn`
- `session/update`：每个已提交块发一个 `agent_message_chunk`（**可流式**）
- `session/request_permission`：一次性 allow/reject 工具调用审批，客户端可自动应答
- `session/cancel`：取消进行中的 prompt 或自主工作
- 输出特点：**以"已提交消息"为单位交付**（非 token 级），牺牲逐 token 延迟换取干净的自动化结果；推理与工具活动在会话日志中可观测

---

## 3. 落地路径（Lumina 侧改动）

```
┌──────────────────────────┐      stdio JSON-RPC      ┌──────────────────────────┐
│  Lumina server (:3001)    │ ◄──────────────────────► │  dsh ACP (子进程)         │
│   ai/llm 抽象层            │   (spawn dsh-acp)        │  @deepseek-ai/dsh-acp     │
│   ├─ provider.openai      │                          └──────────────────────────┘
│   ├─ provider.anthropic   │
│   └─ provider.dsh (新)     │
└──────────────────────────┘
```

### 3.1 改动清单

| 现状 | 改动 |
|---|---|
| `llm/provider.ts`（Provider 工厂） | 新增 DSH Provider 分支（`type: 'dsh'`）或独立 `llm/dsh.ts`，实现同一套接口 |
| `ai.chat`（RAG 问答） | 新增走 ACP 通道：spawn `dsh-acp` 子进程 → `session/new` → `session/prompt`（携带 RAG 上下文）→ 流式收集 chunk 回传给前端 |
| `note.autoProcess`（摘要/标签批处理） | 新增走 headless 模式或 ACP 复用同一连接 |
| `ai.transform`（润色/改写/翻译） | 同上，走 DSH LLM |
| `ai_suggestions` 审核队列 | 不变（DSH 产出仍先进审核队列） |
| `config.aiProviders` | 支持新增 DSH 类型的 provider 配置（命令路径/模型参数） |

### 3.2 复用点

- RAG 混合检索（BM25+向量+RRF）、`note_blocks` 向量存储：**完全保留**
- MCP 工具回环：当前 Lumina 自建 MCP client 连外部 server，保留；DSH 侧工具能力经 ACP 权限应答暴露
- 前端 AI 面板、流式展示：`ai.chat` 返回值结构不变，仅 source 增加 `'dsh'`

---

## 4. 收益

- **编码 Agent 能力**：RAG 问答升级为 Agent（可跑 subprocess/terminal 工具），不再只是"检索+生成"
- **流式输出**：`agent_message_chunk` 逐块回传，前端可打字机渲染
- **DeepSeek 生态**：官方模型路由、社区 adapter（anthropic 等可真正接入）
- **零迁移风险**：知识管理/UI/扩展/同步全部不动
- **方案 1 铺路**：验证 DSH 能力边界与接入模式，未来整体迁移更顺

---

## 5. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| ACP 是 automation-only，工具/推理不暴露给 Lumina 前端（只在会话日志） | 中 | Lumina 侧仍是 RAG 问答为主，Agent 能力按需展示；可后续叠加 DSH Web UI 作"Agent 工作台" |
| 以"已提交消息"为单位交付，非 token 级延迟 | 低 | 前端按块流式渲染；对摘要/标签类批处理无感知 |
| DSH 需要 Node ≥22.19 / pnpm，子进程依赖环境 | 低 | 文档化前置条件；headless 模式验证后决定是否随 Lumina 打包 |
| 权限请求自动应答策略（一次一请求） | 低 | 默认 allow 只读类工具；敏感操作配置策略 |

---

## 6. 里程碑

### P0 PoC（1 周）
- [ ] 搭建 DSH 本地环境（clone desktop + submodule init + 确认 `demo:acp` 或 `dsh-acp` 可运行）
- [ ] 写最小 ACP 客户端验证：spawn → initialize → session/new → session/prompt → 收到 chunk → end_turn
- [ ] Lumina server 新增 `provider.dsh`，`ai.chat` 接 ACP，跑通一次带 RAG 上下文的问答
- [ ] 验证 headless 模式用于 autoProcess 摘要/标签

**PoC 通过标准**：在 Lumina 设置页配置 DSH provider，AI 面板问答返回流式结果，autoProcess 摘要进审核队列。

### P1 集成（1 周）
- [ ] config 层支持 DSH provider CRUD
- [ ] ai.chat / autoProcess / ai.transform 全量切 DSH
- [ ] 前端流式渲染 + 错误降级（DSH 不可用时回退自有 provider）

---

## 7. 与方案 1 的关系

- 方案 2 实施过程中验证的 DSH 能力边界（ACP/LLM/工具），直接作为方案 1（`docs/DSH-迁移方案.md`）P0 PoC 的输入
- 若未来需要完整 Agent UI/插件市场，再启动方案 1；方案 2 的接入层可复用为方案 1 的 `lumina-core` 的一部分
- **当前路线**：先做方案 2，方案 1 降级为备选长线

---

*本文档由 opencode 基于 DSH 上游 ACP 调研产出，与 `docs/DSH-迁移方案.md`（方案 1）并列，供评审后开工。*