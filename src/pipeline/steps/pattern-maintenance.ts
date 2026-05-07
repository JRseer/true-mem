/**
 * Pattern Maintenance Step — v3.0
 *
 * Cleans up 'noise' patterns that have been inactive for >30 days.
 */
import type { PipelineContext, WorkflowStep } from '../types.js';
import type { MemoryUnit } from '../../types.js';
import { log } from '../../logger.js';

export const PATTERN_MAINTENANCE_STEP_NAME = 'pattern.maintenance';
export const PATTERN_MAINTENANCE_STEP_VERSION = '0.1.0';

interface StorageWithCleanup {
  getMemoriesByScope(
    project?: string,
    limit?: number,
    store?: string,
    sessionId?: string
  ): MemoryUnit[];
  updateMemoryStatus(memoryId: string, status: string): void;
}

function isStorageWithCleanup(value: unknown): value is StorageWithCleanup {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.getMemoriesByScope === 'function' && typeof v.updateMemoryStatus === 'function';
}

export const PATTERN_MAINTENANCE_STEP: WorkflowStep<PipelineContext> = {
  name: PATTERN_MAINTENANCE_STEP_NAME,
  version: PATTERN_MAINTENANCE_STEP_VERSION,
  requires: ['storage', 'db'],
  produces: ['patternMaintenanceResult'],
  execute: async (context) => {
    const storage = (context.metadata.storage ?? context.metadata.db) as unknown;

    if (!isStorageWithCleanup(storage)) {
      throw new Error(
        'pattern.maintenance step requires storage with getMemoriesByScope and updateMemoryStatus'
      );
    }

    const projectScope =
      typeof context.metadata.worktree === 'string' ? context.metadata.worktree : undefined;

    const allMemories = storage.getMemoriesByScope(projectScope, 500);
    const noiseThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let forgottenCount = 0;

    for (const m of allMemories) {
      // Only target noise patterns that are old enough
      if (m.classification !== 'pattern') continue;
      if (m.status !== 'noise') continue;
      if (m.updatedAt >= noiseThreshold) continue;

      storage.updateMemoryStatus(m.id, 'forgotten');
      forgottenCount++;
    }

    context.metadata.patternMaintenanceResult = { forgottenCount };
    log(`pattern-maintenance: forgotten ${forgottenCount} noise patterns`);

    return context;
  },
};
