# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- 服务器地址可配置：设置 → 数据 → 服务端地址（写入本地并持久化，支持连接远程服务端）。
- 前端组件测试（jsdom + Testing Library）：工作台 Board、快捷链接、倒计时组件。
- 后端 tRPC 路由测试：config / graph。
- 4 套皮肤统一 Arco 组件 token 覆盖。

### 变更
- 总览页重命名为「工作台」，由可自定义组件组成。
- 侧边栏「废弃站」更名为「回收站」。
- 工作台默认布局移除「快捷链接」组件（保留在组件选择器中可选）。
- 移除主题切换：每套皮肤固定明暗模式（Glass 亮 / Nothing、Bloomberg、Effect 暗）。
- 皮肤样式全部重写为统一设计令牌。

## [0.1.0] - 2026-08-12

### 新增
- Tauri v2 桌面客户端：React 19 + Arco Design + Zustand + tRPC。
- Express 5 + Drizzle + libSQL 后端服务。
- 笔记 / 卡片 / 收藏 / 文件 四种类型，Tiptap Markdown 编辑器，`[[双链]]`。
- 自动打标签、自动摘要、自动四象限分类。
- AI 对话面板 + RAG 向量语义检索。
- d3 关系图谱。
- AI Providers（OpenAI / Anthropic / DeepSeek / Ollama / 自定义）。
- MCP Servers 工具调用。
- 数据导出 / 导入（JSON 备份、Markdown 文件夹）。
- 浏览器扩展（WXT + MV3）一键收藏网页。
