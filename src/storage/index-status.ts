/**
 * Derived index status model for memory infrastructure.
 *
 * SQLite remains the authoritative fact source. Vector indexes are derived,
 * rebuildable infrastructure records and must never decide whether content is memory.
 */

export const DERIVED_VECTOR_INDEX_KIND = 'vector' as const;

export type DerivedIndexKind = typeof DERIVED_VECTOR_INDEX_KIND;

export type DerivedIndexStatus =
  | 'not_indexed'
  | 'pending'
  | 'indexed'
  | 'failed'
  | 'degraded'
  | 'stale';

export interface DerivedIndexIdentity {
  readonly memoryId: string;
  readonly memoryVersion: number;
  readonly indexKind: DerivedIndexKind;
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;
}

export interface DerivedIndexState extends DerivedIndexIdentity {
  readonly status: DerivedIndexStatus;
  readonly updatedAt: Date;
  readonly retryCount: number;
  readonly error?: string | undefined;
  readonly degradedReason?: string | undefined;
}

export interface CreateVectorIndexStateInput {
  readonly memoryId: string;
  readonly memoryVersion: number;
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;
  readonly updatedAt: Date;
}

export interface MarkVectorIndexIndexedInput {
  readonly updatedAt: Date;
}

export interface MarkVectorIndexFailedInput {
  readonly error: string;
  readonly updatedAt: Date;
}

export interface MarkVectorIndexDegradedInput {
  readonly reason: string;
  readonly updatedAt: Date;
}

export interface MarkVectorIndexStaleInput {
  readonly memoryVersion: number;
  readonly updatedAt: Date;
}

export function createPendingVectorIndexState(input: CreateVectorIndexStateInput): DerivedIndexState {
  return {
    memoryId: input.memoryId,
    memoryVersion: input.memoryVersion,
    indexKind: DERIVED_VECTOR_INDEX_KIND,
    providerId: input.providerId,
    model: input.model,
    dimension: input.dimension,
    status: 'pending',
    updatedAt: input.updatedAt,
    retryCount: 0,
  };
}

export function createNotIndexedVectorIndexState(input: CreateVectorIndexStateInput): DerivedIndexState {
  return {
    ...createPendingVectorIndexState(input),
    status: 'not_indexed',
  };
}

export function markVectorIndexIndexed(
  state: DerivedIndexState,
  input: MarkVectorIndexIndexedInput
): DerivedIndexState {
  return {
    ...state,
    status: 'indexed',
    updatedAt: input.updatedAt,
    error: undefined,
    degradedReason: undefined,
  };
}

export function markVectorIndexFailed(
  state: DerivedIndexState,
  input: MarkVectorIndexFailedInput
): DerivedIndexState {
  return {
    ...state,
    status: 'failed',
    updatedAt: input.updatedAt,
    retryCount: state.retryCount + 1,
    error: input.error,
    degradedReason: undefined,
  };
}

export function markVectorIndexDegraded(
  state: DerivedIndexState,
  input: MarkVectorIndexDegradedInput
): DerivedIndexState {
  return {
    ...state,
    status: 'degraded',
    updatedAt: input.updatedAt,
    error: undefined,
    degradedReason: input.reason,
  };
}

export function markVectorIndexStale(
  state: DerivedIndexState,
  input: MarkVectorIndexStaleInput
): DerivedIndexState {
  return {
    ...state,
    memoryVersion: input.memoryVersion,
    status: 'stale',
    updatedAt: input.updatedAt,
    error: undefined,
  };
}

export function isVectorIndexSearchable(state: DerivedIndexState): boolean {
  return state.status === 'indexed';
}

export function shouldRebuildVectorIndex(state: DerivedIndexState): boolean {
  return state.status === 'not_indexed'
    || state.status === 'failed'
    || state.status === 'degraded'
    || state.status === 'stale';
}
