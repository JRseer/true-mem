import type {
  DerivedIndexIdentity,
  DerivedIndexKind,
  DerivedIndexState,
  DerivedIndexStatus,
} from './index-status.js';

export const DERIVED_INDEX_STATES_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS derived_index_states (
    memory_id TEXT NOT NULL,
    memory_version INTEGER NOT NULL,
    index_kind TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    dimension INTEGER NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    degraded_reason TEXT,
    PRIMARY KEY (memory_id, index_kind, provider_id, model, dimension),
    FOREIGN KEY (memory_id) REFERENCES memory_units(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_derived_index_states_status
    ON derived_index_states(status);

  CREATE INDEX IF NOT EXISTS idx_derived_index_states_memory
    ON derived_index_states(memory_id, memory_version);
`;

export const REBUILDABLE_DERIVED_INDEX_STATUSES: readonly DerivedIndexStatus[] = [
  'not_indexed',
  'failed',
  'degraded',
  'stale',
];

const DERIVED_INDEX_STATUSES: readonly DerivedIndexStatus[] = [
  'not_indexed',
  'pending',
  'indexed',
  'failed',
  'degraded',
  'stale',
];

const DERIVED_INDEX_KINDS: readonly DerivedIndexKind[] = ['vector'];

export type DerivedIndexStateParams = readonly [
  string,
  number,
  DerivedIndexKind,
  string,
  string,
  number,
  DerivedIndexStatus,
  string,
  number,
  string | null,
  string | null,
];

export function derivedIndexIdentityParams(identity: DerivedIndexIdentity): readonly [
  string,
  DerivedIndexKind,
  string,
  string,
  number,
] {
  return [
    identity.memoryId,
    identity.indexKind,
    identity.providerId,
    identity.model,
    identity.dimension,
  ];
}

export function derivedIndexStateParams(state: DerivedIndexState): DerivedIndexStateParams {
  return [
    state.memoryId,
    state.memoryVersion,
    state.indexKind,
    state.providerId,
    state.model,
    state.dimension,
    state.status,
    state.updatedAt.toISOString(),
    state.retryCount,
    state.error ?? null,
    state.degradedReason ?? null,
  ];
}

export function isRebuildableDerivedIndexStatus(status: DerivedIndexStatus): boolean {
  return REBUILDABLE_DERIVED_INDEX_STATUSES.includes(status);
}

export function parseDerivedIndexStateRow(row: unknown): DerivedIndexState {
  const record = requireRecord(row);
  const status = requireDerivedIndexStatus(record.status);
  const indexKind = requireDerivedIndexKind(record.index_kind);

  return {
    memoryId: requireString(record.memory_id, 'memory_id'),
    memoryVersion: requireNumber(record.memory_version, 'memory_version'),
    indexKind,
    providerId: requireString(record.provider_id, 'provider_id'),
    model: requireString(record.model, 'model'),
    dimension: requireNumber(record.dimension, 'dimension'),
    status,
    updatedAt: new Date(requireString(record.updated_at, 'updated_at')),
    retryCount: requireNumber(record.retry_count, 'retry_count'),
    error: optionalString(record.error),
    degradedReason: optionalString(record.degraded_reason),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid derived index state row');
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid derived index state row: ${fieldName} must be a string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new Error(`Invalid derived index state row: ${fieldName} must be a number`);
  }
  return value;
}

function requireDerivedIndexStatus(value: unknown): DerivedIndexStatus {
  if (typeof value === 'string' && DERIVED_INDEX_STATUSES.includes(value as DerivedIndexStatus)) {
    return value as DerivedIndexStatus;
  }
  throw new Error('Invalid derived index state row: status is unsupported');
}

function requireDerivedIndexKind(value: unknown): DerivedIndexKind {
  if (typeof value === 'string' && DERIVED_INDEX_KINDS.includes(value as DerivedIndexKind)) {
    return value as DerivedIndexKind;
  }
  throw new Error('Invalid derived index state row: index_kind is unsupported');
}
