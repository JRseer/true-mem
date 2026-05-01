import type { DerivedIndexState, DerivedIndexStatus } from './index-status.js';
import { shouldRebuildVectorIndex } from './index-status.js';
import type { StorageDerivedIndexPort } from './port.js';

export type DerivedIndexMaintenanceReason =
  | 'missing_index'
  | 'previous_failure'
  | 'degraded_index'
  | 'stale_index';

export interface DerivedIndexRebuildWorkItem {
  readonly memoryId: string;
  readonly memoryVersion: number;
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;
  readonly status: DerivedIndexStatus;
  readonly reason: DerivedIndexMaintenanceReason;
  readonly retryCount: number;
  readonly updatedAt: Date;
}

export interface DerivedIndexMaintenancePlan {
  readonly generatedAt: Date;
  readonly limit: number;
  readonly items: DerivedIndexRebuildWorkItem[];
}

export interface CreateDerivedIndexMaintenancePlanInput {
  readonly storage: Pick<StorageDerivedIndexPort, 'getRebuildableDerivedIndexStates'>;
  readonly now: Date;
  readonly limit?: number | undefined;
}

export function createDerivedIndexMaintenancePlan(
  input: CreateDerivedIndexMaintenancePlanInput
): DerivedIndexMaintenancePlan {
  const limit = input.limit ?? 100;
  const states = input.storage.getRebuildableDerivedIndexStates(limit);
  const items = states
    .filter(shouldRebuildVectorIndex)
    .map(toRebuildWorkItem)
    .sort(compareRebuildWorkItems)
    .slice(0, limit);

  return {
    generatedAt: input.now,
    limit,
    items,
  };
}

export function toRebuildWorkItem(state: DerivedIndexState): DerivedIndexRebuildWorkItem {
  return {
    memoryId: state.memoryId,
    memoryVersion: state.memoryVersion,
    providerId: state.providerId,
    model: state.model,
    dimension: state.dimension,
    status: state.status,
    reason: maintenanceReasonForStatus(state.status),
    retryCount: state.retryCount,
    updatedAt: state.updatedAt,
  };
}

export function maintenanceReasonForStatus(status: DerivedIndexStatus): DerivedIndexMaintenanceReason {
  switch (status) {
    case 'not_indexed':
      return 'missing_index';
    case 'failed':
      return 'previous_failure';
    case 'degraded':
      return 'degraded_index';
    case 'stale':
      return 'stale_index';
    case 'pending':
    case 'indexed':
      throw new Error(`Status ${status} does not require derived index rebuild`);
  }
}

function compareRebuildWorkItems(left: DerivedIndexRebuildWorkItem, right: DerivedIndexRebuildWorkItem): number {
  const updatedAtDelta = left.updatedAt.getTime() - right.updatedAt.getTime();
  if (updatedAtDelta !== 0) return updatedAtDelta;

  const memoryIdDelta = left.memoryId.localeCompare(right.memoryId);
  if (memoryIdDelta !== 0) return memoryIdDelta;

  const providerDelta = left.providerId.localeCompare(right.providerId);
  if (providerDelta !== 0) return providerDelta;

  return left.model.localeCompare(right.model);
}
