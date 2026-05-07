import { describe, expect, it } from 'vitest';

import {
  createDerivedIndexMaintenancePlan,
  createPendingVectorIndexState,
  maintenanceReasonForStatus,
  markVectorIndexDegraded,
  markVectorIndexFailed,
  markVectorIndexIndexed,
  markVectorIndexStale,
  type DerivedIndexState,
  type StorageDerivedIndexPort,
} from '../../src/storage/index.js';

function createState(memoryId: string, updatedAt: string): DerivedIndexState {
  return createPendingVectorIndexState({
    memoryId,
    memoryVersion: 1,
    providerId: 'local-nlp',
    model: 'jaccard-compatible',
    dimension: 384,
    updatedAt: new Date(updatedAt),
  });
}

describe('golden: derived index maintenance shell', () => {
  it('maps rebuildable statuses to explicit maintenance reasons', () => {
    expect(maintenanceReasonForStatus('not_indexed')).toBe('missing_index');
    expect(maintenanceReasonForStatus('failed')).toBe('previous_failure');
    expect(maintenanceReasonForStatus('degraded')).toBe('degraded_index');
    expect(maintenanceReasonForStatus('stale')).toBe('stale_index');
    expect(() => maintenanceReasonForStatus('indexed')).toThrow('does not require derived index rebuild');
    expect(() => maintenanceReasonForStatus('pending')).toThrow('does not require derived index rebuild');
  });

  it('creates a deterministic rebuild plan without executing index writes', () => {
    const failed = markVectorIndexFailed(createState('memory-b', '2026-04-30T00:02:00.000Z'), {
      error: 'index unavailable',
      updatedAt: new Date('2026-04-30T00:02:00.000Z'),
    });
    const degraded = markVectorIndexDegraded(createState('memory-a', '2026-04-30T00:01:00.000Z'), {
      reason: 'keyword fallback active',
      updatedAt: new Date('2026-04-30T00:01:00.000Z'),
    });
    const stale = markVectorIndexStale(createState('memory-c', '2026-04-30T00:01:00.000Z'), {
      memoryVersion: 2,
      updatedAt: new Date('2026-04-30T00:01:00.000Z'),
    });
    const indexed = markVectorIndexIndexed(createState('memory-d', '2026-04-30T00:00:00.000Z'), {
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    });
    const storage: Pick<StorageDerivedIndexPort, 'getRebuildableDerivedIndexStates'> = {
      getRebuildableDerivedIndexStates: () => [failed, indexed, stale, degraded],
    };

    const plan = createDerivedIndexMaintenancePlan({
      storage,
      now: new Date('2026-04-30T01:00:00.000Z'),
      limit: 10,
    });

    expect(plan.generatedAt).toEqual(new Date('2026-04-30T01:00:00.000Z'));
    expect(plan.items).toEqual([
      {
        memoryId: 'memory-a',
        memoryVersion: 1,
        providerId: 'local-nlp',
        model: 'jaccard-compatible',
        dimension: 384,
        status: 'degraded',
        reason: 'degraded_index',
        retryCount: 0,
        updatedAt: new Date('2026-04-30T00:01:00.000Z'),
      },
      {
        memoryId: 'memory-c',
        memoryVersion: 2,
        providerId: 'local-nlp',
        model: 'jaccard-compatible',
        dimension: 384,
        status: 'stale',
        reason: 'stale_index',
        retryCount: 0,
        updatedAt: new Date('2026-04-30T00:01:00.000Z'),
      },
      {
        memoryId: 'memory-b',
        memoryVersion: 1,
        providerId: 'local-nlp',
        model: 'jaccard-compatible',
        dimension: 384,
        status: 'failed',
        reason: 'previous_failure',
        retryCount: 1,
        updatedAt: new Date('2026-04-30T00:02:00.000Z'),
      },
    ]);
  });

  it('enforces the requested maintenance limit after stable ordering', () => {
    const first = markVectorIndexFailed(createState('memory-b', '2026-04-30T00:00:00.000Z'), {
      error: 'first',
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    });
    const second = markVectorIndexFailed(createState('memory-a', '2026-04-30T00:00:00.000Z'), {
      error: 'second',
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    });
    const storage: Pick<StorageDerivedIndexPort, 'getRebuildableDerivedIndexStates'> = {
      getRebuildableDerivedIndexStates: () => [first, second],
    };

    const plan = createDerivedIndexMaintenancePlan({
      storage,
      now: new Date('2026-04-30T01:00:00.000Z'),
      limit: 1,
    });

    expect(plan.items.map((item) => item.memoryId)).toEqual(['memory-a']);
  });
});
