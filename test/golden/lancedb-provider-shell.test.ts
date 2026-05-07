import { describe, expect, it, vi } from 'vitest';
import {
  createLanceDBProviderOrUnavailable,
  type LanceDBProviderConfig,
} from '../../src/storage/lancedb-provider.js';
import { isRetrievalDegraded } from '../../src/storage/retrieval-state.js';

vi.mock('@lancedb/lancedb', () => {
  throw new Error('Cannot find module "@lancedb/lancedb"');
});

describe('golden: LanceDB provider shell', () => {
  it('gracefully degrades to UnavailableVectorIndexProvider when @lancedb/lancedb is missing', async () => {
    const config: LanceDBProviderConfig = {
      dbPath: ':memory:',
      tableName: 'vectors',
      model: 'jaccard-compatible',
      dimension: 384,
    };

    const provider = await createLanceDBProviderOrUnavailable(config);

    expect(provider.capabilities.providerId).toBe('local-lancedb');
    expect(provider.capabilities.model).toBe('jaccard-compatible');
    expect(provider.capabilities.dimension).toBe(384);
    expect(provider.capabilities.localOnly).toBe(true);

    const result = await provider.search({
      vector: new Array(384).fill(0),
      limit: 10,
    });

    expect(result.hits).toEqual([]);
    if (!result.degraded) {
      throw new Error('Expected degraded metadata');
    }
    expect(isRetrievalDegraded(result.degraded)).toBe(true);
    expect(result.degraded.reason).toBe('vector_index_unavailable');
    expect(result.degraded.fallback).toBe('sqlite_keyword');
    expect(result.degraded.providerId).toBe('local-lancedb');
  });
});
