import { describe, expect, it } from 'vitest';

import {
  createDegradedRetrievalMetadata,
  createNormalRetrievalMetadata,
  formatRetrievalMetadata,
  isRetrievalDegraded,
  type RetrievalMetadata,
} from '../../src/storage/index.js';

describe('golden: retrieval degradation marker', () => {
  it('marks normal retrieval without wrapping memory results', () => {
    const metadata = createNormalRetrievalMetadata('sqlite', new Date('2026-04-30T00:00:00.000Z'));

    expect(metadata).toEqual({
      mode: 'normal',
      source: 'sqlite',
      generatedAt: new Date('2026-04-30T00:00:00.000Z'),
    });
    expect(isRetrievalDegraded(metadata)).toBe(false);
    expect(formatRetrievalMetadata(metadata)).toBe('retrieval:normal:sqlite');
  });

  it('marks vector fallback as degraded observability metadata', () => {
    const metadata = createDegradedRetrievalMetadata({
      reason: 'vector_index_unavailable',
      fallback: 'sqlite_keyword',
      generatedAt: new Date('2026-04-30T00:01:00.000Z'),
      providerId: 'local-lancedb',
      detail: 'derived index table has failed states',
    });

    expect(metadata).toEqual({
      mode: 'degraded',
      reason: 'vector_index_unavailable',
      fallback: 'sqlite_keyword',
      generatedAt: new Date('2026-04-30T00:01:00.000Z'),
      providerId: 'local-lancedb',
      detail: 'derived index table has failed states',
    });
    expect(isRetrievalDegraded(metadata)).toBe(true);
    expect(formatRetrievalMetadata(metadata)).toBe(
      'retrieval:degraded:vector_index_unavailable:sqlite_keyword:local-lancedb'
    );
  });

  it('keeps retrieval metadata separate from MemoryUnit result arrays', () => {
    const metadata: RetrievalMetadata = createDegradedRetrievalMetadata({
      reason: 'embedding_provider_unavailable',
      fallback: 'strength_ordered',
      generatedAt: new Date('2026-04-30T00:02:00.000Z'),
    });
    const memoryIds = ['memory-1', 'memory-2'];

    expect(memoryIds).toEqual(['memory-1', 'memory-2']);
    expect(isRetrievalDegraded(metadata)).toBe(true);
    expect(formatRetrievalMetadata(metadata)).toBe(
      'retrieval:degraded:embedding_provider_unavailable:strength_ordered'
    );
  });
});
