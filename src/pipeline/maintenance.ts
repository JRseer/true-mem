import type { PipelineContext } from './types.js';
import type { PipelineManager } from './manager.js';
import { MEMORY_MAINTENANCE_WORKFLOW_STEPS } from './steps/maintenance.js';
import type { StorageDerivedIndexPort } from '../storage/port.js';

export const MEMORY_MAINTENANCE_PIPELINE_NAME = 'memory.maintenance';
export const MEMORY_MAINTENANCE_PIPELINE_VERSION = '0.1.0';

export interface MemoryMaintenancePipelineInput {
  readonly storage?: StorageDerivedIndexPort | undefined;
  readonly db?: StorageDerivedIndexPort | undefined;
  readonly limit?: number | undefined;
  readonly now?: Date | undefined;
  readonly [key: string]: unknown;
}

export function createMemoryMaintenancePipelineContext(
  manager: PipelineManager,
  input: MemoryMaintenancePipelineInput
): PipelineContext {
  return manager.createContext({
    storage: input.storage,
    db: input.db,
    limit: input.limit,
    now: input.now,
    ...input,
  });
}

export async function runMemoryMaintenancePipeline(
  input: MemoryMaintenancePipelineInput,
  manager: PipelineManager
): Promise<PipelineContext> {
  const context = createMemoryMaintenancePipelineContext(manager, input);
  return manager.run(
    {
      name: MEMORY_MAINTENANCE_PIPELINE_NAME,
      version: MEMORY_MAINTENANCE_PIPELINE_VERSION,
      steps: MEMORY_MAINTENANCE_WORKFLOW_STEPS,
    },
    context
  );
}
