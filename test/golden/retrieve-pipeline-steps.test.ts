import { describe, expect, it } from 'vitest';

import {
  MEMORY_RETRIEVE_PIPELINE_NAME,
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
  readonly currentProject?: string | undefined;
  readonly limit?: number | undefined;
  readonly store?: 'stm' | 'ltm' | undefined;
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
    getMemoriesByScope: (currentProject, limit, store) => {
      calls.push({ currentProject, limit, store });
      return memories.slice(0, limit ?? memories.length);
    },
    vectorSearch: async () => [...memories],
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

    expect(calls).toEqual([{ currentProject: 'truemem', limit: 2, store: 'ltm' }]);
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
        { name: MEMORY_RETRIEVE_VECTOR_HINT_STEP_NAME, status: 'completed' },
      ],
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

    expect(calls).toEqual([{ currentProject: undefined, limit: 1, store: undefined }]);
    expect(result.metadata.retrieveScope).toEqual({ visibility: 'global' });
    expect(result.metadata.retrieveResult).toMatchObject({
      memories,
      scope: { visibility: 'global' },
    });
  });

  it('rejects session visibility until storage can enforce session SQL filters', async () => {
    const calls: ReadCall[] = [];

    await expect(runMemoryRetrievePipeline({
      metadata: {
        storage: createStoragePort([], calls),
      },
      scope: {
        project: 'trueMem',
        session: 'session-1',
        source: 'user',
      },
    }, createDeterministicManager())).rejects.toThrow(
      'memory.retrieve does not support session visibility until storage has session-scoped SQL filtering'
    );

    expect(calls).toEqual([]);
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

    expect(calls).toEqual([{ currentProject: 'truemem', limit: 5, store: undefined }]);
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
