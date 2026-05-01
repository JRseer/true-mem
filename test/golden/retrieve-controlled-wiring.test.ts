import { describe, expect, it } from 'vitest';

import {
  getQueryMemoriesWithRetrievePipelineFallback,
  getScopeMemoriesWithRetrievePipelineFallback,
} from '../../src/adapters/opencode/retrieve-pipeline-routing.js';
import { PipelineManager } from '../../src/pipeline/index.js';
import type { StorageReadPort } from '../../src/storage/index.js';
import type { MemoryUnit } from '../../src/types.js';

interface ReadCall {
  readonly path: 'legacy-scope' | 'vector-search';
  readonly currentProject?: string | undefined;
  readonly limit?: number | undefined;
  readonly store?: 'stm' | 'ltm' | undefined;
}

function createDeterministicManager(): PipelineManager {
  let runCounter = 0;
  let timeCounter = 0;

  return new PipelineManager({
    createRunId: () => `retrieve-routing-run-${++runCounter}`,
    now: () => new Date(Date.UTC(2026, 3, 30, 3, 0, timeCounter++)),
  });
}

function createMemory(id: string, summary: string, projectScope?: string): MemoryUnit {
  return {
    id,
    sessionId: 'session-routing',
    store: 'ltm',
    classification: 'semantic',
    summary,
    sourceEventIds: [],
    projectScope,
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
    updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    lastAccessedAt: new Date('2026-04-30T00:00:00.000Z'),
    recency: 0,
    frequency: 1,
    importance: 0.7,
    utility: 0.5,
    novelty: 0.5,
    confidence: 0.8,
    interference: 0,
    strength: 0.7,
    decayRate: 0.01,
    tags: [],
    associations: [],
    status: 'active',
    version: 1,
    evidence: [],
    embedding: undefined,
  };
}

function createReadPort(memories: readonly MemoryUnit[], calls: ReadCall[]): StorageReadPort {
  return {
    getMemory: memoryId => memories.find(memory => memory.id === memoryId) ?? null,
    getMemoriesByScope: (currentProject, limit, store) => {
      calls.push({ path: 'legacy-scope', currentProject, limit, store });
      return memories.slice(0, limit ?? memories.length);
    },
    vectorSearch: async (_query, currentProject, limit) => {
      calls.push({ path: 'vector-search', currentProject, limit });
      return memories.slice(0, limit ?? memories.length);
    },
  };
}

describe('golden: retrieve pipeline controlled wiring', () => {
  it('uses the legacy scope read when retrieve pipeline routing is disabled', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('legacy', 'Legacy scope read remains default', 'truemem')];

    const result = await getScopeMemoriesWithRetrievePipelineFallback(
      createReadPort(memories, calls),
      'trueMem',
      1,
      'ltm',
      { enabled: false, manager: createDeterministicManager() }
    );

    expect(result).toEqual(memories);
    expect(calls).toEqual([{ path: 'legacy-scope', currentProject: 'trueMem', limit: 1, store: 'ltm' }]);
  });

  it('routes scope-only reads through memory.retrieve when explicitly enabled', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('pipeline', 'Pipeline reads SQLite first', 'truemem')];

    const result = await getScopeMemoriesWithRetrievePipelineFallback(
      createReadPort(memories, calls),
      'trueMem',
      5,
      undefined,
      { enabled: true, manager: createDeterministicManager(), source: 'tool' }
    );

    expect(result).toEqual(memories);
    expect(calls).toEqual([{ path: 'legacy-scope', currentProject: 'truemem', limit: 5, store: undefined }]);
  });

  it('falls back to the legacy scope read when memory.retrieve fails', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('fallback', 'Fallback protects injection', 'truemem')];
    const manager = new PipelineManager({
      createRunId: () => 'retrieve-routing-failure',
      now: () => new Date('2026-04-30T03:00:00.000Z'),
      hooks: {
        beforeStep: step => {
          if (step.name === 'retrieve.sqlite') {
            throw new Error('sqlite step unavailable in pipeline');
          }
        },
      },
    });

    const result = await getScopeMemoriesWithRetrievePipelineFallback(
      createReadPort(memories, calls),
      'trueMem',
      3,
      'ltm',
      { enabled: true, manager }
    );

    expect(result).toEqual(memories);
    expect(calls).toEqual([{ path: 'legacy-scope', currentProject: 'trueMem', limit: 3, store: 'ltm' }]);
  });

  it('keeps query reads on legacy vectorSearch when retrieve pipeline routing is disabled', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('query-disabled', 'Legacy query path remains default', 'truemem')];

    const result = await getQueryMemoriesWithRetrievePipelineFallback(
      createReadPort(memories, calls),
      'TypeScript preference',
      'trueMem',
      2,
      { enabled: false, manager: createDeterministicManager() }
    );

    expect(result).toEqual(memories);
    expect(calls).toEqual([{ path: 'vector-search', currentProject: 'trueMem', limit: 2 }]);
  });

  it('routes query reads through memory.retrieve with SQLite scope verification when enabled', async () => {
    const calls: ReadCall[] = [];
    const memories = [
      createMemory('scope-candidate', 'SQLite scope candidate', 'truemem'),
      createMemory('query-candidate', 'TypeScript query candidate', 'truemem'),
    ];

    const result = await getQueryMemoriesWithRetrievePipelineFallback(
      createReadPort(memories, calls),
      'TypeScript preference',
      'trueMem',
      2,
      { enabled: true, manager: createDeterministicManager(), source: 'tool' }
    );

    expect(result).toEqual(memories);
    expect(calls).toEqual([
      { path: 'legacy-scope', currentProject: 'truemem', limit: 2, store: undefined },
      { path: 'vector-search', currentProject: 'truemem', limit: 2 },
    ]);
  });

  it('falls back to legacy vectorSearch when query-aware memory.retrieve fails', async () => {
    const calls: ReadCall[] = [];
    const memories = [createMemory('query-fallback', 'Query fallback protects retrieval', 'truemem')];
    const manager = new PipelineManager({
      createRunId: () => 'retrieve-query-failure',
      now: () => new Date('2026-04-30T03:00:00.000Z'),
      hooks: {
        beforeStep: step => {
          if (step.name === 'retrieve.query') {
            throw new Error('query step unavailable in pipeline');
          }
        },
      },
    });

    const result = await getQueryMemoriesWithRetrievePipelineFallback(
      createReadPort(memories, calls),
      'TypeScript preference',
      'trueMem',
      3,
      { enabled: true, manager }
    );

    expect(result).toEqual(memories);
    expect(calls).toEqual([
      { path: 'legacy-scope', currentProject: 'truemem', limit: 3, store: undefined },
      { path: 'vector-search', currentProject: 'trueMem', limit: 3 },
    ]);
  });
});
