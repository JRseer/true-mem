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
