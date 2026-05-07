import { describe, expect, it } from 'vitest';
import { ClusterEngine } from '../../src/pipeline/cluster-engine.js';
import type { MemoryUnit } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmbedding(values: number[]): Float32Array {
  return new Float32Array(values);
}

function makeMemory(overrides: Partial<MemoryUnit> = {}): MemoryUnit {
  return {
    id: 'mem-test-001',
    store: 'stm',
    classification: 'semantic',
    summary: '测试记忆',
    sourceEventIds: ['evt-001'],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    recency: 0.5,
    frequency: 1,
    importance: 0.5,
    utility: 0.5,
    novelty: 0.5,
    confidence: 0.5,
    interference: 0,
    strength: 0.5,
    decayRate: 0.01,
    tags: [],
    associations: [],
    status: 'active',
    version: 1,
    evidence: [],
    ...overrides,
  };
}

function distinctEmbedding(baseValues: number[], axis: number, offset: number): Float32Array {
  const result = new Float32Array(baseValues);
  result[axis] = (result[axis] ?? 0) + offset;
  return result;
}

// ---------------------------------------------------------------------------
// ClusterEngine
// ---------------------------------------------------------------------------

describe('ClusterEngine', () => {
  it('returns empty array when no memories have embeddings', () => {
    const engine = new ClusterEngine({ minClusterSize: 2 });
    const memories = [makeMemory(), makeMemory({ id: 'mem-002' })];
    expect(engine.cluster(memories)).toEqual([]);
  });

  it('returns empty when fewer memories than minClusterSize', () => {
    const engine = new ClusterEngine({ minClusterSize: 3 });
    const memories = [
      makeMemory({ embedding: makeEmbedding([1, 0, 0]) }),
      makeMemory({ id: 'mem-002', embedding: makeEmbedding([1, 0, 0]) }),
    ];
    expect(engine.cluster(memories)).toEqual([]);
  });

  it('clusters identical embeddings into one cluster', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.9, minClusterSize: 2 });
    const emb = makeEmbedding([1, 2, 3]);
    const memories = [
      makeMemory({ id: 'a', embedding: emb }),
      makeMemory({ id: 'b', embedding: emb }),
      makeMemory({ id: 'c', embedding: emb }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.size).toBe(3);
    expect(clusters[0]!.memoryIds).toContain('a');
    expect(clusters[0]!.memoryIds).toContain('b');
    expect(clusters[0]!.memoryIds).toContain('c');
  });

  it('separates dissimilar embeddings into different clusters', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.5, minClusterSize: 2 });
    const memories = [
      makeMemory({ id: 'type-a-1', embedding: makeEmbedding([1, 0, 0]) }),
      makeMemory({ id: 'type-a-2', embedding: makeEmbedding([0.9, 0, 0]) }),
      makeMemory({ id: 'type-b-1', embedding: makeEmbedding([0, 1, 0]) }),
      makeMemory({ id: 'type-b-2', embedding: makeEmbedding([0, 0.9, 0]) }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters.length).toBe(2);
    for (const c of clusters) {
      expect(c.size).toBe(2);
    }
  });

  it('density is close to 1 for identical vectors', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.5, minClusterSize: 2 });
    const emb = makeEmbedding([1, 2, 3]);
    const memories = [
      makeMemory({ id: 'a', embedding: emb }),
      makeMemory({ id: 'b', embedding: emb }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.density).toBeCloseTo(1, 5);
  });

  it('produces centroid with correct dimension', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.5, minClusterSize: 2 });
    const embA = makeEmbedding([1, 0, 0, 0]);
    const embB = makeEmbedding([0.7, 0.3, 0, 0]);
    const memories = [
      makeMemory({ id: 'a', embedding: embA }),
      makeMemory({ id: 'b', embedding: embB }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.centroid.length).toBe(4);
  });

  it('filters out clusters smaller than minSize', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.5, minClusterSize: 3 });
    // 2 similar, 1 outlier — none should form a cluster >= 3
    const memories = [
      makeMemory({ id: 'a', embedding: makeEmbedding([1, 0]) }),
      makeMemory({ id: 'b', embedding: makeEmbedding([1, 0]) }),
      makeMemory({ id: 'c', embedding: makeEmbedding([0, 1]) }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters).toEqual([]);
  });

  it('cluster id is deterministic (sorted memoryIds joined)', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.9, minClusterSize: 2 });
    const emb = makeEmbedding([1, 1]);
    const memories = [
      makeMemory({ id: 'z', embedding: emb }),
      makeMemory({ id: 'a', embedding: emb }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.id).toBe('a_z');
  });

  it('skips memories without embeddings', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.9, minClusterSize: 3 });
    const emb = makeEmbedding([1, 1]);
    const memories = [
      makeMemory({ id: 'a', embedding: emb }),
      makeMemory({ id: 'b', embedding: emb }),
      makeMemory({ id: 'c', embedding: emb }),
      makeMemory({ id: 'no-emb' }), // no embedding
    ];
    const clusters = engine.cluster(memories);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.size).toBe(3);
  });

  it('skips zero-length embeddings', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.9, minClusterSize: 2 });
    const emb = makeEmbedding([1, 1]);
    const memories = [
      makeMemory({ id: 'a', embedding: emb }),
      makeMemory({ id: 'b', embedding: emb }),
      makeMemory({ id: 'c', embedding: makeEmbedding([]) }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.size).toBe(2);
  });

  it('handles orthogonal vectors: no cluster formed', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.8, minClusterSize: 2 });
    const memories = [
      makeMemory({ id: 'a', embedding: makeEmbedding([1, 0, 0]) }),
      makeMemory({ id: 'b', embedding: makeEmbedding([0, 1, 0]) }),
      makeMemory({ id: 'c', embedding: makeEmbedding([0, 0, 1]) }),
    ];
    const clusters = engine.cluster(memories);
    expect(clusters).toEqual([]);
  });

  it('handles identical memories (same id) gracefully', () => {
    const engine = new ClusterEngine({ similarityThreshold: 0.9, minClusterSize: 2 });
    const emb = makeEmbedding([1, 2]);
    const memories = [
      makeMemory({ id: 'same', embedding: emb }),
      makeMemory({ id: 'same', embedding: emb }),
    ];
    const clusters = engine.cluster(memories);
    // Same ID → joined clusterId will be "same_same"
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// PatternSummarizer
// ---------------------------------------------------------------------------

import { PatternSummarizer } from '../../src/pipeline/pattern-summarizer.js';
import type { Cluster } from '../../src/pipeline/cluster-engine.js';

function makeCluster(input: { memoryIds: string[]; density?: number; centroid?: Float32Array }): Cluster {
  const { memoryIds, density = 0.9, centroid = new Float32Array([1, 0]) } = input;
  return {
    id: memoryIds.join('_'),
    size: memoryIds.length,
    memoryIds,
    density,
    centroid,
  };
}

function makeClusterMemories(
  memoryIds: string[],
  summaries: string[],
): { cluster: Cluster; memories: MemoryUnit[] } {
  const emb = makeEmbedding([1, 0]);
  return {
    cluster: makeCluster({ memoryIds }),
    memories: memoryIds.map((id, i) =>
      makeMemory({ id, summary: summaries[i] ?? `memory ${id}`, embedding: emb }),
    ),
  };
}

describe('PatternSummarizer', () => {
  it('summarizes a cluster using top-3 summaries', () => {
    const summarizer = new PatternSummarizer();
    const { cluster, memories } = makeClusterMemories(
      ['a', 'b', 'c', 'd'],
      ['喜欢TypeScript', 'TypeScript项目', '用TS写代码', '无关记忆'],
    );
    const result = summarizer.summarize(cluster, memories);
    // Should concatenate top 3 summaries with separator
    expect(result.text).toContain('TypeScript');
    expect(result.text).toContain('|');
    expect(result.method).toBe('rule');
  });

  it('caps summary at 200 characters', () => {
    const summarizer = new PatternSummarizer();
    const longText = 'A'.repeat(150);
    const { cluster, memories } = makeClusterMemories(
      ['a', 'b', 'c'],
      [longText, longText, longText],
    );
    const result = summarizer.summarize(cluster, memories);
    expect(result.text.length).toBeLessThanOrEqual(200);
  });

  it('uses separator " | " between summaries', () => {
    const summarizer = new PatternSummarizer();
    const { cluster, memories } = makeClusterMemories(
      ['a', 'b', 'c'],
      ['记忆A', '记忆B', '记忆C'],
    );
    const result = summarizer.summarize(cluster, memories);
    expect(result.text).toBe('记忆A | 记忆B | 记忆C');
  });

  it('returns fallback text when cluster has no matching memories', () => {
    const summarizer = new PatternSummarizer();
    const cluster = makeCluster({ memoryIds: ['x', 'y'] });
    const memories = [makeMemory({ id: 'z', summary: 'not_matched' })];
    const result = summarizer.summarize(cluster, memories);
    expect(result.text).toContain('related memories');
  });

  it('uses only first 3 summaries even with larger cluster', () => {
    const summarizer = new PatternSummarizer();
    const { cluster, memories } = makeClusterMemories(
      ['a', 'b', 'c', 'd', 'e'],
      ['第一', '第二', '第三', '第四', '第五'],
    );
    const result = summarizer.summarize(cluster, memories);
    expect(result.text).toBe('第一 | 第二 | 第三');
  });
});
