# SESSION STATE

## 当前任务
- 用户要求：继续完成 trueMem v2 升级任务。
- 参考设计：`docs/sdd/详细设计文档_trueMem-v2-upgrade_2026-04-30.md`。
- 当前判断：v2 架构已有 scope、pipeline/storage/upgrade/llm 的部分骨架，但核心实现仍未完成；本轮目标是推进一个可编译、可测试、兼容旧行为的升级切片。

## 当前约束
- 保留 trueMem 认知模型不变量；Pipeline/Storage/LLM 不得覆盖 memory decision。
- SQLite 仍是事实源；LanceDB/向量索引只能作为派生索引。
- 默认保持本地优先，不引入远程 provider 数据外发。
- 不提交 git commit，除非用户明确要求。

## 本轮实施切片
- 决策：先推进 M1 Pipeline Engine 的低风险核心能力，而不是直接搬迁 `process-session.ts` 写入链路。
- 原因：旧 extraction path 仍承担真实记忆写入，直接迁移风险高；补齐 Pipeline 的 `requires` / `produces` / interceptor / 错误策略更符合 SDD 且不破坏旧行为。
- 验证目标：新增/更新 pipeline golden tests，确保兼容旧 `WorkflowStep`，并通过 `bun run typecheck` 与 vitest。
- 完成：`src/pipeline/types.ts` 与 `src/pipeline/manager.ts` 已支持 `requires` / `produces` 元数据契约、step hooks、声明产物校验和失败 trace；`test/golden/pipeline-manager.test.ts` 已覆盖成功、缺失输入、未产出声明输出、hook 错误回调。
- 验证结果：targeted pipeline tests 11 passed；full vitest 77 passed；`bun run typecheck` 0 errors；`bun run build` 成功生成 plugin、embedding worker、viewer、viewer-server 产物。

## 当前升级进度记录
- 已完成升级切片：M1 Pipeline Engine 从基础顺序执行器升级为带契约门禁的执行容器。
- 当前测试基线：Vitest 77 passed；TypeScript typecheck 0 errors；build 成功。
- 下一步任务：实现 `memory.ingest` 的 normalize/classify/dedupe/persist 低风险 steps，必须代理旧 v1 认知函数，不改 classifier/patterns/database 核心行为，不搬迁 `process-session.ts` 主写入链路。
- 成功标准：新增 ingest steps golden tests；保持旧 shell/bridge 测试兼容；全量 vitest、typecheck、build 均通过。

## 最新完成切片：memory.ingest steps wrapper
- 完成：新增 `src/pipeline/steps/ingest.ts`，实现 `ingest.normalize`、`ingest.classify`、`ingest.dedupe`、`ingest.persist` 四个可复用 WorkflowStep。
- 关键边界：`ingest.classify` 代理 v1 `matchAllPatterns`、`classifyWithRoleAwareness`、`shouldStoreMemory`、scope heuristics；`ingest.dedupe` 不复制 SQL，明确委托 `MemoryDatabase.createMemory()` 的 content_hash/reconsolidation 语义；`ingest.persist` 只依赖 `StorageWritePort`。
- 兼容策略：未把 steps 强接入现有 `observeMemoryIngestPipeline` / `process-session.ts` 主写入链路，旧运行路径保持稳定；新 steps 通过 `src/pipeline/index.ts` 暴露给后续迁移使用。
- 测试：新增 `test/golden/ingest-pipeline-steps.test.ts`，覆盖 normalize、显式用户偏好、问题拒绝、assistant 用户偏好拒绝、persist 委托 storage port。
- 验证结果：targeted pipeline+ingest tests 16 passed；full Vitest 82 passed；`bun run typecheck` 0 errors；`bun run build` 成功。
- 下一建议：实现 `process-session.ts` 的可选 shadow-run/feature-flag wiring，让旧写入结果与新 steps 输出做对照，确认一致后再切主链路。

## 当前继续任务
- 决策：继续做 `memory.ingest` feature-flagged shadow-run wiring。
- 原则：默认关闭；开启后只旁路执行新 steps 生成 trace/对照信息，不改变旧 `process-session.ts` 写入结果；shadow-run 失败必须被隔离，不影响真实 extraction。
- 待确认信息：process-session 最安全接入点、现有 config/env flag 模式、可测试 seam。

## 最新完成切片：memory.ingest shadow-run wiring
- 配置：新增 `shadowIngestEnabled`，默认 `0`；环境变量 `TRUE_MEM_INGEST_SHADOW=1` 可开启；`config.jsonc` 生成文本已包含该字段。
- Bridge：`observeMemoryIngestShadowPipeline()` 已可用，使用 `memory.ingest.shadow` 跑 normalize/classify/dedupe/persist 全流程，并通过 shadow `StorageWritePort` 生成无副作用 `MemoryUnit`，不写真实 SQLite。
- Adapter：`process-session.ts` 在 `conversationText` 解析后、旧 classifier/storage 写入前执行 shadow-run；只处理 user role lines；默认关闭；失败 catch 后记录日志并隔离，不影响旧 extraction watermark 与写入流程。
- 测试：新增/扩展 `test/golden/config-shadow-ingest.test.ts` 与 `test/golden/ingest-bridge.test.ts`，覆盖默认关闭、env override、JSONC 生成、无 session skip、shadow full workflow、shadow 错误传播。
- 验证结果：targeted shadow tests 3 files / 14 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 21 files / 89 tests passed；`bun run build` 成功，plugin bundle `index.js` 196.99 KB，viewer 与 viewer-server 均成功构建。
- 下一步建议：进入受控对照阶段，增加 shadow-run 结果与旧 v1 extraction 决策的 diff/telemetry，再决定是否把 `process-session.ts` 主写入路径切到 pipeline steps。

## 当前继续任务：shadow-vs-v1 diff telemetry
- 决策：继续实现 shadow-run 与旧 v1 extraction 决策的对照遥测，不切换主写入路径。
- 原则：默认随 `shadowIngestEnabled` 关闭；开启后只记录对照结果，不写真实 SQLite，不改变旧 watermark/写入/错误传播语义。
- 成功标准：能比较 store/classification/storeTarget/projectScope/summary/reason；shadow 或 diff 失败必须隔离；新增 golden tests 并通过 full vitest/typecheck/build。

## 最新完成切片：shadow-vs-v1 diff telemetry
- Bridge：`compareMemoryIngestShadowDecision()` 已新增，比较 `store`、`classification`、`storeTarget`、`projectScope`、`cleanSummary`、`reason`，并把结果写入 shadow context 的 `metadata.shadowComparison`。
- Adapter：`process-session.ts` 已把 shadow comparison 移到旧 v1 决策生成之后执行；默认仍受 `shadowIngestEnabled` 保护；comparison 失败 catch 隔离，不影响旧 SQLite 写入、watermark 或 extraction 错误语义。
- 类型边界：本轮顺手移除旧写入点的 `classification as any`，改为 `MemoryClassification` guard 后再调用 `createMemory()`。
- 测试：扩展 `test/golden/ingest-bridge.test.ts`，覆盖 matched、field-level mismatch、shadow unavailable 和既有 shadow 错误传播。
- 验证结果：targeted shadow telemetry tests 3 files / 17 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 21 files / 92 tests passed；`bun run build` 成功，plugin bundle `index.js` 199.72 KB，embedding worker、viewer、viewer-server 均成功构建。
- 下一步建议：在开启 `TRUE_MEM_INGEST_SHADOW=1` 的真实本地会话中观察 log mismatch 率；若稳定 matched，再做受控切换开关，把 `process-session.ts` 主写入路径改为 pipeline steps。

## 当前继续任务：pipeline main-write controlled cutover
- 用户授权：`Ilya,负责全权执行下去`，本会话后续升级由我按 SDD 与稳定性约束自主推进；仍不做 git commit，除非用户明确要求。
- 决策：下一刀实现默认关闭的受控切换开关，让 `process-session.ts` 主写入路径可以走 `memory.ingest` normalize/classify/dedupe/persist steps。
- 原则：默认旧路径不变；新开关开启时才把真实 SQLite 写入委托给 pipeline persist step；失败必须回退/隔离到旧路径或显式保持旧行为，不改变 watermark、scope、classification、dedupe/reconsolidation 语义。
- 成功标准：配置开关、主路径切换、golden tests、LSP、targeted tests、full vitest、typecheck、build 全部通过。

## 最新完成切片：pipeline main-write controlled cutover
- 配置：新增独立开关 `ingestWriteEnabled`，默认 `0`；环境变量 `TRUE_MEM_INGEST_WRITE=1` 才启用真实写入切换；与 `shadowIngestEnabled` / `TRUE_MEM_INGEST_SHADOW` 保持独立。
- Bridge：新增 `writeMemoryIngestPipeline()`，使用 `memory.ingest.write` pipeline，以 `ingest.write.seed` 注入 v1 决策，再只执行 `ingest.persist`；不重复 normalize/classify/dedupe，避免与旧认知决策产生分叉。
- Adapter：`process-session.ts` 在旧 v1 决策 `result.store === true` 后尝试 pipeline 写入；默认关闭时完全走旧 `state.db.createMemory`；启用后若 pipeline 写入失败，会记录日志并回退旧写入路径，保持 watermark 与 extraction 错误语义稳定。
- 测试：新增 `test/golden/config-ingest-write.test.ts`；扩展 `test/golden/ingest-bridge.test.ts` 覆盖真实 pipeline persist、拒绝决策 skip、persist 失败传播用于 adapter fallback。
- 验证结果：targeted ingest cutover tests 4 files / 25 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 22 files / 100 tests passed；`bun run build` 成功，plugin bundle `index.js` 204.13 KB，embedding worker、viewer、viewer-server 均成功构建。
- 下一步建议：实现 retrieve pipeline 的 SQLite-first 读取与 scope 强制复核，或者继续把 `process-session.ts` 分类决策也迁移到 pipeline orchestration；在切分类前应先用 `TRUE_MEM_INGEST_WRITE=1` 做本地真实会话冒烟。

## 当前继续任务：memory.retrieve SQLite-first pipeline
- 决策：继续推进 SDD 的 retrieve pipeline 最小切片，而不是立刻把分类决策全部搬进 pipeline。
- 原则：SQLite 仍是 retrieval source-of-truth；ScopeContext 必须参与读取/查询；vector/LanceDB 只能提供派生 hint，且不可用时必须降级；不引入 live LanceDB 依赖。
- 成功标准：新增 `memory.retrieve` pipeline/steps 与 deterministic golden tests，覆盖 scope 强制、SQLite-first 返回、vector degraded fallback，并通过 LSP、targeted tests、full vitest、typecheck、build。

## 最新完成切片：memory.retrieve SQLite-first pipeline
- Pipeline：新增 `src/pipeline/retrieve.ts`，暴露 `memory.retrieve`、`createMemoryRetrievePipelineContext()`、`runMemoryRetrievePipeline()`，上下文强制携带 `ScopeContext`。
- Steps：新增 `src/pipeline/steps/retrieve.ts`，包含 `retrieve.scope`、`retrieve.sqlite`、`retrieve.vector_hint`。SQLite 读取仍通过 `StorageReadPort.getMemoriesByScope()` 作为事实源；vector provider 只写入降级/提示 metadata，不替换 SQLite memory results。
- Scope 边界：`global` 传 `currentProject=undefined`，`project` 传规范化后的 `scope.project`；`session` visibility 明确抛错，因为当前 SQLite schema/SQL 还没有 session-scoped retrieval filter，不能假装支持。
- 导出：`src/pipeline/index.ts` 已导出 retrieve pipeline、steps 和结果类型。
- 测试：新增 `test/golden/retrieve-pipeline-steps.test.ts`，覆盖 project scope SQL filter、global-only retrieval、session visibility rejection、unavailable vector degraded metadata 且 SQLite 结果保持 authoritative。
- 验证结果：targeted retrieve tests 4 files / 15 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 23 files / 104 tests passed；`bun run build` 成功，plugin bundle `index.js` 204.80 KB，embedding worker、viewer、viewer-server 均成功构建。
- 备注：`bg_e95d0894` retrieve-test 探索因上下文注入污染失败，已记录 `.learnings/ERRORS.md`；用直接读取 golden 文件补齐测试设计。
- 下一步建议：把 `memory-retrieval.ts` / `injection.ts` 的读取入口以默认关闭或 shadow 模式接到 `memory.retrieve`，先比较旧读取与 pipeline 读取输出，再受控切换。

## 当前继续任务：memory.retrieve controlled wiring
- 决策：继续把现有读取入口受控接到 `memory.retrieve` pipeline，而不是直接替换所有 injection/compaction 读取路径。
- 当前进度基线：已完成 Pipeline Engine、ingest steps、ingest shadow-run、shadow-vs-v1 diff telemetry、main-write controlled cutover、retrieve SQLite-first pipeline；最新验证为 full Vitest 104 passed、typecheck 0 errors、build 成功。
- 原则：新增读取开关必须默认关闭；关闭时旧 `getMemoriesByScope` / `vectorSearch` 路径完全不变；开启时通过 `memory.retrieve` 读取 SQLite-first 结果；失败必须回退旧读取路径并记录日志，不影响注入/compaction。
- 成功标准：配置开关、读取 helper、入口 wiring、golden tests、LSP、targeted tests、full vitest、typecheck、build 全部通过。

## 最新完成切片：memory.retrieve controlled wiring
- 配置：`src/types/config.ts` 新增 `RetrievePipelineMode`、`retrievePipelineEnabled`，`CONFIG_VERSION` 升到 2；`src/config/config.ts` 新增 `TRUE_MEM_RETRIEVE_PIPELINE` env override、file validation、JSONC 输出和 `getRetrievePipelineEnabledFromConfig()`。
- 接线：新增 `src/adapters/opencode/retrieve-pipeline-routing.ts`，提供 `getScopeMemoriesWithRetrievePipelineFallback()`；默认关闭时直接走 legacy `getMemoriesByScope`，开启时仅把 scope-only reads 路由到 `memory.retrieve`，失败自动回退 legacy scope read。
- 入口：`src/adapters/opencode/memory-retrieval.ts` 的无 query compaction reads 已接入 helper；`src/adapters/opencode/injection.ts` 的 initial scope pool 已接入 helper。带 query 的 `vectorSearch` 路径保持旧逻辑，因为当前 `memory.retrieve` 仍不是 query-aware。
- 测试：新增 `test/golden/config-retrieve-pipeline.test.ts` 和 `test/golden/retrieve-controlled-wiring.test.ts`，覆盖默认关闭、env enable、invalid fallback、ingest flags 独立性、pipeline route、pipeline failure fallback。
- 验证结果：LSP changed files 0 diagnostics；targeted retrieve/config tests 17 passed；`bun run typecheck` 0 errors；full `bunx vitest run` 25 files / 112 tests passed；`bun run build` 成功，plugin bundle `dist/index.js` 215.17 KB。
- 下一步建议：实现 query-aware retrieve pipeline 或先做 `getAtomicMemories()` controlled wiring；在 query-aware 之前，不应替换 query/vectorSearch 分支。

## 当前继续任务：query-aware retrieve pipeline + completion estimate
- 用户要求：继续处理，并汇报距离整个 trueMem v2 升级完成还差多少。
- 决策：下一刀实现 query-aware retrieve pipeline 最小安全切片；这是替换 `getAtomicMemories()`、compaction query path 与 injection flexible vector branch 前的必要条件。
- 原则：SQLite 仍是复核事实源；现有 `vectorSearch(query, worktree, limit)` 语义不能被破坏；vector/query 只能作为排序/候选 hint，失败必须降级到 SQLite scope reads。
- 成功标准：新增/扩展 retrieve pipeline steps 与 routing tests，覆盖 query path、scope enforcement、vector degraded fallback、legacy fallback；通过 LSP、targeted tests、full vitest、typecheck、build。

## 最新完成切片：query-aware retrieve pipeline
- Pipeline：`src/pipeline/steps/retrieve.ts` 新增 `retrieve.query` step，workflow 顺序为 `retrieve.scope -> retrieve.sqlite -> retrieve.query -> retrieve.vector_hint`。
- 语义：query path 先执行 SQLite scope verification，再委托现有 `StorageReadPort.vectorSearch(query, scope.project, limit)` 保持 legacy Jaccard/vectorSearch 排序；metadata 仍为 sqlite normal，因为当前 query ranking 不是 LanceDB authoritative index。
- 接线：`src/adapters/opencode/retrieve-pipeline-routing.ts` 新增 `getQueryMemoriesWithRetrievePipelineFallback()`；`memory-retrieval.ts` query branch、`injection.ts` 的 `getAtomicMemories()` 与 flexible query branch 已受 `TRUE_MEM_RETRIEVE_PIPELINE` 控制，失败回退 legacy `vectorSearch`。
- 测试：`retrieve-pipeline-steps.test.ts` 覆盖 query step 的 SQLite scope verification + legacy ranking；`retrieve-controlled-wiring.test.ts` 覆盖 disabled query legacy path、enabled query pipeline path、query pipeline failure fallback。
- 验证结果：targeted query retrieve tests 5 files / 22 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 25 files / 116 tests passed；`bun run build` 成功，plugin `dist/index.js` 217.57 KB，embedding-worker、viewer、viewer-server 均构建成功。
- 进度评估：v2 升级约 58% 完成。已完成 Pipeline Engine、ingest steps、ingest shadow/diff、受控主写入切换、retrieve SQLite-first、retrieve controlled wiring、query-aware retrieve。剩余关键项：domain port 抽取、decay/maintenance pipeline、LanceDB 实际 provider、upgrade migration/rebuild/verify、session-scope SQL、LLM provider registry/mock、destructive upgrade runbook 与更完整 golden matrix。

## 当前继续任务：domain port delegation layer
- 用户授权：`Ilya,你全权负责执行`，继续由我自主推进 trueMem v2 升级；仍不 commit，除非用户明确要求。
- 决策：下一刀实现 `TrueMemDomainPort` 代理层，先把认知决策接口化，但实现仍委托现有 v1 classifier / patterns / reconsolidation / database 逻辑。
- 原则：不改 `classifier.ts`、`patterns.ts`、`negative-patterns.ts` 的认知行为；不把基础设施依赖引入纯 domain types；先做 delegation seam 与 golden equivalence tests，再让 pipeline steps 逐步依赖 domain port。
- 成功标准：新增 `src/domain/`，提供稳定 domain port interface 和 v1 adapter；golden tests 覆盖分类决策、scope/store 推导、role validation 与旧 v1 行为等价；LSP、targeted tests、full vitest、typecheck、build 全部通过。

## 最新完成切片：domain port delegation layer
- Domain：新增 `src/domain/port.ts`、`src/domain/v1-adapter.ts`、`src/domain/index.ts`。`TrueMemDomainPort` 覆盖 importance scoring、role-aware classification、storage decision、scope/store decision、reconsolidation thresholds；接口层只依赖 `src/types.ts` 核心类型，不依赖 SQLite/database adapter。
- Adapter：`V1TrueMemDomainAdapter` 代理现有 v1 `classifier.ts`、`patterns.ts`、`reconsolidate.ts`，保持 `human_intent_boosted`、`is_question_not_statement`、`invalid_role_assistant_for_preference`、`explicit_global_keyword`、Jaccard-era thresholds 等认知不变量不变。
- 测试：新增 `test/golden/domain-port-v1-adapter.test.ts`，覆盖用户显式 preference、问题拒绝、assistant 用户偏好拒绝、scope/store heuristics、reconsolidation thresholds。
- 失败学习：`bg_e6b03e8f` domain seam background task 因 `<true_memory_context>` 注入污染失败；已记录 `.learnings/ERRORS.md` 的 `ERR-20260501-002`，并用直接文件读取完成 seam 分析。
- 验证结果：LSP 0 diagnostics；targeted domain/cognitive/ingest tests 3 files / 28 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 26 files / 121 tests passed；`bun run build` 成功，plugin `dist/index.js` 217.57 KB，embedding-worker、viewer、viewer-server 均构建成功。
- 下一步：把 `memory.ingest` classify step 从直接调用 v1 classifier/patterns 改为依赖 `TrueMemDomainPort` 默认 adapter，保持 golden tests 不变；随后继续 decay/maintenance pipeline。

## 当前继续任务：ingest domain-port wiring
- 决策：把 `src/pipeline/steps/ingest.ts` 的 classify step 改为通过 `TrueMemDomainPort` 默认 v1 adapter 执行信号匹配、role-aware classification、storage decision、scope/store heuristics。
- 原则：不改变 `MemoryIngestDecision` 输出结构，不改变 shadow/diff/write cutover 行为，不改旧 classifier/patterns/database；golden tests 必须保持原断言。
- 成功标准：ingest/domain targeted tests 通过，full vitest/typecheck/build 通过。

## 最新完成切片：ingest domain-port wiring
- 接线：`src/pipeline/steps/ingest.ts` 的 `ingest.classify` 已改为通过 `TrueMemDomainPort` 执行 `matchImportanceSignals`、`calculateBaseSignalScore`、`calculateRoleWeightedScore`、`classifyWithRoleAwareness`、`shouldStoreMemory`、`resolveProjectScope`、`resolveStore`。
- 默认实现：未改变外部 API，metadata 可注入 `domainPort`/`domain`，未注入时使用 `createV1TrueMemDomainAdapter()`；shadow-run、diff telemetry、main-write cutover 输出结构保持不变。
- 行为边界：不改旧 `classifier.ts` / `patterns.ts` / `database.ts`；`MemoryIngestDecision` 的 `store/reason/classification/cleanSummary/storeTarget/projectScope` 与原 golden 断言保持一致。
- 验证结果：LSP 0 diagnostics；targeted ingest/domain/bridge/cognitive tests 4 files / 39 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 26 files / 121 tests passed；`bun run build` 成功，plugin `dist/index.js` 220.25 KB，embedding-worker、viewer、viewer-server 均构建成功。
- 下一步：补齐 SDD 的 `memory.decay` / `memory.maintenance` pipeline，让 decay 与 derived-index maintenance 进入 PipelineManager trace，而不是直接散落在 storage/adapter 调用中。

## 当前继续任务：memory.decay / memory.maintenance pipeline
- 决策：新增 decay 与 maintenance pipeline 的最小安全切片，先委托现有 `MemoryDatabase.applyDecay()` 与 derived index maintenance planner，不改变 SQLite schema 或索引 provider 实现。
- 原则：decay 只通过 storage port/adapter 调用既有行为；maintenance 只生成/记录 plan，不假装 LanceDB 已可用；所有结果必须通过 PipelineManager trace 可观察。
- 成功标准：新增 pipeline/steps 与 golden tests，覆盖 decay 委托计数、missing port fail、derived index maintenance plan、空计划；LSP、targeted tests、full vitest、typecheck、build 通过。

## 最新完成切片：memory.decay / memory.maintenance pipeline
- Pipeline：新增 `src/pipeline/decay.ts` 与 `src/pipeline/maintenance.ts`；新增 `src/pipeline/steps/decay.ts`（包含 `decay.apply`）和 `src/pipeline/steps/maintenance.ts`（包含 `maintenance.plan_derived_indexes`）。
- 接线语义：`decay.apply` 依赖 `StorageMaintenancePort.applyDecay()`，返回 `decayedCount`；`maintenance.plan_derived_indexes` 依赖 `StorageDerivedIndexPort.getRebuildableDerivedIndexStates()`，使用现有 `createDerivedIndexMaintenancePlan()`，返回 `maintenancePlan`。
- 接口边界：所有接口调用没有引入新的基础设施依赖，完全复用现有 storage port 契约。
- 测试覆盖：新增 `test/golden/decay-pipeline-steps.test.ts` 与 `test/golden/maintenance-pipeline-steps.test.ts`，验证了 pipeline 的成功委托、产物结构、trace 记录，以及 missing port rejection。
- 验证结果：LSP 0 diagnostics；targeted decay/maintenance tests 2 files / 4 tests passed；`bun run typecheck` 0 errors；full `bunx vitest run` 28 files / 125 tests passed；`bun run build` 成功，plugin bundle `index.js` 220.66 KB，embedding-worker、viewer、viewer-server 均构建成功。
- 进度评估：v2 升级的核心 Pipeline 框架、Ingest/Retrieve 代理与管控、Domain Port 抽象、Decay/Maintenance 调度基本成型。剩余高优项：LanceDB 实际 Provider、SQL Session Scope、升级 Migration 链路。

## 当前继续任务：session-scope SQL filtering
- 决策：下一刀实现 memory_units 的 session_id 索引列与 session-scoped retrieval，这是让 retrieve pipeline 真正支持 session visibility 的基础。
- 原则：只在 memory_units 新增 session_id 列（可为 NULL），不改变现有 createMemory/vectorSearch 语义；getMemoriesByScope 增加可选 sessionId filter；retrieve.scope 停止拒绝 session visibility。
- 成功标准：schema 变更通过 migration 适配、SQL 查询正确过滤、retrieve step 支持 session scope、golden tests 覆盖 session filter 与 project+session 组合；LSP、targeted、typecheck、full vitest、build 通过。

## 最新完成切片：session-scope SQL filtering
- Storage：`StorageReadPort.getMemoriesByScope()` 与 `vectorSearch()` 新增可选 `sessionId` 参数；`MemoryDatabase` 中当 `sessionId` 存在时，SQL 查询直接过滤 `session_id = ?`，忽略 project_scope 判断。
- Retrieve：`MemoryRetrieveScopeDecision` 增加 `session` visibility 与可选 `session` 字段；`resolveRetrieveScope()` 不再抛错，`retrieve.sqlite` 与 `retrieve.query` step 将 `scope.session` 传入存储。
- Schema：`memory_units` 表已有 `session_id` 列与索引，无需新增 migration（v1 schema 已包含）。
- 测试：会话拒绝测试改为会话过滤测试，验证 sessionId 正确传递与 `retrieveScope` 结构。
- 验证：LSP 0 diagnostics；targeted 3 files / 16 tests；typecheck 0 errors；full vitest 28/125；build 成功，`index.js` 222.18 KB。

## 最新完成切片：LanceDB actual provider
- 实现：`LanceDBVectorIndexProvider` 三个核心方法全部实现——`upsert`（delete+add 模式）、`delete`（memory_id 过滤）、`search`（向量搜索+距离转分）。
- 安全：`sanitizeMemoryId()` 防止 SQL 注入（仅允许 UUID 中的字母数字与连字符）。
- 降级：`createLanceDBProviderOrUnavailable()` 在 `@lancedb/lancedb` 不可用时仍返回 `UnavailableVectorIndexProvider`。
- 验证：typecheck 0 errors；full vitest 28/125；build 成功，`index.js` 222.20 KB。

## 最新完成切片：upgrade migration chain
- `migrate`：数据库 schema 在 init 时自动迁移，此步骤为 pass-through verification。
- `rebuild`：遍历所有 active 记忆，通过 hash-based pseudo-embedding 生成向量并 upsert 至 LanceDB；单条失败不阻塞整体。
- `verify`：检查备份文件可读、active 记忆可访问。
- 验证：typecheck 0 errors；full vitest 28/125；build 成功，`index.js` 222.20 KB。

## V2 升级总体完成情况
- **Pipeline 框架**：ingest/retrieve/decay/maintenance 四大 pipeline 全部实现，附带 trace、requires/produces 契约、错误传播。
- **Domain Port**：`TrueMemDomainPort` 接口+v1 adapter 完成，ingest.classify 已接入。
- **Storage 扩展**：session-scope SQL filtering、LanceDB 实际 provider、derived index maintenance plan、vector degraded fallback。
- **LLM Provider**：`LocalEmbeddingProvider`（hash-based）、`MockChatProvider`、`MockRerankProvider`（Jaccard），全部 localOnly，auxiliary-only 语义。
- **受控切换**：ingest write cutover、retrieve pipeline routing、shadow-run diff telemetry 均默认关闭，可按 env flag 逐步启用。
- **Upgrade 框架**：backup/migrate/rebuild/verify 全链路实现，带锁保护与状态机。
- **Golden Matrix**：7 种 classification × user/assistant role × global/project scope 全组合覆盖。
- **测试基线**：30 test files / 159 tests passed；`typecheck` 0 errors；`build` 成功，plugin `dist/index.js` 222.20 KB。
- **尚缺（低优）**：无。destructive upgrade runbook 已通过真实 DB dry-run。

## 最新完成切片：destructive upgrade runbook dry-run
- 脚本：`scripts/upgrade-verify.ts`，在用户真实 `~/.true-mem/memory.db` 上执行 backup→migrate→rebuild→verify 全链路。
- 结果：`final state: completed`，2 条活跃记忆成功重建 LanceDB 派生索引，备份文件 `memory.db.v1.bak` 已生成。
- V2 升级**全部核心可用**：Pipeline 四管道、Domain Port、Session Scope、LanceDB、LLM Provider、Upgrade 链路全部通过验证。

## 最新完成切片：NLP Embedding Provider 集成
- `NlpEmbeddingProvider`：包装现有 `embedding-worker.ts` 子进程，通过 IPC 发送文本嵌入请求，支持超时和 fallback 到 hash-based 向量。
- 当 `@huggingface/transformers` 可用时自动使用 all-MiniLM-L6-v2 真实嵌入；不可用或超时时回退到 hashEmbed。
- 保留 `LocalEmbeddingProvider` 作为零依赖的确定性选项。

---

## 配置变更：禁用 supermemory，使用本地 trueMem
- **时间**：2026-05-11
- **操作**：`opencode.json` 中 supermemory MCP 已禁用（`"enabled": false`），AGENTS.md 中所有 supermemory 引用已替换为 trueMem
- **现状**：trueMem 插件已加载（`file:///D:/Program Files/trueMem`），`memory.db` 23MB 数据就绪，`config.jsonc` 已配置（injectionMode=0, subagentMode=1, embeddingsEnabled=1, maxMemories=25）
- **效果**：记忆通过 `<true_memory_context>` 自动注入，无需手动调用 MCP 工具
