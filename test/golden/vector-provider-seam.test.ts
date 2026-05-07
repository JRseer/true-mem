import { describe, expect, it } from 'vitest';

import {
  createUnavailableVectorIndexProvider,
  formatRetrievalMetadata,
  validateVectorIndexRecord,
  type VectorIndexProviderCapabilities,
  type VectorIndexRecord,
} from '../../src/storage/index.js';

const capabilities: VectorIndexProviderCapabilities = {
  providerId: 'local-lancedb',
  model: 'text-embedding-local',
  dimension: 3,
  localOnly: true,
  supportsUpsert: true,
  supportsDelete: true,
  supportsSimilaritySearch: true,
};

function createRecord(vector: readonly number[]): VectorIndexRecord {
  return {
    memoryId: 'memory-1',
    memoryVersion: 1,
    indexKind: 'vector',
    providerId: capabilities.providerId,
    model: capabilities.model,
    dimension: capabilities.dimension,
    vector,
    scopeKeys: ['project:truemem'],
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
  };
}

describe('golden: vector index provider seam', () => {
  it('validates provider records by embedding dimension before any index write', () => {
    expect(() => validateVectorIndexRecord(createRecord([0.1, 0.2, 0.3]))).not.toThrow();
    expect(() => validateVectorIndexRecord(createRecord([0.1, 0.2]))).toThrow(
      'Vector dimension mismatch: expected 3, got 2'
    );
  });

  it('models unavailable vector providers as degraded retrieval metadata', async () => {
    const provider = createUnavailableVectorIndexProvider(capabilities, 'LanceDB adapter not configured');

    await expect(provider.upsert(createRecord([0.1, 0.2, 0.3]))).rejects.toThrow('LanceDB adapter not configured');
    const result = await provider.search({ vector: [0.1, 0.2, 0.3], limit: 5 });

    expect(result.hits).toEqual([]);
    expect(result.degraded).toEqual({
      mode: 'degraded',
      reason: 'vector_index_unavailable',
      fallback: 'sqlite_keyword',
      generatedAt: new Date(0),
      providerId: 'local-lancedb',
      detail: 'LanceDB adapter not configured',
    });
    expect(result.degraded ? formatRetrievalMetadata(result.degraded) : '').toBe(
      'retrieval:degraded:vector_index_unavailable:sqlite_keyword:local-lancedb'
    );
  });

  it('keeps provider capabilities explicit and local-first', () => {
    const provider = createUnavailableVectorIndexProvider(capabilities, 'not configured');

    expect(provider.capabilities).toEqual({
      providerId: 'local-lancedb',
      model: 'text-embedding-local',
      dimension: 3,
      localOnly: true,
      supportsUpsert: true,
      supportsDelete: true,
      supportsSimilaritySearch: true,
    });
  });
});
