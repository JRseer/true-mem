import type { PipelineContext, WorkflowStep } from '../types.js';
import type { StorageMaintenancePort } from '../../storage/port.js';

export const MEMORY_DECAY_APPLY_STEP_NAME = 'decay.apply';
export const MEMORY_DECAY_STEP_VERSION = '0.1.0';

export interface MemoryDecayResult {
  readonly status: 'completed' | 'skipped';
  readonly decayedCount: number;
}

function isStorageMaintenancePort(value: unknown): value is StorageMaintenancePort {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<StorageMaintenancePort>;
  return typeof candidate.applyDecay === 'function';
}

export const MEMORY_DECAY_APPLY_STEP: WorkflowStep<PipelineContext> = {
  name: MEMORY_DECAY_APPLY_STEP_NAME,
  version: MEMORY_DECAY_STEP_VERSION,
  produces: ['decayResult'],
  execute: async (context) => {
    const storage = context.metadata.storage ?? context.metadata.db;
    if (!isStorageMaintenancePort(storage)) {
      throw new Error('memory.decay apply step requires a StorageMaintenancePort in metadata.storage or metadata.db');
    }

    const count = await Promise.resolve(storage.applyDecay());
    context.metadata.decayResult = {
      status: 'completed',
      decayedCount: count,
    } satisfies MemoryDecayResult;

    return context;
  },
};

export const MEMORY_DECAY_WORKFLOW_STEPS: readonly WorkflowStep<PipelineContext>[] = [
  MEMORY_DECAY_APPLY_STEP,
];
