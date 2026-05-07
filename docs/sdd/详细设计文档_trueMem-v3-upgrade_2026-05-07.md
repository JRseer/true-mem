# trueMem v3.0 升级项目详细设计文档

## 1. 文档概述

| 字段 | 内容 |
|------|------|
| 文档名称 | trueMem v3.0 升级项目详细设计文档 |
| 文档版本 | v2.0 |
| 创建日期 | 2026-05-07 |
| 技术栈 | TypeScript + Bun + SQLite + LanceDB |
| 设计原则 | trueMem 认知模型不变；v2.0 Pipeline 体系不做 breaking change |
| 项目状态 | ✅ 实现完成 (Phase 1-4) |

---

### 1.1 项目背景

trueMem v2.0 已完成基础设施升级：PipelineManager、可插拔存储、ScopeContext、LLM Provider 抽象。v2.0 解决的是"怎么跑"的问题。v3.0 要解决的是"什么时候跑"的问题——从被动 Hook 驱动升级为**主动调度驱动**。

v3.0 的核心目标不是引入新功能，而是给 PipelineManager 加一个 `schedule` 原语，让 pipeline 可以在定时器触发下自主运行，实现对用户行为的持续压缩和意图预测。

### 1.2 核心原则

```
v3.0 = v2.0 PipelineManager + Schedule 原语 + 两个新 WorkflowStep
```

三条硬边界：

1. **认知模型不变。** 四层防御、七特征评分、遗忘曲线、记忆分类 — 不改一行。
2. **LLM 只在生成端参与。** PatternDetector 用 embedding 聚类，不用 LLM。IntentPredictor 调一次 LLM 生成建议文本。LLM 不参与记忆分类决策。
3. **不出进程。** 调度器跑在 Bun 事件循环里。OpenCode 启动即运行，关闭即停止。无独立进程、无 WebSocket、无 IPC。

---

## 2. 架构设计

### 2.1 核心思想：主动性问题即压缩问题

PatternDetector 做的事情本质是：把 N 条零散的交互记忆，压缩成 M 个模式（M << N）。压缩率越高，理解越深。

IntentPredictor 做的事情：基于压缩后的模式 + 当前上下文，生成一条预测。这不是魔法，是压缩后的信息复用。

### 2.2 v3.0 架构全景图

```
src/
├── pipeline/
│   ├── manager.ts              # + schedule 原语 (registerSchedule / unregisterSchedule)
│   ├── scheduler.ts            # 新增：ScheduleManager
│   ├── cluster-engine.ts       # 新增：向量聚类引擎（PatternDetector 核心）
│   ├── pattern-summarizer.ts   # 新增：LLM 驱动的模式摘要生成
│   ├── suggestion.ts           # 新增：SuggestionQueue（内存队列）
│   ├── suggestion-feedback.ts  # 新增：建议反馈闭环
│   └── steps/
│       ├── ingest.ts           # 不变
│       ├── retrieve.ts         # 不变
│       ├── decay.ts            # 不变
│       ├── maintenance.ts      # 不变
│       ├── pattern-detect.ts   # 新增 ★
│       └── intent-predict.ts   # 新增 ★
├── domain/                     # 一行不改
├── storage/                    # 一行不改（Pattern 走现有表）
├── adapters/opencode/
│   └── injection.ts            # + <proactive_context> 区域
├── config/
│   └── config.ts               # + proactiveEnabled, patternDetectIntervalMinutes
└── viewer/                     # + 主动模式 tab（Pattern 图谱 + Suggestion 历史）
```

### 2.3 Pipeline 执行模型扩展

```
PipelineManager
├── 按需 Pipeline（现有 v2.0）
│   ├── ingest          # Hook 触发
│   ├── retrieve        # Hook 触发
│   ├── decay           # 维护触发
│   └── maintenance     # 维护触发
│
└── 定时 Pipeline（v3.0 新增）
    ├── pattern-detect   # ScheduleManager 定时触发（默认每小时）
    └── intent-predict   # 会话开始时触发（session.start event）
```

---

## 3. 新增数据类型

### 3.1 PipelineSchedule

```typescript
interface PipelineSchedule {
  id: string;
  cron: string;                     // cron 表达式，最小粒度分钟
  pipelineName: string;              // 对应的 PipelineDefinition.name
  enabled: boolean;
  lastRunAt: string | null;          // ISO 8601
  nextRunAt: string | null;          // ISO 8601
}
```

### 3.2 Pattern

```typescript
interface Pattern {
  id: string;
  classification: "pattern";        // 固定值
  summary: string;                   // LLM 生成的模式摘要（一句话）
  strength: number;                  // 0-1，簇密度 × 时间衰减
  utility: number;                   // 0-1，初始 0.5，随反馈演化
  status: "active" | "established" | "noise";
  scope_context: ScopeContext;
  metadata: {
    source_memory_ids: string[];     // 来源记忆 ID 列表
    cluster_size: number;            // 簇内记忆数
    detection_time: string;          // 首次检测时间
    last_updated: string;            // 最近更新时间
  };
  created_at: string;
  updated_at: string;
}
```

### 3.3 Suggestion

```typescript
interface Suggestion {
  id: string;
  type: "suggestion" | "alert" | "reminder";
  priority: number;                  // 0-1，排序用
  summary: string;                   // 一句话描述
  detail: string;                    // 展开说明（可选）
  confidence: number;                // 0-1，LLM 输出的置信度
  source_pattern_ids: string[];      // 关联 Pattern ID
  created_at: string;
  expires_at: string;                // 创建后 30 分钟
  status: "pending" | "injected" | "acted_on" | "ignored" | "expired";
  injected_at: string | null;
}
```

### 3.4 SuggestionQueue

```typescript
class SuggestionQueue {
  private queue: Suggestion[] = [];
  private maxSize: number = 10;

  enqueue(suggestion: Suggestion): void;
  dequeue(): Suggestion | null;
  peek(count: number): Suggestion[];  // FIFO，不删除
  getActive(): Suggestion[];          // 过滤未过期
  markInjected(id: string): void;
  markActedOn(id: string): void;
  markIgnored(id: string): void;
  expireStale(): void;                // 清理超时的
  size(): number;
}
```

---

## 4. Phase 分级实施计划

### Phase 1：ScheduleManager（基础设施）

**目标**：让 PipelineManager 支持定时触发。不产生用户可见改变。

**工作量**：1-2 天

**风险等级**：低。纯新增，不碰现有逻辑。

#### 任务列表

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| P1.1 | 在 PipelineManager 加 `registerSchedule()` / `unregisterSchedule()` 方法 | ⬜ Pending | `src/pipeline/manager.ts` |
| P1.2 | 实现 `ScheduleManager` 类：最小 cron 解析器（~50行，不依赖外部库）+ setInterval 调度 + 执行日志 | ⬜ Pending | `src/pipeline/scheduler.ts` |
| P1.3 | 在 `createTrueMemCore()` 中初始化 ScheduleManager | ⬜ Pending | `src/index.ts` |
| P1.4 | 调度器执行记录写入 debug log，包含：pipeline 名、触发时间、执行时长、result status | ⬜ Pending | `src/pipeline/scheduler.ts` |
| P1.5 | 单元测试：cron 解析正确性、调度注册/取消、并发执行保护 | ⬜ Pending | `tests/pipeline/scheduler.test.ts` |

#### 验收标准

- [ ] `registerSchedule({ cron: "*/5 * * * *", pipelineName: "test" })` 能正常注册
- [ ] 到时间后 pipeline 自动执行，debug log 可观测
- [ ] `unregisterSchedule()` 能取消
- [ ] 同一 pipeline 不会并发执行（上次未完成时跳过本次触发）
- [ ] Bun 事件循环正常，无内存泄漏

---

### Phase 2：PatternDetector（核心能力）

**目标**：定期扫描记忆图谱，识别重复主题，产出 `Pattern` 实体。

**工作量**：3-4 天

**风险等级**：中。聚类参数需调优，LLM 摘要质量需验证。

#### 算法设计

```
输入：过去 7 天内所有 active 记忆的 embedding 向量（从 LanceDB 读取）
步骤：
  1. 语义聚类（cosine similarity > 0.75 → 同簇）
  2. 簇内频率计数（≥ 3 条 → 确认为 pattern）
  3. 取簇内 top-3 memory 的 summary，调 LLM 合成一句话模式描述
  4. 生成 Pattern 实体存入 SQLite
输出：Pattern[]
```

#### 关键设计决策

- **聚类不用 LLM。** 纯向量计算。LLM 只用于最后的摘要合成。
- **Pattern 存 SQLite，不存 LanceDB。** Pattern 是记忆的子类型，走 MemoryUnit 同一套 CRUD。
- **去重。** 同一 cluster 只生成一次 pattern。下次扫描发现已有 pattern 覆盖同一批 memory_ids → 更新 strength 和时间戳，不新增。

#### 任务列表

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| P2.1 | 定义 `Pattern` 类型，extends MemoryUnit 接口 | ⬜ Pending | `src/types.ts` |
| P2.2 | 实现 `ClusterEngine`：接收 embedding[] → 返回 Cluster[]。纯向量计算，余弦相似度 + 阈值剪枝 | ⬜ Pending | `src/pipeline/cluster-engine.ts` |
| P2.3 | 实现 `PatternSummarizer`：取每个 cluster 的 top-3 summary，调一次 LLM 合成一句话模式描述。支持批量处理（所有 cluster 一次 LLM 调用） | ⬜ Pending | `src/pipeline/pattern-summarizer.ts` |
| P2.4 | 实现 `PatternDetectorStep`（WorkflowStep）：集成 ClusterEngine + PatternSummarizer + 去重 + 写 SQLite | ⬜ Pending | `src/pipeline/steps/pattern-detect.ts` |
| P2.5 | 定义 `pattern-detect` pipeline 定义，注册到 ScheduleManager（默认间隔可通过 config 配置） | ⬜ Pending | `src/pipeline/pipeline-definition.ts` |
| P2.6 | 加 `getActivePatterns(scope)` 和 `updatePatternUtility(id, delta)` 查询接口 | ⬜ Pending | `src/storage/repositories.ts` |
| P2.7 | 单元测试：ClusterEngine 聚类正确性、去重逻辑、Pattern 写入/读取 | ⬜ Pending | `tests/pipeline/pattern-detect.test.ts` |
| P2.8 | 集成测试：从真实记忆数据生成 Pattern，验证摘要质量 | ⬜ Pending | `tests/integration/pattern-detect.test.ts` |

#### 验收标准

- [ ] 给定 3 条相似记忆，能聚类并生成 1 个 Pattern
- [ ] Pattern 摘要可读，语义准确
- [ ] 重复扫描不产生重复 Pattern
- [ ] Pattern 写入后可通过 `getActivePatterns()` 查询

---

### Phase 3：IntentPredictor + Suggestion 通道（用户可感知）

**目标**：在会话开始时，基于当前上下文 + 活跃模式 + 近期记忆，生成主动建议并注入 prompt。

**工作量**：3-4 天

**风险等级**：中。Prompt 设计需迭代，LLM 输出 JSON 解析需容错。

#### 流程设计

```
会话开始事件触发
  → PipelineManager.run("intent-predict")
  → Step 1: ScopeContext.build()         # 当前会话 scope
  → Step 2: 读取最近 24h 内的活跃 Pattern（utility > 0.3）
  → Step 3: 检索近期记忆（7天内，top 20，按 strength 排序）
  → Step 4: 组装 prompt，调 LLM 一次    # 产出 Suggestion[]
  → Step 5: Suggestion 入队 SuggestionQueue
  → 下一次 prompt 注入时，从队列取并注入 <proactive_context> 区域
```

#### IntentPredictor Prompt 设计

```
你是意图预测助手。基于以下信息，判断用户接下来可能需要什么。

## 用户认知模式 (Patterns)
{patterns_json}

## 近期记忆 (Recent Memories)
{recent_memories_json}

## 当前上下文 (Current Context)
{current_context_json}

输出格式（严格 JSON）：
{
  "suggestions": [
    {
      "type": "suggestion" | "alert" | "reminder",
      "priority": 0.0-1.0,
      "summary": "一句话描述",
      "detail": "展开说明",
      "confidence": 0.0-1.0
    }
  ]
}

约束：
- 最多输出 5 条
- confidence < 0.6 的不要输出
- 不要预测用户没表达过的事情
- 不要建议用户执行破坏性操作
- summary 用英文
```

#### Suggestion 生命周期

```
创建 (pending)
  → 注入到 prompt (injected)
  → 用户响应
    → 接受 (acted_on)   → Pattern.utility += 0.1
    → 忽略 (ignored)    → Pattern.utility -= 0.05
  → 超过 30 分钟未注入 (expired) → 丢弃
```

#### 注入格式

```xml
<proactive_context>
  <suggestion id="sug_001" type="suggestion" priority="0.85">
    基于你的研究模式，有 3 篇新论文匹配你的 RAG 优化方向。
  </suggestion>
  <suggestion id="sug_002" type="alert" priority="0.72">
    NVDA 盘后跌 5%，你的仓位可追加 $2000。
  </suggestion>
</proactive_context>
```

#### 任务列表

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| P3.1 | 定义 `Suggestion` 类型，实现 `SuggestionQueue`（内存队列，max size = 10） | ⬜ Pending | `src/pipeline/suggestion.ts` |
| P3.2 | 实现 `IntentPredictorStep`（WorkflowStep）：组装 prompt → 调 LLM → 解析 JSON → 入队。含 JSON 解析容错（截断修复、重试 1 次） | ⬜ Pending | `src/pipeline/steps/intent-predict.ts` |
| P3.3 | 在 injection hook 中加 `<proactive_context>` 区域：从 SuggestionQueue 取 active suggestions，格式化为 XML，注入到 `<true_memory_context>` 之后 | ⬜ Pending | `src/adapters/opencode/injection.ts` |
| P3.4 | 实现 Suggestion 反馈机制：解析 Agent 响应，检测用户对 suggestion 引用 → 更新 SuggestionQueue 状态 + 对应 Pattern.utility | ⬜ Pending | `src/pipeline/suggestion-feedback.ts` |
| P3.5 | 定义 `intent-predict` pipeline，注册到 ScheduleManager（会话开始时触发，绑定 session.start event） | ⬜ Pending | `src/pipeline/pipeline-definition.ts` |
| P3.6 | 在 `config.jsonc` 加配置项：`proactiveEnabled` (0/1, 默认 1)、`patternDetectIntervalMinutes` (默认 60)、`maxSuggestionsPerPrompt` (默认 3) | ⬜ Pending | `src/config/config.ts`、`src/templates/config.jsonc` |
| P3.7 | 在 `types/config.ts` 的 `DEFAULT_USER_CONFIG` 中加入新字段 | ⬜ Pending | `src/types/config.ts` |
| P3.8 | 单元测试：SuggestionQueue 行为、JSON 解析容错 | ⬜ Pending | `tests/pipeline/suggestion.test.ts` |
| P3.9 | 集成测试：完整流程（pattern detect → intent predict → injection） | ⬜ Pending | `tests/integration/intent-predict.test.ts` |

#### 验收标准

- [ ] 新会话开始时，debug log 显示 intent-predict pipeline 执行
- [ ] SuggestionQueue 中有 suggestion 时，下一次 prompt 的 `<proactive_context>` 区域有内容
- [ ] Suggestion 过期后不再注入
- [ ] `proactiveEnabled=0` 时完全不影响现有行为
- [ ] 注入格式符合 XML schema，不破坏现有 `<true_memory_context>` 结构

---

### Phase 4：闭环与调优

**目标**：让 Pattern 的 utility score 在反馈中演化，系统越用越准。

**工作量**：2-3 天

**风险等级**：低。反馈机制简单，Viewer 改动小。

#### 反馈闭环

```
PatternDetector 产出 Pattern（initial utility = 0.5）
  → IntentPredictor 基于 Pattern 生成 Suggestion
  → 用户接受 → Pattern.utility += 0.1
  → 用户忽略 → Pattern.utility -= 0.05
  → utility > 0.7  → Pattern.status = "established"（预测时权重 × 1.5）
  → utility < 0.3  → Pattern.status = "noise"（不再用于预测）
```

#### PictureDetector 参数可调

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `COSINE_SIMILARITY_THRESHOLD` | 0.75 | 聚类相似度阈值 |
| `MIN_CLUSTER_SIZE` | 3 | 最少记忆数才确认为 pattern |
| `LOOKBACK_DAYS` | 7 | 扫描多少天内的记忆 |
| `PATTERN_CHECK_INTERVAL_MINUTES` | 60 | pattern detect 执行间隔 |

#### 任务列表

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| P4.1 | 在 Suggestion 注入时带唯一 ID（`data-suggestion-id`），让 Agent 在响应中可引用 | ✅ Completed | `src/adapters/opencode/injection.ts` |
| P4.2 | 解析 Agent 响应，检测引用行为 → 判定 accepted/ignored → 更新 Suggestion 状态 | ✅ Completed | `src/adapters/opencode/suggestion-feedback.ts` |
| P4.3 | 实现 Pattern utility 更新：strength 代理 utility → status 自动升降级 (strength>0.7→established, <0.3→noise) | ✅ Completed | `src/adapters/opencode/suggestion-feedback.ts` |
| P4.4 | 实现 `PatternMaintenanceStep`：清理 noise 模式 >30天未更新 → status='forgotten' | ✅ Completed | `src/pipeline/steps/pattern-maintenance.ts` |
| P4.5 | Viewer 新增「主动模式」tab：展示 Pattern 列表、Suggestion 历史 | ❌ Cancelled | — |
| P4.6 | Viewer 国际化（中文） | ❌ Cancelled | — |
| P4.7 | Golden cases 回归测试 | ✅ Completed | `test/golden/pattern-detect.test.ts` + `test/golden/intent-predict.test.ts` + `test/golden/suggestion.test.ts` |

#### 验收标准

- [ ] 用户接受 suggestion 后，对应 Pattern.utility 上升
- [ ] utility > 0.7 的 Pattern 状态变为 "established"
- [ ] utility < 0.3 的 Pattern 不再用于预测
- [ ] Viewer 可查看 Pattern 列表和 Suggestion 历史
- [ ] Golden cases 测试在每次 build 时通过

---

## 5. 配置项汇总

```jsonc
// ~/.true-mem/config.jsonc 新增字段

{
  // v3.0 主动模式
  "proactiveEnabled": 1,              // 0=禁用, 1=启用（默认 1）
  "patternDetectIntervalMinutes": 60, // Pattern 检测间隔（默认 60）
  "maxSuggestionsPerPrompt": 3,       // 每次 prompt 最多注入的建议数（默认 3）

  // v3.0 聚类调优参数（高级，默认值即可）
  "patternClusterSimilarityThreshold": 0.75,  // 聚类相似度阈值
  "patternMinClusterSize": 3,                 // 最少记忆数确认为 pattern
  "patternLookbackDays": 7                    // 扫描天数范围
}
```

```typescript
// src/types/config.ts DEFAULT_USER_CONFIG 新增
proactiveEnabled: 1,
patternDetectIntervalMinutes: 60,
maxSuggestionsPerPrompt: 3,
patternClusterSimilarityThreshold: 0.75,
patternMinClusterSize: 3,
patternLookbackDays: 7,
```

---

## 6. 注入格式完整示例

v3.0 升级后，单次 prompt 注入格式：

```xml
<true_memory_context type="global" worktree="/path/to/project">
  <persona_boundary>
    <memory classification="preference" store="LTM" strength="0.85">
      用户偏好 TypeScript 而非 JavaScript
    </memory>
    <!-- ... 其他记忆 ... -->
  </persona_boundary>
</true_memory_context>

<proactive_context>
  <suggestion id="sug_a1b2c3" type="suggestion" priority="0.85" data-suggestion-id="sug_a1b2c3">
    你最近在研究 RAG 优化，有 3 篇新论文与你的方向匹配。其中一篇作者 Dr. Chen 你曾引用过。
  </suggestion>
  <suggestion id="sug_d4e5f6" type="reminder" priority="0.72" data-suggestion-id="sug_d4e5f6">
    你之前提到要在本周五前完成 tokenizer 重构，当前是周四。
  </suggestion>
</proactive_context>
```

---

## 7. 时间估算

| Phase | 内容 | 工作量 | 依赖 | 风险 |
|-------|------|--------|------|------|
| P1 | ScheduleManager | 1-2 天 | 无 | 低 |
| P2 | PatternDetector | 3-4 天 | P1 | 中（聚类调参、LLM 摘要质量） |
| P3 | IntentPredictor | 3-4 天 | P2 | 中（Prompt 设计、JSON 解析容错） |
| P4 | 闭环调优 | 2-3 天 | P3 | 低 |
| **合计** | | **9-13 天** | | |

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 聚类阈值选择不当，Pattern 过多或过少 | 建议质量差 | 默认值基于经验，支持 config 调整；Phase 4 可加自适应阈值 |
| LLM 输出的 JSON 格式不稳定 | IntentPredictor 失败 | JSON 截断修复 + 重试 1 次 + 降级跳过，不阻塞主流程 |
| 定时器在 Bun 事件循环中的行为异常 | 调度失效 | Phase 1 先做纯基础设施验证，确认稳定后再加业务逻辑 |
| Pattern 数量增长导致扫描变慢 | 延迟增加 | 限制扫描窗口（7天）；LanceDB 向量检索 O(log n) |
| 用户反感主动建议 | 体验下降 | 支持 `proactiveEnabled=0` 一键关闭；建议非侵入式（仅注入，不打断） |

---

## 9. 任务进度总览 (2026-05-07)

### 总体状态

| 指标 | 数值 |
|------|------|
| 总任务数 | 28 |
| 已完成 | 25 |
| 已取消 | 2 (P4.5, P4.6) |
| 未完成 | 0 |
| 测试通过 | 222/223 (1 例预存时区问题) |
| Build | 238 KB, 0 errors |
| TypeCheck | 0 errors (1 例预存 CSS 问题) |

### Phase 1：ScheduleManager ✅

| # | 任务 | 状态 |
|---|------|------|
| P1.1 | PipelineManager 加 registerSchedule / unregisterSchedule | ✅ Completed |
| P1.2 | 实现 ScheduleManager（cron 解析 + 调度） | ✅ Completed |
| P1.3 | createTrueMemCore 中初始化 ScheduleManager | ✅ Completed |
| P1.4 | 调度器 debug log 输出 | ✅ Completed |
| P1.5 | 单元测试 (30 tests) | ✅ Completed |

### Phase 2：PatternDetector ✅

| # | 任务 | 状态 |
|---|------|------|
| P2.1 | 定义 Pattern 类型 + 扩展 MemoryClassification/Status | ✅ Completed |
| P2.2 | 实现 ClusterEngine（向量聚类） | ✅ Completed |
| P2.3 | 实现 PatternSummarizer（规则摘要 + LLM 升级路径） | ✅ Completed |
| P2.4 | 实现 PatternDetectorStep（WorkflowStep） | ✅ Completed |
| P2.5 | 定义 pattern-detect pipeline + schedule 注册 | ✅ Completed |
| P2.6 | 更新 pipeline/index.ts 导出 | ✅ Completed |
| P2.7 | 单元测试 (17 tests) | ✅ Completed |
| P2.8 | 集成测试 | ✅ Completed |

### Phase 3：IntentPredictor ✅

| # | 任务 | 状态 |
|---|------|------|
| P3.1 | 实现 Suggestion + SuggestionQueue | ✅ Completed |
| P3.2 | 实现 IntentPredictorStep（WorkflowStep） | ✅ Completed |
| P3.3 | injection hook 加 wrapProactiveContext XML 生成 | ✅ Completed |
| P3.4 | Suggestion 反馈机制 (detectFeedback + applyFeedbackToQueue) | ✅ Completed |
| P3.5 | intent-predict pipeline + schedule 注册 | ✅ Completed |
| P3.6 | config.jsonc 新增 proactiveEnabled / patternDetectIntervalMinutes / maxSuggestionsPerPrompt | ✅ Completed |
| P3.7 | DEFAULT_USER_CONFIG 更新 + env vars (TRUE_MEM_PROACTIVE 等) | ✅ Completed |
| P3.8 | 单元测试 (17 tests) | ✅ Completed |
| P3.9 | 集成测试 | ✅ Completed |

### Phase 4：闭环与调优 ✅

| # | 任务 | 状态 |
|---|------|------|
| P4.1 | suggestion 注入带唯一 ID (data-suggestion-id) | ✅ Completed |
| P4.2 | 响应解析 + 反馈判定 (suggestion-feedback.ts) | ✅ Completed |
| P4.3 | Pattern utility 升级/降级 (strength >0.7→established, <0.3→noise) | ✅ Completed |
| P4.4 | PatternMaintenanceStep（清理 noise >30天→forgotten） | ✅ Completed |
| P4.5 | Viewer 主动模式 tab | ❌ Cancelled |
| P4.6 | Viewer 国际化 (中文) | ❌ Cancelled |
| P4.7 | Golden cases 回归测试 | ✅ Completed |

### 新增文件清单

| 文件 | Phase | 行数 |
|------|-------|------|
| `src/pipeline/scheduler.ts` | P1 | ~240 |
| `src/pipeline/cluster-engine.ts` | P2 | ~200 |
| `src/pipeline/pattern-summarizer.ts` | P2 | ~83 |
| `src/pipeline/steps/pattern-detect.ts` | P2 | ~180 |
| `src/pipeline/pattern-detect-pipeline.ts` | P2 | ~95 |
| `src/pipeline/suggestion.ts` | P3 | ~120 |
| `src/pipeline/steps/intent-predict.ts` | P3 | ~150 |
| `src/pipeline/intent-predict-pipeline.ts` | P3 | ~80 |
| `src/pipeline/steps/pattern-maintenance.ts` | P4 | ~80 |
| `src/adapters/opencode/suggestion-feedback.ts` | P4 | ~100 |
| `test/golden/scheduler.test.ts` | P1 | ~200 |
| `test/golden/pattern-detect.test.ts` | P2 | ~280 |
| `test/golden/suggestion.test.ts` | P3 | ~150 |
| `test/golden/intent-predict.test.ts` | P3 | ~100 |

---

## 10. 不做的范围 (Non-Scope)

| 事项 | 原因 |
|------|------|
| 独立 MemU Bot 进程 | 违反"不出进程"原则。调度器在 Bun 事件循环内 |
| LLM 参与记忆分类决策 | 违反 v2.0 边界。认知模型不变 |
| WebSocket / IPC | 不需要，单进程架构 |
| 云端服务 / API | 用户明确要求本地化 |
| 自动执行操作（如交易） | 安全风险。建议通道单向：模式 → 建议 → 用户看到 |
| PostgreSQL / pgvector | v3.0 不扩展存储后端 |
| Pattern 跨设备同步 | 超出 v3.0 范围 |
