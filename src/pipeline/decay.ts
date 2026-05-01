import type { PipelineContext } from './types.js';
import type { PipelineManager } from './manager.js';
import { MEMORY_DECAY_WORKFLOW_STEPS } from './steps/decay.js';
import type { MemoryDecayResult } from './steps/decay.js';
import type { StorageMaintenancePort } from '../storage/port.js';

export const MEMORY_DECAY_PIPELINE_NAME = 'memory.decay';
export const MEMORY_DECAY_PIPELINE_VERSION = '0.1.0';

export interface MemoryDecayPipelineInput {
  readonly storage?: StorageMaintenancePort | undefined;
  readonly db?: StorageMaintenancePort | undefined;
  readonly [key: string]: unknown;
}

export function createMemoryDecayPipelineContext(
  manager: PipelineManager,
  input: MemoryDecayPipelineInput
): PipelineContext {
  return manager.createContext({
    storage: input.storage,
    db: input.db,
    ...input,
  });
}

export async function runMemoryDecayPipeline(
  input: MemoryDecayPipelineInput,
  manager: PipelineManager
): Promise<PipelineContext> {
  const context = createMemoryDecayPipelineContext(manager, input);
  return manager.run(
    {
      name: MEMORY_DECAY_PIPELINE_NAME,
      version: MEMORY_DECAY_PIPELINE_VERSION,
      steps: MEMORY_DECAY_WORKFLOW_STEPS,
    },
    context
  );
}
