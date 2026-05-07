export type {
  CreateVectorIndexStateInput,
  DerivedIndexIdentity,
  DerivedIndexKind,
  DerivedIndexState,
  DerivedIndexStatus,
  MarkVectorIndexDegradedInput,
  MarkVectorIndexFailedInput,
  MarkVectorIndexIndexedInput,
  MarkVectorIndexStaleInput,
} from './index-status.js';

export type {
  DerivedIndexStateParams,
} from './index-state-store.js';

export type {
  CreateDerivedIndexMaintenancePlanInput,
  DerivedIndexMaintenancePlan,
  DerivedIndexMaintenanceReason,
  DerivedIndexRebuildWorkItem,
} from './index-maintenance.js';

export type {
  CreateDegradedRetrievalMetadataInput,
  DegradedRetrievalMetadata,
  NormalRetrievalMetadata,
  RetrievalDegradationReason,
  RetrievalFallback,
  RetrievalMetadata,
  RetrievalMode,
} from './retrieval-state.js';

export type {
  VectorIndexProvider,
  VectorIndexProviderCapabilities,
  VectorIndexQuery,
  VectorIndexRecord,
  VectorIndexSearchHit,
  VectorIndexSearchResult,
} from './vector-provider.js';

export {
  DERIVED_VECTOR_INDEX_KIND,
  createNotIndexedVectorIndexState,
  createPendingVectorIndexState,
  isVectorIndexSearchable,
  markVectorIndexDegraded,
  markVectorIndexFailed,
  markVectorIndexIndexed,
  markVectorIndexStale,
  shouldRebuildVectorIndex,
} from './index-status.js';

export {
  DERIVED_INDEX_STATES_SCHEMA_SQL,
  REBUILDABLE_DERIVED_INDEX_STATUSES,
  derivedIndexIdentityParams,
  derivedIndexStateParams,
  isRebuildableDerivedIndexStatus,
  parseDerivedIndexStateRow,
} from './index-state-store.js';

export {
  createDerivedIndexMaintenancePlan,
  maintenanceReasonForStatus,
  toRebuildWorkItem,
} from './index-maintenance.js';

export {
  createDegradedRetrievalMetadata,
  createNormalRetrievalMetadata,
  formatRetrievalMetadata,
  isRetrievalDegraded,
} from './retrieval-state.js';

export {
  UnavailableVectorIndexProvider,
  createUnavailableVectorIndexProvider,
  validateVectorIndexRecord,
} from './vector-provider.js';

export type {
  EventCreateOptions,
  MemoryCreateFeatures,
  StorageEventPort,
  StorageDerivedIndexPort,
  StorageLifecyclePort,
  StorageMaintenancePort,
  StoragePort,
  StorageProvider,
  StorageReadPort,
  StorageSessionPort,
  StorageWritePort,
} from './port.js';

export type {
  LanceDBProviderConfig,
} from './lancedb-provider.js';

export {
  LanceDBVectorIndexProvider,
  createLanceDBProviderOrUnavailable,
} from './lancedb-provider.js';
