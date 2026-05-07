import { describe, expect, it, vi } from 'vitest';
import {
  MEMORY_DECAY_APPLY_STEP_NAME,
  PipelineManager,
  runMemoryDecayPipeline,
} from '../../src/pipeline/index.js';
import type { StorageMaintenancePort } from '../../src/storage/index.js';

describe('golden: memory.decay pipeline', () => {
  function createDeterministicManager(): PipelineManager {
    let runCounter = 0;
    return new PipelineManager({
      createRunId: () => `run_test_${++runCounter}`,
      now: () => new Date('2026-05-01T12:00:00.000Z'),
    });
  }

  function createFakeStorageMaintenancePort(decayCount: number): StorageMaintenancePort {
    return {
      applyDecay: vi.fn(() => decayCount),
      runConsolidation: vi.fn(() => 0),
    };
  }

  it('delegates to the storage maintenance port and produces a decay result', async () => {
    const storage = createFakeStorageMaintenancePort(42);
    const manager = createDeterministicManager();

    const context = await runMemoryDecayPipeline({ storage }, manager);

    expect(storage.applyDecay).toHaveBeenCalledOnce();
    expect(context.metadata.decayResult).toEqual({
      status: 'completed',
      decayedCount: 42,
    });

    const traces = context.traces;
    expect(traces).toHaveLength(1);
    expect(traces[0]?.status).toBe('completed');
    expect(traces[0]?.steps).toHaveLength(1);
    expect(traces[0]?.steps[0]?.name).toBe(MEMORY_DECAY_APPLY_STEP_NAME);
    expect(traces[0]?.steps[0]?.status).toBe('completed');
  });

  it('fails if storage port is missing', async () => {
    const manager = createDeterministicManager();

    await expect(runMemoryDecayPipeline({}, manager)).rejects.toThrow(
      'memory.decay apply step requires a StorageMaintenancePort'
    );
  });
});