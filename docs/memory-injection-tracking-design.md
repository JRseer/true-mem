# 记忆命中追踪设计文档

## 目标
实现对话中记忆命中的可视化追踪，让用户清楚知道哪些对话使用了哪些记忆。

## 数据库 Schema

### 新增表：memory_injections

```sql
CREATE TABLE IF NOT EXISTS memory_injections (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  injected_at TEXT NOT NULL,
  injection_context TEXT,  -- 注入时的查询上下文
  relevance_score REAL,     -- 相关性评分
  was_used BOOLEAN DEFAULT 0, -- 是否被实际使用（未来扩展）
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (memory_id) REFERENCES memory_units(id)
);

CREATE INDEX IF NOT EXISTS idx_injections_session ON memory_injections(session_id);
CREATE INDEX IF NOT EXISTS idx_injections_memory ON memory_injections(memory_id);
CREATE INDEX IF NOT EXISTS idx_injections_time ON memory_injections(injected_at);
```

## API 端点设计

### 1. GET /api/sessions
查询所有会话列表

**响应：**
```json
{
  "items": [
    {
      "id": "ses_xxx",
      "project": "/path/to/project",
      "startedAt": "2026-05-11T10:00:00Z",
      "endedAt": "2026-05-11T11:00:00Z",
      "status": "ended",
      "memoryCount": 5,
      "injectionCount": 12
    }
  ],
  "total": 100
}
```

### 2. GET /api/sessions/:sessionId/injections
查询特定会话的记忆注入历史

**响应：**
```json
{
  "sessionId": "ses_xxx",
  "injections": [
    {
      "id": "inj_xxx",
      "memoryId": "mem_xxx",
      "memorySummary": "用户偏好 TypeScript",
      "classification": "preference",
      "injectedAt": "2026-05-11T10:05:00Z",
      "relevanceScore": 0.85
    }
  ],
  "total": 12
}
```

### 3. GET /api/memories/:memoryId/usage
查询特定记忆的使用历史

**响应：**
```json
{
  "memoryId": "mem_xxx",
  "summary": "用户偏好 TypeScript",
  "usageCount": 25,
  "sessions": [
    {
      "sessionId": "ses_xxx",
      "injectedAt": "2026-05-11T10:05:00Z",
      "project": "/path/to/project"
    }
  ]
}
```

## 前端组件设计

### 1. 新增标签页：会话 (Sessions)
- 会话列表（表格形式）
- 筛选：按项目、时间范围、状态
- 点击会话进入详情页

### 2. 会话详情页
- 会话基本信息（ID、项目、时间）
- 记忆注入时间线（按时间排序）
- 每条注入显示：
  - 记忆摘要
  - 分类标签
  - 相关性评分
  - 注入时间

### 3. 记忆详情页增强
- 新增"使用历史"区域
- 显示该记忆在哪些会话中被使用
- 使用频率统计

## 实现步骤

1. **数据库迁移（v3）**
   - 添加 memory_injections 表
   - 添加索引

2. **后端实现**
   - 修改 injection.ts，在注入时记录到数据库
   - 新增 sessions.ts 路由
   - 新增 API 端点

3. **前端实现**
   - 新增 SessionsTab 组件
   - 新增 SessionDetail 组件
   - 修改 App.tsx 添加新标签页

4. **视觉优化**
   - 时间线组件设计
   - 图标集成
   - 动画效果

## 技术要点

### 注入记录时机
在 `src/adapters/opencode/index.ts` 的 `experimental.chat.system.transform` hook 中，调用 `selectMemoriesForInjection()` 后，将选中的记忆记录到 `memory_injections` 表。

### 性能考虑
- 批量插入注入记录（单次注入可能有 20+ 条记忆）
- 使用事务保证原子性
- 索引优化查询性能

### 数据清理
- 定期清理旧会话的注入记录（可选）
- 或保留所有历史用于分析

## UI 设计原则（Ilya 视角）

1. **高信息密度** - 时间线紧凑，一屏显示更多信息
2. **本质优先** - 突出记忆内容和相关性，弱化装饰
3. **简洁交互** - 点击展开详情，避免多层嵌套
