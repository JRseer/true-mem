import {
  createDegradedRetrievalMetadata,
  createNormalRetrievalMetadata,
  type RetrievalMetadata,
  type StorageReadPort,
  type VectorIndexProvider,
} from '../../storage/index.js';
import type { ScopedPipelineContext } from '../../scope/index.js';
import type { MemoryStore, MemoryUnit } from '../../types.js';
import type { WorkflowStep } from '../types.js';

export const MEMORY_RETRIEVE_SCOPE_STEP_NAME = 'retrieve.scope';
export const MEMORY_RETRIEVE_SQLITE_STEP_NAME = 'retrieve.sqlite';
export const MEMORY_RETRIEVE_VECTOR_HINT_STEP_NAME = 'retrieve.vector_hint';
export const MEMORY_RETRIEVE_STEP_VERSION = '0.1.0';

export interface MemoryRetrieveScopeDecision {
  readonly visibility: 'global' | 'project';
  readonly project?: string | undefined;
}

export interface MemoryRetrieveResult {
  readonly memories: readonly MemoryUnit[];
  readonly metadata: RetrievalMetadata;
  readonly scope: MemoryRetrieveScopeDecision;
  readonly query?: string | undefined;
  readonly limit: number;
  readonly store?: MemoryStore | undefined;
}

function getStorageReadPort(context: ScopedPipelineContext): StorageReadPort {
  const candidate = context.metadata.storage ?? context.metadata.db;

  if (!isStorageReadPort(candidate)) {
    throw new Error('memory.retrieve requires metadata.storage or metadata.db StorageReadPort');
  }

  return candidate;
}

function isStorageReadPort(value: unknown): value is StorageReadPort {
  return typeof value === 'object'
    && value !== null
    && 'getMemory' in value
    && 'getMemoriesByScope' in value
    && 'vectorSearch' in value
    && typeof value.getMemory === 'function'
    && typeof value.getMemoriesByScope === 'function'
    && typeof value.vectorSearch === 'function';
}

function getLimit(context: ScopedPipelineContext): number {
  const rawLimit = context.metadata.limit;

  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) {
    return 20;
  }

  return Math.max(1, Math.floor(rawLimit));
}

function getQuery(context: ScopedPipelineContext): string | undefined {
  const rawQuery = context.metadata.query;

  if (typeof rawQuery !== 'string') {
    return undefined;
  }

  const query = rawQuery.trim();
  return query.length > 0 ? query : undefined;
}

function getStore(context: ScopedPipelineContext): MemoryStore | undefined {
  const rawStore = context.metadata.store;
  return rawStore === 'stm' || rawStore === 'ltm' ? rawStore : undefined;
}

function getVectorProvider(context: ScopedPipelineContext): VectorIndexProvider | undefined {
  const provider = context.metadata.vectorProvider;

  if (!isVectorProvider(provider)) {
    return undefined;
  }

  return provider;
}

function isVectorProvider(value: unknown): value is VectorIndexProvider {
  return typeof value === 'object'
    && value !== null
    && 'capabilities' in value
    && 'search' in value
    && typeof value.search === 'function';
}

function getQueryVector(context: ScopedPipelineContext): readonly number[] | undefined {
  const vector = context.metadata.queryVector;

  if (!Array.isArray(vector) || !vector.every(value => typeof value === 'number')) {
    return undefined;
  }

  return vector;
}

function resolveRetrieveScope(context: ScopedPipelineContext): MemoryRetrieveScopeDecision {
  if (context.scope.visibility === 'session') {
    throw new Error('memory.retrieve does not support session visibility until storage has session-scoped SQL filtering');
  }

  if (context.scope.visibility === 'project') {
    if (!context.scope.project) {
      throw new Error('memory.retrieve project visibility requires scope.project');
    }

    return {
      visibility: 'project',
      project: context.scope.project,
    };
  }

  return { visibility: 'global' };
}

function getRetrieveScope(context: ScopedPipelineContext): MemoryRetrieveScopeDecision {
  const scope = context.metadata.retrieveScope;

  if (!isRetrieveScope(scope)) {
    throw new Error('memory.retrieve requires retrieveScope metadata before storage reads');
  }

  return scope;
}

function isRetrieveScope(value: unknown): value is MemoryRetrieveScopeDecision {
  if (typeof value !== 'object' || value === null || !('visibility' in value)) {
    return false;
  }

  return value.visibility === 'global' || value.visibility === 'project';
}

function getRetrievedMemories(context: ScopedPipelineContext): readonly MemoryUnit[] {
  const memories = context.metadata.retrievedMemories;

  if (!Array.isArray(memories)) {
    throw new Error('memory.retrieve requires retrievedMemories metadata before vector hint observation');
  }

  return memories as readonly MemoryUnit[];
}

function createResult(
  context: ScopedPipelineContext,
  metadata: RetrievalMetadata
): MemoryRetrieveResult {
  const scope = getRetrieveScope(context);
  const result: MemoryRetrieveResult = {
    memories: getRetrievedMemories(context),
    metadata,
    scope,
    query: getQuery(context),
    limit: getLimit(context),
    store: getStore(context),
  };

  context.metadata.retrievalMetadata = metadata;
  context.metadata.retrieveResult = result;
  return result;
}

export const MEMORY_RETRIEVE_SCOPE_STEP: WorkflowStep<ScopedPipelineContext> = {
  name: MEMORY_RETRIEVE_SCOPE_STEP_NAME,
  version: MEMORY_RETRIEVE_STEP_VERSION,
  produces: ['retrieveScope'],
  execute: (context) => {
    context.metadata.retrieveScope = resolveRetrieveScope(context);
    return context;
  },
};

export const MEMORY_RETRIEVE_SQLITE_STEP: WorkflowStep<ScopedPipelineContext> = {
  name: MEMORY_RETRIEVE_SQLITE_STEP_NAME,
  version: MEMORY_RETRIEVE_STEP_VERSION,
  requires: ['retrieveScope'],
  produces: ['retrievedMemories', 'retrievalMetadata', 'retrieveResult'],
  execute: (context) => {
    const storage = getStorageReadPort(context);
    const scope = getRetrieveScope(context);
    const memories = storage.getMemoriesByScope(scope.project, getLimit(context), getStore(context));
    const metadata = createNormalRetrievalMetadata('sqlite', new Date());

    context.metadata.retrievedMemories = memories;
    createResult(context, metadata);
    return context;
  },
};

export const MEMORY_RETRIEVE_VECTOR_HINT_STEP: WorkflowStep<ScopedPipelineContext> = {
  name: MEMORY_RETRIEVE_VECTOR_HINT_STEP_NAME,
  version: MEMORY_RETRIEVE_STEP_VERSION,
  requires: ['retrievedMemories', 'retrievalMetadata', 'retrieveResult'],
  produces: ['retrievalMetadata', 'retrieveResult'],
  execute: async (context) => {
    const vectorProvider = getVectorProvider(context);
    const queryVector = getQueryVector(context);

    if (!vectorProvider || !queryVector) {
      createResult(context, context.metadata.retrievalMetadata as RetrievalMetadata);
      return context;
    }

    const vectorResult = await vectorProvider.search({
      vector: queryVector,
      scopeKeys: context.scope.tags.map(tag => `${tag.namespace}:${tag.value}`),
      limit: getLimit(context),
    });

    if (vectorResult.degraded) {
      createResult(context, vectorResult.degraded);
      return context;
    }

    createResult(context, createDegradedRetrievalMetadata({
      reason: 'vector_index_stale',
      fallback: 'sqlite_metadata',
      generatedAt: new Date(),
      providerId: vectorProvider.capabilities.providerId,
      detail: 'vector hints are observed only; SQLite results remain authoritative',
    }));
    return context;
  },
};

export const MEMORY_RETRIEVE_WORKFLOW_STEPS: readonly WorkflowStep<ScopedPipelineContext>[] = [
  MEMORY_RETRIEVE_SCOPE_STEP,
  MEMORY_RETRIEVE_SQLITE_STEP,
  MEMORY_RETRIEVE_VECTOR_HINT_STEP,
];
