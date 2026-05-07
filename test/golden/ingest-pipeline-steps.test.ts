import { describe, expect, it } from 'vitest';

import {
  MEMORY_INGEST_CLASSIFY_STEP,
  MEMORY_INGEST_DEDUPE_STEP,
  MEMORY_INGEST_NORMALIZE_STEP,
  MEMORY_INGEST_PERSIST_STEP,
  MEMORY_INGEST_WORKFLOW_STEPS,
  PipelineManager,
} from '../../src/pipeline/index.js';
import type { StorageWritePort } from '../../src/storage/port.js';
import type { MemoryStatus, MemoryUnit } from '../../src/types.js';

function createDeterministicManager(): PipelineManager {
  let runCounter = 0;
  let timeCounter = 0;

  return new PipelineManager({
    createRunId: () => `ingest-steps-run-${++runCounter}`,
    now: () => new Date(Date.UTC(2026, 3, 30, 3, 0, timeCounter++)),
  });
}

function createTestMemory(overrides: Partial<MemoryUnit> = {}): MemoryUnit {
  return {
    id: 'memory-1',
    sessionId: 'session-1',
    store: 'ltm',
    classification: 'preference',
    summary: 'I prefer TypeScript over JavaScript',
    sourceEventIds: [],
    projectScope: undefined,
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
    ...overrides,
  };
}

function createStoragePort(memory: MemoryUnit = createTestMemory()): StorageWritePort & {
  readonly calls: Array<{
    readonly store: string;
    readonly classification: string;
    readonly summary: string;
    readonly projectScope: string | null | undefined;
  }>;
} {
  const calls: Array<{
    readonly store: string;
    readonly classification: string;
    readonly summary: string;
    readonly projectScope: string | null | undefined;
  }> = [];

  return {
    calls,
    createMemory: async (store, classification, summary, _sourceEventIds, features) => {
      calls.push({
        store,
        classification,
        summary,
        projectScope: features?.projectScope,
      });
      return createTestMemory({
        ...memory,
        store,
        classification,
        summary,
        projectScope: features?.projectScope ?? undefined,
        confidence: features?.confidence ?? memory.confidence,
        importance: features?.importance ?? memory.importance,
      });
    },
    updateMemoryStrength: () => {},
    updateMemoryStatus: (_memoryId: string, _status: MemoryStatus) => {},
    incrementFrequency: () => {},
    promoteToLtm: () => {},
  };
}

describe('golden: memory.ingest workflow steps', () => {
  it('normalizes raw text without moving cognition into the normalize step', async () => {
    const manager = createDeterministicManager();
    const context = manager.createContext({
      rawText: 'Human: Remember this: I prefer TypeScript over JavaScript',
    });

    const result = await manager.run({
      name: 'memory.ingest.steps',
      version: '0.1.0',
      steps: [MEMORY_INGEST_NORMALIZE_STEP],
    }, context);

    expect(result.metadata.normalizedText).toBe('Remember this: I prefer TypeScript over JavaScript');
    expect(result.metadata.ingestDecision).toBeUndefined();
    expect(result.traces[0]?.steps).toMatchObject([
      {
        name: 'ingest.normalize',
        produces: ['normalizedText'],
        status: 'completed',
      },
    ]);
  });

  it('classifies an explicit user preference through the v1 role-aware classifier', async () => {
    const manager = createDeterministicManager();
    const context = manager.createContext({
      rawText: 'Remember this: I prefer TypeScript over JavaScript',
      role: 'user',
      worktree: 'D:\\Program Files\\trueMem',
      sessionId: 'session-1',
      recentMessages: ['Remember this: I prefer TypeScript over JavaScript'],
    });

    const result = await manager.run({
      name: 'memory.ingest.steps',
      version: '0.1.0',
      steps: [MEMORY_INGEST_NORMALIZE_STEP, MEMORY_INGEST_CLASSIFY_STEP, MEMORY_INGEST_DEDUPE_STEP],
    }, context);

    expect(result.metadata.ingestDecision).toMatchObject({
      store: true,
      reason: 'passed_all_layers',
      classification: 'preference',
      cleanSummary: 'I prefer TypeScript over JavaScript',
      roleValidated: true,
      storeTarget: 'ltm',
      projectScope: null,
    });
    expect(result.metadata.dedupeDecision).toEqual({
      status: 'delegated_to_storage',
      reason: 'sqlite_content_hash_reconciliation',
    });
  });

  it('rejects questions before persistence', async () => {
    const manager = createDeterministicManager();
    const context = manager.createContext({
      rawText: 'Do you remember this preference?',
      role: 'user',
      worktree: 'D:\\Program Files\\trueMem',
    });

    const result = await manager.run({
      name: 'memory.ingest.steps',
      version: '0.1.0',
      steps: [MEMORY_INGEST_NORMALIZE_STEP, MEMORY_INGEST_CLASSIFY_STEP, MEMORY_INGEST_DEDUPE_STEP],
    }, context);

    expect(result.metadata.ingestDecision).toMatchObject({
      store: false,
      reason: 'is_question_not_statement',
    });
    expect(result.metadata.dedupeDecision).toEqual({
      status: 'skipped',
      reason: 'is_question_not_statement',
    });
  });

  it('rejects assistant-authored user preferences by preserving role validation', async () => {
    const manager = createDeterministicManager();
    const context = manager.createContext({
      rawText: 'Remember this: I prefer option 3 over option 2',
      role: 'assistant',
      hasAssistantContext: true,
    });

    const result = await manager.run({
      name: 'memory.ingest.steps',
      version: '0.1.0',
      steps: [MEMORY_INGEST_NORMALIZE_STEP, MEMORY_INGEST_CLASSIFY_STEP],
    }, context);

    expect(result.metadata.ingestDecision).toMatchObject({
      store: false,
      classification: 'preference',
      roleValidated: false,
      validationReason: 'invalid_role_assistant_for_preference',
    });
  });

  it('persists accepted memories by delegating dedupe and writes to the storage port', async () => {
    const manager = createDeterministicManager();
    const storage = createStoragePort();
    const context = manager.createContext({
      rawText: 'Remember this: I prefer TypeScript over JavaScript',
      role: 'user',
      worktree: 'D:\\Program Files\\trueMem',
      sessionId: 'session-1',
      storage,
    });

    const result = await manager.run({
      name: 'memory.ingest.steps',
      version: '0.1.0',
      steps: MEMORY_INGEST_WORKFLOW_STEPS,
    }, context);

    expect(storage.calls).toEqual([
      {
        store: 'ltm',
        classification: 'preference',
        summary: 'I prefer TypeScript over JavaScript',
        projectScope: null,
      },
    ]);
    expect(result.metadata.persistResult).toMatchObject({
      status: 'created_or_reconciled',
      reason: 'sqlite_content_hash_reconciliation',
      memory: {
        classification: 'preference',
        summary: 'I prefer TypeScript over JavaScript',
      },
    });
    expect(result.traces[0]?.steps.map(step => step.name)).toEqual([
      'ingest.normalize',
      'ingest.classify',
      'ingest.dedupe',
      'ingest.persist',
    ]);
  });
});
