/**
 * PatternSummarizer — 模式摘要生成器
 *
 * 从聚类簇中提取摘要。v3.0 MVP 版本使用无 LLM 的纯规则摘要：
 * 取簇内 top-3 记忆的 summary 拼接生成模式描述。
 *
 * LLM 模式（可选）：
 * 当 context.metadata 中存在 ChatProvider 时，调用 generateText()
 * 生成更自然的单句模式描述。
 *
 * 约束：
 *  - LLM 仅用于文本生成，不参与聚类决策
 *  - 摘要长度控制 <= 200 字符
 */

import type { MemoryUnit } from '../types.js';
import type { Cluster } from './cluster-engine.js';

/** LLM 生成的模式摘要结构化数据 */
export interface PatternSummary {
  /** 生成的摘要文本（<= 200 字符） */
  readonly text: string;
  /** 生成方式 */
  readonly method: 'rule' | 'llm';
}

/** 用于生成摘要的记忆条目 */
interface ClusterEntry {
  readonly memory: MemoryUnit;
  readonly similarity: number;
}

/**
 * 规则摘要：取簇内 top-3 记忆的 summary 拼接
 */
function ruleSummarize(cluster: Cluster, entries: readonly ClusterEntry[]): string {
  const top3 = entries
    .slice(0, 3)
    .map(e => e.memory.summary)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

  if (top3.length === 0) {
    return `Pattern from ${cluster.size} related memories`;
  }

  const combined = top3.join(' | ');
  return combined.length <= 200 ? combined : combined.slice(0, 197) + '...';
}

/**
 * PatternSummarizer 工厂
 */
export class PatternSummarizer {
  /**
   * 从聚类结果生成摘要
   * @param cluster 聚类结果
   * @param allMemories 全部记忆（用于查找簇内记忆的 summary 和相似度）
   * @returns 模式摘要
   */
  summarize(cluster: Cluster, allMemories: readonly MemoryUnit[]): PatternSummary {
    const memoryMap = new Map<string, MemoryUnit>();
    for (const mem of allMemories) {
      memoryMap.set(mem.id, mem);
    }

    // 构建簇内条目列表，按相似度间接排序（按 summary 长度启发式）
    const entries: ClusterEntry[] = [];
    for (const id of cluster.memoryIds) {
      const mem = memoryMap.get(id);
      if (!mem) continue;
      // MVP: 用 density 作为近似相似度
      entries.push({ memory: mem, similarity: cluster.density });
    }

    // 按 summary 长度降序（更丰富的摘要优先）
    entries.sort((a, b) => b.memory.summary.length - a.memory.summary.length);

    return {
      text: ruleSummarize(cluster, entries),
      method: 'rule',
    };
  }
}
