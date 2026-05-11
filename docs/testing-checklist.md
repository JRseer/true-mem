# True-Mem 记忆命中追踪功能测试清单

## 测试环境
- 项目路径: D:\Program Files\trueMem
- Viewer URL: http://127.0.0.1:3456
- 数据库路径: ~/.true-mem/memory.db

## 测试步骤

### 1. 数据库迁移验证
**目标**: 确认 memory_injections 表已创建

**步骤**:
```bash
sqlite3 ~/.true-mem/memory.db "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_injections';"
```

**预期结果**: 输出 `memory_injections`

**检查索引**:
```bash
sqlite3 ~/.true-mem/memory.db "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memory_injections';"
```

**预期结果**: 
- idx_injections_session
- idx_injections_memory
- idx_injections_time

---

### 2. Viewer 界面验证
**目标**: 确认新标签页正常显示

**步骤**:
1. 打开浏览器访问 http://127.0.0.1:3456
2. 检查顶部导航栏是否有"会话"标签
3. 点击"会话"标签

**预期结果**:
- ✅ 导航栏显示 5 个标签：记忆列表、会话、数据统计、运行监控、设置
- ✅ 点击"会话"后页面切换到会话列表
- ✅ 页面标题显示"会话列表"
- ✅ 副标题显示"查看所有会话及其记忆注入历史"

---

### 3. 会话列表功能验证
**目标**: 确认会话列表正常加载

**步骤**:
1. 在"会话"标签页查看会话列表
2. 检查每个会话卡片显示的信息

**预期结果**:
- ✅ 显示会话 ID（font-mono 字体）
- ✅ 显示项目路径
- ✅ 显示开始时间、状态、记忆数、注入数
- ✅ 分页控件正常工作（上一页/下一页按钮）

---

### 4. 记忆注入时间线验证
**目标**: 确认注入历史正常显示

**步骤**:
1. 点击任意会话卡片展开
2. 等待加载完成
3. 查看注入时间线

**预期结果**:
- ✅ 显示"记忆注入时间线 (N)" 标题
- ✅ 每条注入显示：
  - 记忆摘要（完整文本）
  - 分类（constraint/preference/decision 等）
  - 存储类型（STM/LTM）
  - 相关性评分（0.00-1.00）
  - 注入时间（格式化日期时间）
- ✅ 如果无注入记录，显示"此会话无记忆注入记录"

---

### 5. 注入记录生成验证
**目标**: 确认新对话会自动记录注入

**步骤**:
1. 在 OpenCode 中开始新对话
2. 输入任意消息触发记忆注入
3. 刷新 Viewer 的"会话"标签页
4. 找到新会话并展开

**预期结果**:
- ✅ 新会话出现在列表顶部
- ✅ 注入数 > 0
- ✅ 展开后显示注入的记忆列表
- ✅ 每条记忆的相关性评分 = 该记忆的 strength 值

---

### 6. API 端点验证
**目标**: 确认后端 API 正常工作

**测试 /api/sessions**:
```bash
curl http://127.0.0.1:3456/api/sessions?page=1&pageSize=5
```

**预期响应**:
```json
{
  "items": [...],
  "page": 1,
  "pageSize": 5,
  "total": N,
  "totalPages": M
}
```

**测试 /api/sessions/:id/injections** (替换 SESSION_ID):
```bash
curl http://127.0.0.1:3456/api/sessions/SESSION_ID/injections
```

**预期响应**:
```json
{
  "sessionId": "...",
  "injections": [...],
  "total": N
}
```

---

### 7. 数据库内容验证
**目标**: 确认注入记录正确保存

**查询注入记录**:
```bash
sqlite3 ~/.true-mem/memory.db "SELECT COUNT(*) FROM memory_injections;"
```

**查看最近 5 条注入**:
```bash
sqlite3 ~/.true-mem/memory.db "
SELECT 
  mi.session_id,
  mu.summary,
  mi.relevance_score,
  mi.injected_at
FROM memory_injections mi
JOIN memory_units mu ON mi.memory_id = mu.id
ORDER BY mi.injected_at DESC
LIMIT 5;
"
```

**预期结果**:
- ✅ 注入记录数 > 0
- ✅ 每条记录包含 session_id, memory_id, injected_at
- ✅ relevance_score 在 0-1 之间

---

## 已知问题排查

### 问题 1: 会话列表为空
**可能原因**: 数据库中没有会话记录
**解决方案**: 在 OpenCode 中进行一次对话，触发会话创建

### 问题 2: 注入数为 0
**可能原因**: 
- 注入模式设置为 SESSION_START (mode=0)，且会话已注入过
- 数据库中没有活跃记忆

**解决方案**: 
1. 检查配置: `cat ~/.true-mem/config.jsonc | grep injectionMode`
2. 创建新会话测试

### 问题 3: 展开会话后显示"加载中..."不消失
**可能原因**: API 请求失败
**解决方案**: 
1. 检查浏览器控制台错误
2. 检查 Viewer 服务器日志
3. 手动测试 API: `curl http://127.0.0.1:3456/api/sessions/SESSION_ID/injections`

### 问题 4: 类型错误或构建失败
**解决方案**:
```bash
cd "D:\Program Files\trueMem"
bun run typecheck  # 检查类型错误
bun run build      # 重新构建
```

---

## 成功标准

✅ **核心功能正常**:
- [ ] 数据库表和索引已创建
- [ ] Viewer 显示"会话"标签页
- [ ] 会话列表正常加载
- [ ] 点击会话展开显示注入时间线
- [ ] 新对话自动记录注入历史

✅ **数据准确性**:
- [ ] 注入记录的 session_id 正确
- [ ] 注入记录的 memory_id 对应实际注入的记忆
- [ ] relevance_score 等于记忆的 strength 值
- [ ] injected_at 时间戳准确

✅ **用户体验**:
- [ ] 界面响应流畅，无明显卡顿
- [ ] 加载状态清晰（"加载中..."提示）
- [ ] 空状态友好（"此会话无记忆注入记录"）
- [ ] 分页功能正常

---

## 下一步

测试通过后，可以继续：
1. **Phase 3**: 视觉升级（图标、配色、动画）
2. **Phase 4**: 布局优化（筛选器、卡片重设计）
3. **Phase 5**: 性能优化（虚拟滚动、智能刷新）
