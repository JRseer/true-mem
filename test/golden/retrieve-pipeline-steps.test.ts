import { describe, expect, it } from 'vitest';

import {
  MEMORY_RETRIEVE_PIPELINE_NAME,
  MEMORY_RETRIEVE_QUERY_STEP_NAME,
  MEMORY_RETRIEVE_SCOPE_STEP_NAME,
  MEMORY_RETRIEVE_SQLITE_STEP_NAME,
  MEMORY_RETRIEVE_VECTOR_HINT_STEP_NAME,
  PipelineManager,
  runMemoryRetrievePipeline,
} from '../../src/pipeline/index.js';
import {
  createUnavailableVectorIndexProvider,
  type StorageReadPort,
  type VectorIndexProviderCapabilities,
} from '../../src/storage/index.js';
import type { MemoryUnit } from '../../src/types.js';

interface ReadCall {
  readonly path: 'scope' | 'query';
  readonly currentProject?: string | undefined;
  readonly limit?: number | undefined;
  readonly store?: 'stm' | 'ltm' | undefined;
  readonly query?: string | undefined;
  readonly sessionId?: string | undefined;
}

function createDeterministicManager(): PipelineManager {
  let runCounter = 0;
  let timeCounter = 0;

  return new PipelineManager({
    createRunId: () => `retrieve-run-${++runCounter}`,
    now: () => new Date(Date.UTC(2026, 3, 30, 2, 0, timeCounter++)),
  });
}

function createMemory(id: string, summary: string, projectScope?: string): MemoryUnit {
  return {
    id,
    sessionId: 'session-1',
    store: 'ltm',
    classification: 'preference',
    summary,
    sourceEventIds: [],
    projectScope,
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
    updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    lastAccessedAt: new Date('2026-04-30T00:00:00.000Z'),
    recency: 0,
    frequency: 1,
    importance: 0.8,
    utility: 0.5,
    novelty: 0.5,
    confidence: 0.8,
    interference: 0,
    strength: 0.8,
    decayRate: 0.01,
    tags: [],
    associations: [],
    status: 'active',
    version: 1,
    evidence: [],
    embedding: undefined,
  };
}

function createStoragePort(memories: readonly MemoryUnit[], calls: ReadCall[]): StorageReadPort {
  return {
    getMemory: memoryId => memories.find(memory => memory.id === memoryId) ?? null,
    getMemoriesByScope: (currentProject, limit, store, sessionId) => {
      calls.push({ path: 'scope', currentProject, limit, store, sessionId });
      return memories.slice(0, limit ?? memories.length);
    },
    vectorSearch: async (query, currentProject, limit, sessionId) => {
      calls.push({
        path: 'query',
        currentProject,
        limit,
        query: typeof query === 'string' ? query : '[embedding]',
        sessionId,
      });
      return [...memories].reverse().slice(0, limit ?? memories.length);
    },
  };
}

const vectorCapabilities: VectorIndexProviderCapabilities = {
  providerId: 'local-lancedb',
  model: 'text-embedding-local',
  dimension: 3,
  localOnly: true,
  supportsUpsert: true,
  supportsDelete: true,
  supportsSimilaritySearch: true,
};

describe('golden: memory.retrieve pipeline steps', () => {
  it('retrieves through SQLite using project scope as the authoritative filter', async () => {
    const calls: ReadCall[] = [];
    const memories = [
      createMemory('global-pref', 'User prefers TypeScript'),
      createMemory('project-decision', 'trueMem uses SQLite source of truth', 'truemem'),
    ];
    const manager = createDeterministicManager();

    const result = await runMemoryRetrievePipeline({
      metadata: {
        storage: createStoragePort(memories, calls),
        limit: 2,
        store: 'ltm',
      },
      scope: {
        project: 'trueMem',
        source: 'user',
      },
    }, manager);

    expect(calls).toEqual([{ path: 'scope', currentProject: 'truemem', limit: 2, store: 'ltm' }]);
    expect(result.metadata.retrieveScope).toEqual({ visibility: 'project', project: 'truemem' });
    expect(result.metadata.retrievedMemories).toEqual(memories);
    expect(result.metadata.retrieveResult).toMatchObject({
      memories,
      scope: { visibility: 'project', project: 'truemem' },
      limit: 2,
      store: 'ltm',
      metadata: { mode: 'normal', source: 'sqlite' },
    });
    expect(result.traces[0]).toMatchObject({
      pipelineName: MEMORY_RETRIEVE_PIPELINE_NAME,
      status: 'completed',
      steps: [
        { name: MEMORY_RETRIEVE_SCOPE_STEP_NAME, status: 'completed' },
        { name: MEMORY_RETRIEVE_SQLITE_STEP_NAME, status: 'completed' },
        { name: MEMORY_RETRIEVE_QUERY_STEP_NAME, status: 'completed' },
        { name: MEMORY_RETRIEVE_VECTOR_HINT_STEP_NAME, status: 'completed' },
      ],
    });
  });

  it('uses legacy query ranking after SQLite scope verification when query is present', async () => {
    const calls: ReadCall[] = [];
    const sqliteOrder = [
      createMemory('sqlite-first', 'SQLite fact source candidate', 'truemem'),
      createMemory('query-first', 'TypeScript query match', 'truemem'),
    ];

    const result = await runMemoryRetrievePipeline({
      metadata: {
        storage: createStoragePort(sqliteOrder, calls),
        query: 'TypeScript query',
        limit: 2,
      },
      scope: {
        project: 'trueMem',
        source: 'user',
      },
    }, createDeterministicManager());

    expect(calls).toEqual([
      { path: 'scope', currentProject: 'truemem', limit: 2, store: undefined },
      { path: 'query', currentProject: 'truemem', limit: 2, query: 'TypeScript query' },
    ]);
    expect(result.metadata.retrievedMemories).toEqual([...sqliteOrder].reverse());
    expect(result.metadata.retrieveResult).toMatchObject({
      memories: [...sqliteOrder].reverse(),
      query: 'TypeScript query',
      metadata: { mode: 'normal', source: 'sqlite' },
    });
  });

  it('uses global-only SQLite retrieval when scope visibility is global', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('global-pref', 'User prefers Bun')];

    const result = await runMemoryRetrievePipeline({
      metadata: {
        storage: createStoragePort(memories, calls),
        limit: 1,
      },
      scope: {
        visibility: 'global',
        source: 'unknown',
      },
    }, createDeterministicManager());

    expect(calls).toEqual([{ path: 'scope', currentProject: undefined, limit: 1, store: undefined }]);
    expect(result.metadata.retrieveScope).toEqual({ visibility: 'global' });
    expect(result.metadata.retrieveResult).toMatchObject({
      memories,
      scope: { visibility: 'global' },
    });
  });

  it('filters by session_id when scope visibility is session', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('session-mem', 'Session-scoped preference')];

    const result = await runMemoryRetrievePipeline({
      metadata: {
        storage: createStoragePort(memories, calls),
        limit: 3,
      },
      scope: {
        project: 'trueMem',
        session: 'session-1',
        source: 'user',
      },
    }, createDeterministicManager());

    expect(calls).toEqual([{ path: 'scope', currentProject: 'truemem', limit: 3, store: undefined, sessionId: 'session-1' }]);
    expect(result.metadata.retrieveScope).toEqual({ visibility: 'session', project: 'truemem', session: 'session-1' });
    expect(result.metadata.retrievedMemories).toEqual(memories);
    expect(result.metadata.retrieveResult).toMatchObject({
      memories,
      scope: { visibility: 'session', project: 'truemem', session: 'session-1' },
    });
  });

  it('records degraded vector metadata while keeping SQLite memories authoritative', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('project-pref', 'trueMem uses local-first retrieval', 'truemem')];
    const vectorProvider = createUnavailableVectorIndexProvider(vectorCapabilities, 'LanceDB adapter not configured');

    const result = await runMemoryRetrievePipeline({
      metadata: {
        storage: createStoragePort(memories, calls),
        vectorProvider,
        queryVector: [0.1, 0.2, 0.3],
        limit: 5,
      },
      scope: {
        project: 'trueMem',
        source: 'tool',
      },
    }, createDeterministicManager());

    expect(calls).toEqual([{ path: 'scope', currentProject: 'truemem', limit: 5, store: undefined }]);
    expect(result.metadata.retrievedMemories).toEqual(memories);
    expect(result.metadata.retrieveResult).toMatchObject({
      memories,
      metadata: {
        mode: 'degraded',
        reason: 'vector_index_unavailable',
        fallback: 'sqlite_keyword',
        providerId: 'local-lancedb',
        detail: 'LanceDB adapter not configured',
      },
    });
  });
});
