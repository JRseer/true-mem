import { describe, expect, it } from 'vitest';
import {
  MEMORY_MAINTENANCE_PLAN_STEP_NAME,
  PipelineManager,
  runMemoryMaintenancePipeline,
} from '../../src/pipeline/index.js';
import type { DerivedIndexState, StorageDerivedIndexPort } from '../../src/storage/index.js';

describe('golden: memory.maintenance pipeline', () => {
  function createDeterministicManager(): PipelineManager {
    let runCounter = 0;
    return new PipelineManager({
      createRunId: () => `run_test_${++runCounter}`,
      now: () => new Date('2026-05-01T12:00:00.000Z'),
    });
  }

  function createFakeStorageDerivedIndexPort(states: DerivedIndexState[]): StorageDerivedIndexPort {
    return {
      upsertDerivedIndexState: () => {},
      getDerivedIndexState: () => null,
      getRebuildableDerivedIndexStates: () => states,
    };
  }

  it('generates a maintenance plan using the storage derived index port', async () => {
    const state: DerivedIndexState = {
      memoryId: 'memory-1',
      memoryVersion: 1,
      indexKind: 'vector',
      providerId: 'local-lancedb',
      model: 'test-model',
      dimension: 384,
      status: 'degraded',
      updatedAt: new Date('2026-05-01T11:00:00.000Z'),
      retryCount: 0,
    };
    const storage = createFakeStorageDerivedIndexPort([state]);
    const manager = createDeterministicManager();
    const now = new Date('2026-05-01T12:00:00.000Z');

    const context = await runMemoryMaintenancePipeline({ storage, now, limit: 5 }, manager);

    const plan = context.metadata.maintenancePlan as any;
    expect(plan).toBeDefined();
    expect(plan.limit).toBe(5);
    expect(plan.generatedAt).toEqual(now);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].memoryId).toBe('memory-1');
    expect(plan.items[0].reason).toBe('degraded_index');

    const traces = context.traces;
    expect(traces).toHaveLength(1);
    expect(traces[0]?.steps[0]?.name).toBe(MEMORY_MAINTENANCE_PLAN_STEP_NAME);
    expect(traces[0]?.steps[0]?.status).toBe('completed');
  });

  it('fails if storage port is missing', async () => {
    const manager = createDeterministicManager();

    await expect(runMemoryMaintenancePipeline({}, manager)).rejects.toThrow(
      'memory.maintenance plan step requires a StorageDerivedIndexPort'
    );
  });
});