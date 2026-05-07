import { describe, expect, it } from 'vitest';

import {
  DERIVED_VECTOR_INDEX_KIND,
  createNotIndexedVectorIndexState,
  createPendingVectorIndexState,
  isVectorIndexSearchable,
  markVectorIndexDegraded,
  markVectorIndexFailed,
  markVectorIndexIndexed,
  markVectorIndexStale,
  shouldRebuildVectorIndex,
  type DerivedIndexState,
} from '../../src/storage/index.js';

function createBaseState(): DerivedIndexState {
  return createPendingVectorIndexState({
    memoryId: 'memory-1',
    memoryVersion: 1,
    providerId: 'local-nlp',
    model: 'jaccard-compatible',
    dimension: 384,
    updatedAt: new Date('2026-04-30T00:00:00.000Z'),
  });
}

describe('golden: derived vector index status model', () => {
  it('creates pending vector index state as derived infrastructure metadata', () => {
    const state = createBaseState();

    expect(state).toEqual({
      memoryId: 'memory-1',
      memoryVersion: 1,
      indexKind: DERIVED_VECTOR_INDEX_KIND,
      providerId: 'local-nlp',
      model: 'jaccard-compatible',
      dimension: 384,
      status: 'pending',
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      retryCount: 0,
    });
    expect(isVectorIndexSearchable(state)).toBe(false);
    expect(shouldRebuildVectorIndex(state)).toBe(false);
  });

  it('marks indexed state searchable without changing memory identity', () => {
    const pending = createBaseState();
    const indexed = markVectorIndexIndexed(pending, {
      updatedAt: new Date('2026-04-30T00:01:00.000Z'),
    });

    expect(indexed.memoryId).toBe(pending.memoryId);
    expect(indexed.memoryVersion).toBe(pending.memoryVersion);
    expect(indexed.status).toBe('indexed');
    expect(indexed.error).toBeUndefined();
    expect(indexed.degradedReason).toBeUndefined();
    expect(isVectorIndexSearchable(indexed)).toBe(true);
    expect(shouldRebuildVectorIndex(indexed)).toBe(false);
  });

  it('treats index write failures as retryable derived-index state', () => {
    const pending = createBaseState();
    const failed = markVectorIndexFailed(pending, {
      error: 'LanceDB unavailable',
      updatedAt: new Date('2026-04-30T00:02:00.000Z'),
    });
    const failedAgain = markVectorIndexFailed(failed, {
      error: 'LanceDB unavailable again',
      updatedAt: new Date('2026-04-30T00:03:00.000Z'),
    });

    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('LanceDB unavailable');
    expect(failed.retryCount).toBe(1);
    expect(failedAgain.retryCount).toBe(2);
    expect(isVectorIndexSearchable(failedAgain)).toBe(false);
    expect(shouldRebuildVectorIndex(failedAgain)).toBe(true);
  });

  it('keeps degraded and stale states rebuildable but not searchable', () => {
    const notIndexed = createNotIndexedVectorIndexState({
      memoryId: 'memory-2',
      memoryVersion: 1,
      providerId: 'local-nlp',
      model: 'jaccard-compatible',
      dimension: 384,
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    });
    const degraded = markVectorIndexDegraded(notIndexed, {
      reason: 'vector provider unavailable; keyword fallback active',
      updatedAt: new Date('2026-04-30T00:04:00.000Z'),
    });
    const stale = markVectorIndexStale(degraded, {
      memoryVersion: 2,
      updatedAt: new Date('2026-04-30T00:05:00.000Z'),
    });

    expect(notIndexed.status).toBe('not_indexed');
    expect(degraded.status).toBe('degraded');
    expect(degraded.degradedReason).toBe('vector provider unavailable; keyword fallback active');
    expect(stale.status).toBe('stale');
    expect(stale.memoryVersion).toBe(2);
    expect(isVectorIndexSearchable(stale)).toBe(false);
    expect(shouldRebuildVectorIndex(notIndexed)).toBe(true);
    expect(shouldRebuildVectorIndex(degraded)).toBe(true);
    expect(shouldRebuildVectorIndex(stale)).toBe(true);
  });
});
