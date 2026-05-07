import type { PipelineContext, WorkflowStep } from '../types.js';
import type { StorageDerivedIndexPort } from '../../storage/port.js';
import { createDerivedIndexMaintenancePlan } from '../../storage/index-maintenance.js';
import type { DerivedIndexMaintenancePlan } from '../../storage/index-maintenance.js';

export const MEMORY_MAINTENANCE_PLAN_STEP_NAME = 'maintenance.plan_derived_indexes';
export const MEMORY_MAINTENANCE_STEP_VERSION = '0.1.0';

function isStorageDerivedIndexPort(value: unknown): value is StorageDerivedIndexPort {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<StorageDerivedIndexPort>;
  return typeof candidate.getRebuildableDerivedIndexStates === 'function';
}

export const MEMORY_MAINTENANCE_PLAN_STEP: WorkflowStep<PipelineContext> = {
  name: MEMORY_MAINTENANCE_PLAN_STEP_NAME,
  version: MEMORY_MAINTENANCE_STEP_VERSION,
  produces: ['maintenancePlan'],
  execute: async (context) => {
    const storage = context.metadata.storage ?? context.metadata.db;
    if (!isStorageDerivedIndexPort(storage)) {
      throw new Error('memory.maintenance plan step requires a StorageDerivedIndexPort in metadata.storage or metadata.db');
    }

    const limit = typeof context.metadata.limit === 'number' ? context.metadata.limit : undefined;
    const now = context.metadata.now instanceof Date ? context.metadata.now : new Date();

    const plan = createDerivedIndexMaintenancePlan({
      storage,
      now,
      limit,
    });

    context.metadata.maintenancePlan = plan;

    return context;
  },
};

export const MEMORY_MAINTENANCE_WORKFLOW_STEPS: readonly WorkflowStep<PipelineContext>[] = [
  MEMORY_MAINTENANCE_PLAN_STEP,
];
