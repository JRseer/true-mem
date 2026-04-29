# trueMem Viewer V1.0 — 产品需求文档 (PRD)

**文档版本**: 1.0
**创建日期**: 2025-04-29
**项目类型**: 重点项目
**清晰度评分**: 91/100

---

## 第1章 — 文档基础

| 字段 | 值 |
|------|-----|
| 文档名称 | trueMem Viewer V1.0 |
| 需求提出人 | 开发者 |
| 优先级 | P1 |
| 目标版本 | V1.0 |

---

## 第2章 — 背景与目标

### 2.1 背景

trueMem 是一个 OpenCode 持久内存插件（Bun/TS/SQLite），负责在 AI 编程会话中自动提取、分类、存储和注入记忆。当前 trueMem 没有任何可视化界面，开发者只能通过 SQLite 命令行或日志查看记忆状态。

### 2.2 核心目标

为 trueMem 构建一个 **Web Viewer**，实现两个核心用途：

1. **浏览管理**: 查看、筛选、搜索、编辑和删除记忆条目
2. **实时监控**: 监控 trueMem 运行状态（V1 基于数据库推算）

### 2.3 目标用户

开发者自用（单用户）。

### 2.4 排除范围

- 数据导出功能
- 移动端适配
- 多用户/权限系统

---

## 第3章 — 需求概述

### 3.1 功能清单

| 编号 | 功能 | 优先级 | Tab |
|------|------|--------|-----|
| F01 | 内存浏览（分页列表 + 筛选） | P0 | Feed |
| F02 | 内存详情（内联展开） | P0 | Feed |
| F03 | 文本搜索 | P0 | Feed |
| F04 | 编辑/删除记忆 | P1 | Feed |
| F05 | 统计仪表盘 | P1 | Stats |
| F06 | 运行监控 | P1 | Monitor |
| F07 | 配置管理 | P2 | Settings |

### 3.2 架构概览

```
4 Tab 布局:
┌─────────┬─────────┬─────────┬──────────┐
│  Feed   │  Stats  │ Monitor │ Settings │
└─────────┴─────────┴─────────┴──────────┘
```

---

## 第4章 — 技术架构

### 4.1 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 前端框架 | Preact | 轻量，模仿 codemem UI 架构 |
| 样式 | Tailwind CSS | 替代 codemem 的内联 CSS |
| 状态管理 | 自定义 (plain mutable singleton) | 模仿 codemem 的 state.ts 模式 |
| 图表 | Chart.js | 轻量，Preact 兼容 |
| HTTP 框架 | Hono | Bun 原生支持，轻量高效 |
| 数据库访问 | better-sqlite3 直连 | 直接读取 ~/.true-mem/memory.db |
| 运行时 | Bun | 与 trueMem 主项目一致 |

### 4.2 项目结构

Viewer 代码放在 trueMem 仓库内：

```
src/viewer/
├── server/          # Hono HTTP 服务端
│   ├── index.ts     # 服务入口
│   ├── routes/      # API 路由
│   └── db.ts        # SQLite 连接
├── ui/              # Preact 前端
│   ├── app.ts       # 编排器（模仿 codemem）
│   ├── lib/
│   │   ├── state.ts # 状态管理
│   │   └── api/     # API 客户端
│   ├── tabs/        # Tab 模块
│   │   ├── feed/
│   │   ├── stats/
│   │   ├── monitor/
│   │   └── settings/
│   ├── components/  # 共享组件
│   └── static/      # HTML shell + 静态资源
└── vite.config.ts   # 构建配置
```

### 4.3 数据通道

- 启动时扫描 `~/.true-mem/memory.db`
- Viewer 服务端通过 better-sqlite3 **只读** 打开数据库（写操作仅限 status/classification 更新和 config.json 修改）
- 前端通过 REST API 与服务端通信
- 定时轮询：**5秒间隔**

### 4.4 启动方式

独立 CLI 命令：`bun run viewer`（或 `truemem viewer`）

---

## 第5章 — Feed Tab（内存浏览）

### 5.1 列表视图

| 属性 | 值 |
|------|-----|
| 分页 | 20 条/页，底部分页导航 |
| 默认排序 | updated_at 降序 |
| 列表项展示 | summary 摘要 + store 标签 + classification 标签 + strength 指示 + updated_at |
| 展开方式 | 点击列表项内联展开详情 |

### 5.2 筛选维度（5维）

| 维度 | 字段 | 选项 |
|------|------|------|
| 存储层 | store | stm / ltm / 全部 |
| 分类 | classification | constraint / preference / learning / procedural / decision / semantic / episodic / 全部 |
| 状态 | status | active / decayed / deleted / 全部 |
| 项目 | project_scope | 动态从数据库获取去重值 |
| 强度 | strength | 范围滑块或阈值筛选 |

### 5.3 搜索

- 实现方式：**LIKE %keyword%** 模糊匹配 summary 字段
- 搜索框位于筛选栏上方或旁边
- 搜索与筛选可组合使用

### 5.4 内联详情

点击列表项展开显示完整信息：

| 字段 | 展示方式 |
|------|---------|
| summary | 全文 |
| store / classification / status | 标签 |
| tags | JSON 格式化 |
| associations | JSON 格式化 |
| source_event_ids | JSON 列表 |
| 评分指标 | recency, frequency, importance, utility, novelty, confidence, interference, strength, decay_rate |
| 时间 | created_at, updated_at, last_accessed_at |
| 元数据 | session_id, content_hash, version |

### 5.5 编辑操作

| 操作 | 说明 | 确认 |
|------|------|------|
| 删除记忆 | 软删除：status → 'deleted' | 需确认对话框 |
| 恢复已删除 | status: 'deleted' → 'active' | 无需确认 |
| 修改分类 | 下拉选择新 classification | 无需确认 |

---

## 第6章 — Stats Tab（统计仪表盘）

### 6.1 图表清单

| 图表 | 类型 | 数据源 |
|------|------|--------|
| Store 分布 | 饼图 | COUNT GROUP BY store |
| Classification 分布 | 饼图 | COUNT GROUP BY classification |
| 记忆创建趋势 | 折线图 | COUNT GROUP BY DATE(created_at)，最近30天 |
| Status 分布 | 柱状图 | COUNT GROUP BY status |
| 强度指标概览 | 数值卡片/仪表 | AVG(strength), AVG(importance), AVG(confidence) |
| 项目分布 | 柱状图/饼图 | COUNT GROUP BY project_scope |

### 6.2 刷新

随全局 5 秒轮询刷新。

---

## 第7章 — Monitor Tab（运行监控）

### 7.1 V1 实现（数据库推算）

由于 trueMem 当前未暴露运行时状态 API，V1 从数据库推算：

| 指标 | 推算方式 |
|------|---------|
| 最近活动速率 | 最近 N 分钟内 events 表新增数 / N |
| 错误率 | events 中 hook_type 含 error 的比例 |
| 活跃会话 | sessions 表 status='active' 的数量 |
| 最近事件流 | events 表最新 N 条，按 timestamp 降序 |
| 记忆健康度 | active 记忆数 / 总数，平均 strength |

### 7.2 V2 规划（后续迭代）

trueMem 新增状态 API endpoint 后，Monitor 可展示：
- 实时队列深度
- Worker 状态
- 处理速率
- 错误日志流

---

## 第8章 — Settings Tab（配置管理）

### 8.1 可编辑配置项

| 配置项 | 类型 | 说明 |
|--------|------|------|
| injection_mode | 下拉选择 | 注入模式 |
| subagent_mode | 下拉选择 | 子代理模式 |
| max_memories | 数字输入 | 最大记忆数 |
| embeddings | 开关 | 是否启用嵌入 |

### 8.2 配置文件

- 路径：`~/.true-mem/config.json`
- Viewer 直接读写此文件
- 修改后显示提示："配置已保存，需重启 trueMem 生效"

### 8.3 附加功能

- **重置为默认**: 恢复 config.json 到默认值
- **原始文件查看**: 只读展示 config.json 原始 JSON 内容

---

## 第9章 — 非功能性需求

| 需求 | 规格 |
|------|------|
| 平台 | Windows |
| 主题 | 暗色主题（深色背景 + 薄荷绿强调色） |
| 刷新策略 | 5 秒定时轮询 |
| 启动方式 | `bun run viewer` CLI 命令 |
| 数据库 | 只读为主，仅 status/classification 更新和 config 修改为写操作 |
| 并发 | 单用户，无需并发控制 |

---

## 第10章 — 数据库 Schema 参考

### 10.1 表结构

**schema_version**: version(INT PK), applied_at(TEXT)

**sessions**: id(TEXT PK), project(TEXT), started_at(TEXT), ended_at(TEXT), status(TEXT DEFAULT 'active'), metadata(TEXT JSON), transcript_path(TEXT), transcript_watermark(INT), message_watermark(INT)

**events**: id(TEXT PK), session_id(TEXT FK→sessions), hook_type(TEXT), timestamp(TEXT), content(TEXT), tool_name(TEXT), tool_input(TEXT), tool_output(TEXT), metadata(TEXT JSON)
- 索引: idx_events_session, idx_events_timestamp

**memory_units**: id(TEXT PK), session_id(TEXT FK→sessions), store(TEXT), classification(TEXT), summary(TEXT), source_event_ids(TEXT JSON), project_scope(TEXT), content_hash(TEXT), created_at(TEXT), updated_at(TEXT), last_accessed_at(TEXT), recency(REAL), frequency(INT), importance(REAL), utility(REAL), novelty(REAL), confidence(REAL), interference(REAL), strength(REAL), decay_rate(REAL), tags(TEXT JSON), associations(TEXT JSON), status(TEXT DEFAULT 'active'), version(INT), embedding(BLOB)
- 索引: 8个 (store, status, strength, classification, session, project_scope, status+strength, content_hash)

### 10.2 枚举值

| 字段 | 可选值 |
|------|--------|
| store | stm, ltm |
| classification | constraint, preference, learning, procedural, decision, semantic, episodic |
| status (memory) | active, decayed, deleted |
| status (session) | active, (其他由 trueMem 定义) |

---

## 附录 — 模仿 codemem UI 的关键约定

| 约定 | 说明 |
|------|------|
| 编排器模式 | app.ts 统一管理 Tab 切换、轮询、初始化 |
| Tab 契约 | 每个 Tab 导出 initXxxTab() + loadXxxData() |
| 状态管理 | plain mutable singleton (state.ts)，直接读写 |
| DOM 路由 | hidden 属性切换 Tab 面板，非框架路由 |
| 组件导出 | export function（命名导出，非 default） |
| API 层 | lib/api/ 下按域分模块，fetchJson 封装 |
| 样式差异 | 使用 Tailwind CSS 替代 codemem 的内联 CSS |
