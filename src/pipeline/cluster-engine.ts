/**
 * ClusterEngine — 纯向量聚类引擎
 *
 * 输入：MemoryUnit[]（含 embedding 的记忆列表）
 * 输出：Cluster[]（按余弦相似度分组的簇）
 *
 * 算法：
 *  1. 对每条记忆的 embedding 向量做 L2 归一化
 *  2. 计算两两余弦相似度（归一化后等价于点积）
 *  3. 相似度 > threshold 的记忆归入同一簇（自底向上贪心合并）
 *  4. 过滤 size < minSize 的簇
 *
 * 约束：
 *  - 不使用 LLM，纯数值计算
 *  - 不修改输入数据
 *  - 结果仅用于 Pattern 生成，不参与记忆分类决策
 */

import type { MemoryUnit } from '../types.js';

export interface Cluster {
  /** 簇的唯一标识 */
  readonly id: string;
  /** 簇内记忆数量 */
  readonly size: number;
  /** 簇内记忆 ID 列表 */
  readonly memoryIds: readonly string[];
  /** 平均余弦相似度（簇内密度） */
  readonly density: number;
  /** 簇中心向量（L2 归一化后的均值） */
  readonly centroid: Float32Array;
}

export interface ClusterEngineOptions {
  /** 余弦相似度阈值，默认 0.75 */
  readonly similarityThreshold?: number;
  /** 最小簇大小，小于此值的簇被丢弃，默认 3 */
  readonly minClusterSize?: number;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += (vec[i] ?? 0) * (vec[i] ?? 0);
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return new Float32Array(vec);

  const result = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = (vec[i] ?? 0) / norm;
  }
  return result;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  // Vectors are already L2-normalized, so dot product = cosine similarity
  return dot;
}

function computeCentroid(vectors: readonly Float32Array[]): Float32Array {
  if (vectors.length === 0 || vectors[0] === undefined) return new Float32Array(0);
  const dim = vectors[0].length;
  const sum = new Float32Array(dim);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      sum[i] = (sum[i] ?? 0) + (vec[i] ?? 0);
    }
  }
  const centroid = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    centroid[i] = (sum[i] ?? 0) / vectors.length;
  }
  return l2Normalize(centroid);
}

function computeDensity(vectors: readonly Float32Array[], centroid: Float32Array): number {
  if (vectors.length <= 1) return 1;
  let total = 0;
  for (const vec of vectors) {
    total += cosineSimilarity(vec, centroid);
  }
  return total / vectors.length;
}

/**
 * 生成确定性的簇 ID（基于 memoryIds 的排序+哈希）
 */
function generateClusterId(memoryIds: readonly string[]): string {
  const sorted = [...memoryIds].sort();
  return sorted.join('_');
}

/**
 * ClusterEngine — 对含 embedding 的记忆做语义聚类
 */
export class ClusterEngine {
  private readonly threshold: number;
  private readonly minSize: number;

  constructor(options: ClusterEngineOptions = {}) {
    this.threshold = options.similarityThreshold ?? 0.75;
    this.minSize = options.minClusterSize ?? 3;
  }

  /**
   * 对记忆列表执行聚类
   * @param memories 含 embedding 的记忆
   * @returns 聚类结果
   */
  cluster(memories: readonly MemoryUnit[]): readonly Cluster[] {
    // 1. 过滤有 embedding 的记忆并做 L2 归一化
    const entries = memories
      .filter(m => m.embedding && m.embedding.length > 0)
      .map(m => ({
        memory: m,
        normalized: l2Normalize(m.embedding!),
      }));

    if (entries.length < this.minSize) {
      return [];
    }

    // 2. Union-Find 贪心聚类
    const n = entries.length;
    const parent = new Array<number>(n);
    for (let i = 0; i < n; i++) parent[i] = i;

    function find(x: number): number {
      while (parent[x] !== x) {
        const grandparent = parent[x];
        if (grandparent === undefined) break;
        parent[x] = parent[grandparent] ?? grandparent;
        x = parent[x]!;
      }
      return x;
    }

    function union(a: number, b: number) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        parent[rb] = ra;
      }
    }

    // 计算相似度矩阵（对称，只算上三角）
    for (let i = 0; i < n; i++) {
      const ei = entries[i];
      if (!ei) continue;
      for (let j = i + 1; j < n; j++) {
        const ej = entries[j];
        if (!ej) continue;
        const sim = cosineSimilarity(ei.normalized, ej.normalized);
        if (sim >= this.threshold) {
          union(i, j);
        }
      }
    }

    // 3. 按 root 分组
    const groups = new Map<number, typeof entries>();
    for (let i = 0; i < n; i++) {
      const ei = entries[i];
      if (!ei) continue;
      const root = find(i);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(ei);
    }

    // 4. 过滤 + 生成 Cluster
    const clusters: Cluster[] = [];
    for (const group of groups.values()) {
      if (group.length < this.minSize) continue;

      const memoryIds = group.map(e => e.memory.id);
      const vectors = group.map(e => e.normalized);
      const centroid = computeCentroid(vectors);
      const density = computeDensity(vectors, centroid);

      clusters.push({
        id: generateClusterId(memoryIds),
        size: group.length,
        memoryIds,
        density,
        centroid,
      });
    }

    return clusters;
  }
}
