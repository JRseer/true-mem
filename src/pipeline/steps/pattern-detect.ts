/**
 * PatternDetectorStep — 模式检测 WorkflowStep
 *
 * 定时扫描记忆图谱，识别重复主题并生成 Pattern 实体。
 *
 * 需要的 context.metadata：
 *   storage | db: StorageProvider (StorageReadPort + StorageWritePort)
 *   patternEngine: ClusterEngine (可选，默认创建)
 *   patternSummarizer: PatternSummarizer (可选，默认创建)
 *   patternLookbackDays: number (可选，默认 7)
 *   patternMinClusterSize: number (可选，默认 3)
 *   patternSimilarityThreshold: number (可选，默认 0.75)
 *   scopeContext: ScopeContext (可选)
 *
 * 产出 context.metadata：
 *   patternResult: { clusters: Cluster[], patterns: MemoryUnit[], created: number, updated: number }
 */

import type { PipelineContext, WorkflowStep } from '../types.js';
import type { StorageReadPort, StorageWritePort } from '../../storage/port.js';
import type { MemoryUnit } from '../../types.js';
import { ClusterEngine } from '../cluster-engine.js';
import { PatternSummarizer } from '../pattern-summarizer.js';
import type { Cluster } from '../cluster-engine.js';

export const PATTERN_DETECT_STEP_NAME = 'pattern.detect';
export const PATTERN_DETECT_STEP_VERSION = '0.1.0';

function isStorageReadPort(value: unknown): value is StorageReadPort {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<StorageReadPort>;
  return typeof c.getMemoriesByScope === 'function';
}

function isStorageWritePort(value: unknown): value is StorageWritePort {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<StorageWritePort>;
  return typeof c.createMemory === 'function';
}

/**
 * 检查给定 memoryIds 是否已被某个 active Pattern 覆盖
 * 通过搜索 classification='pattern' 的记忆，检查其 summary 是否包含相同的 id 集合签名
 */
function findExistingPattern(
  memoryIds: readonly string[],
  existingPatterns: readonly MemoryUnit[]
): MemoryUnit | null {
  const sorted = [...memoryIds].sort();
  const newIdsStr = sorted.join(',');

  for (const pattern of existingPatterns) {
    if (pattern.classification !== 'pattern') continue;
    // 用 summary 中包含的 ID 片段做简单匹配
    if (pattern.summary.includes(newIdsStr)) {
      return pattern;
    }
  }

  return null;
}

/**
 * 检查两个字符串数组是否表示相同的 memoryIds 集合
 */
function sameMemoryIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

export const PATTERN_DETECT_STEP: WorkflowStep<PipelineContext> = {
  name: PATTERN_DETECT_STEP_NAME,
  version: PATTERN_DETECT_STEP_VERSION,
  produces: ['patternResult'],
  execute: async (context) => {
    const storage = context.metadata.storage ?? context.metadata.db;
    if (!isStorageReadPort(storage)) {
      throw new Error('pattern.detect requires a StorageReadPort in metadata.storage or metadata.db');
    }
    if (!isStorageWritePort(storage)) {
      throw new Error('pattern.detect requires a StorageWritePort in metadata.storage or metadata.db');
    }
    // Narrow type for subsequent use
    const db = storage as StorageReadPort & StorageWritePort;

    const lookbackDays = typeof context.metadata.patternLookbackDays === 'number'
      ? context.metadata.patternLookbackDays : 7;
    const minClusterSize = typeof context.metadata.patternMinClusterSize === 'number'
      ? context.metadata.patternMinClusterSize : 3;
    const threshold = typeof context.metadata.patternSimilarityThreshold === 'number'
      ? context.metadata.patternSimilarityThreshold : 0.75;

    // 1. 获取 scope 下的所有记忆（含 embedding 信息）
    const projectScope = typeof context.metadata.worktree === 'string'
      ? context.metadata.worktree : undefined;

    const allMemories = db.getMemoriesByScope(projectScope, 500, undefined);

    // 2. 获取已有 Patterns
    const existingPatterns = allMemories.filter(m => m.classification === 'pattern' && m.status === 'active');

    // 3. 过滤：只看有 embedding 的记忆 + 在时间范围内
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    const recentEmbedded = allMemories.filter(m =>
      m.classification !== 'pattern'
      && m.status === 'active'
      && m.embedding
      && m.embedding.length > 0
      && m.createdAt.getTime() > cutoff
    );

    if (recentEmbedded.length < minClusterSize) {
      context.metadata.patternResult = { clusters: [], patterns: [], created: 0, updated: 0 };
      return context;
    }

    // 4. 聚类
    const engine = (context.metadata.patternEngine instanceof ClusterEngine)
      ? context.metadata.patternEngine
      : new ClusterEngine({ similarityThreshold: threshold, minClusterSize });

    const clusters = engine.cluster(recentEmbedded);

    // 5. 摘要 + 生成 Pattern
    const summarizer = (context.metadata.patternSummarizer instanceof PatternSummarizer)
      ? context.metadata.patternSummarizer
      : new PatternSummarizer();

    let created = 0;
    let updated = 0;
    const patterns: MemoryUnit[] = [];

    for (const cluster of clusters) {
      // 检查是否已存在
      const existing = findExistingPattern(cluster.memoryIds, existingPatterns);

      const { text } = summarizer.summarize(cluster, allMemories);
      const strength = Math.min(1, cluster.density * 0.8 + 0.2);

      if (existing) {
        // 更新 strength
        db.updateMemoryStrength(existing.id, strength);
        updated++;
        patterns.push(existing);
      } else {
        // 创建新 Pattern
        const pattern = await db.createMemory(
          'stm',
          'pattern',
          text,
          [...cluster.memoryIds],
          {
            projectScope,
            utility: 0.5,
            confidence: cluster.density,
            importance: cluster.size / 10,
          }
        );
        db.updateMemoryStrength(pattern.id, strength);
        created++;
        patterns.push(pattern);
      }
    }

    context.metadata.patternResult = {
      clusters,
      patterns,
      created,
      updated,
    };

    return context;
  },
};
