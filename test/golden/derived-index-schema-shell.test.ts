import { describe, expect, it } from 'vitest';

import {
  DERIVED_INDEX_STATES_SCHEMA_SQL,
  REBUILDABLE_DERIVED_INDEX_STATUSES,
  createPendingVectorIndexState,
  derivedIndexIdentityParams,
  derivedIndexStateParams,
  isRebuildableDerivedIndexStatus,
  parseDerivedIndexStateRow,
  type StorageDerivedIndexPort,
} from '../../src/storage/index.js';

describe('golden: derived index SQLite schema shell', () => {
  it('defines a separate derived_index_states table instead of extending memory facts', () => {
    expect(DERIVED_INDEX_STATES_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS derived_index_states');
    expect(DERIVED_INDEX_STATES_SCHEMA_SQL).toContain('FOREIGN KEY (memory_id) REFERENCES memory_units(id) ON DELETE CASCADE');
    expect(DERIVED_INDEX_STATES_SCHEMA_SQL).toContain('PRIMARY KEY (memory_id, index_kind, provider_id, model, dimension)');
    expect(DERIVED_INDEX_STATES_SCHEMA_SQL).not.toContain('ALTER TABLE memory_units');
  });

  it('serializes derived state without summary or cognitive scoring fields', () => {
    const state = createPendingVectorIndexState({
      memoryId: 'memory-1',
      memoryVersion: 1,
      providerId: 'local-nlp',
      model: 'jaccard-compatible',
      dimension: 384,
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    });

    expect(derivedIndexStateParams(state)).toEqual([
      'memory-1',
      1,
      'vector',
      'local-nlp',
      'jaccard-compatible',
      384,
      'pending',
      '2026-04-30T00:00:00.000Z',
      0,
      null,
      null,
    ]);
    expect(derivedIndexIdentityParams(state)).toEqual([
      'memory-1',
      'vector',
      'local-nlp',
      'jaccard-compatible',
      384,
    ]);
  });

  it('parses SQLite rows back into derived index state', () => {
    const parsed = parseDerivedIndexStateRow({
      memory_id: 'memory-1',
      memory_version: 2,
      index_kind: 'vector',
      provider_id: 'local-nlp',
      model: 'jaccard-compatible',
      dimension: 384,
      status: 'failed',
      updated_at: '2026-04-30T00:03:00.000Z',
      retry_count: 2,
      error: 'index write failed',
      degraded_reason: null,
    });

    expect(parsed).toEqual({
      memoryId: 'memory-1',
      memoryVersion: 2,
      indexKind: 'vector',
      providerId: 'local-nlp',
      model: 'jaccard-compatible',
      dimension: 384,
      status: 'failed',
      updatedAt: new Date('2026-04-30T00:03:00.000Z'),
      retryCount: 2,
      error: 'index write failed',
      degradedReason: undefined,
    });
  });

  it('exposes rebuildable status selection through a storage-only port', () => {
    const states = [
      createPendingVectorIndexState({
        memoryId: 'memory-1',
        memoryVersion: 1,
        providerId: 'local-nlp',
        model: 'jaccard-compatible',
        dimension: 384,
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      }),
    ];
    const port: StorageDerivedIndexPort = {
      upsertDerivedIndexState: (state) => {
        states[0] = state;
      },
      getDerivedIndexState: () => states[0] ?? null,
      getRebuildableDerivedIndexStates: () => states.filter((state) => isRebuildableDerivedIndexStatus(state.status)),
    };

    expect(REBUILDABLE_DERIVED_INDEX_STATUSES).toEqual(['not_indexed', 'failed', 'degraded', 'stale']);
    expect(port.getDerivedIndexState(states[0])).toBe(states[0]);
    expect(port.getRebuildableDerivedIndexStates()).toEqual([]);
  });
});
