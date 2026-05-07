import { describe, expect, it } from 'vitest';

import {
  compareMemoryIngestShadowDecision,
  observeMemoryIngestPipeline,
  observeMemoryIngestShadowPipeline,
  PipelineManager,
  writeMemoryIngestPipeline,
} from '../../src/pipeline/index.js';
import type { StorageWritePort } from '../../src/storage/port.js';
import type { MemoryClassification, MemoryStore, MemoryUnit } from '../../src/types.js';

function createDeterministicManager(): PipelineManager {
  let runCounter = 0;
  let timeCounter = 0;

  return new PipelineManager({
    createRunId: () => `bridge-run-${++runCounter}`,
    now: () => new Date(Date.UTC(2026, 3, 30, 2, 0, timeCounter++)),
  });
}

function createTestMemory(
  store: MemoryStore,
  classification: MemoryClassification,
  summary: string
): MemoryUnit {
  const timestamp = new Date('2026-04-30T02:00:00.000Z');
  return {
    id: `write:${classification}:${summary}`,
    sessionId: 'session-1',
    store,
    classification,
    summary,
    sourceEventIds: [],
    projectScope: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastAccessedAt: timestamp,
    recency: 0,
    frequency: 1,
    importance: 0.9,
    utility: 0,
    novelty: 0,
    confidence: 0.9,
    interference: 0,
    strength: 0.9,
    decayRate: 0,
    tags: ['pipeline-write'],
    associations: [],
    status: 'active',
    version: 1,
    evidence: [],
    embedding: undefined,
  };
}

function createStoragePort(calls: string[]): StorageWritePort {
  return {
    createMemory: async (store, classification, summary) => {
      calls.push(`${store}:${classification}:${summary}`);
      return createTestMemory(store, classification, summary);
    },
    updateMemoryStrength: () => {},
    updateMemoryStatus: () => {},
    incrementFrequency: () => {},
    promoteToLtm: () => {},
  };
}

describe('golden: memory.ingest observational bridge', () => {
  it('builds a scoped trace from adapter metadata without cognition fields', async () => {
    const result = await observeMemoryIngestPipeline({
      sessionId: 'session-1',
      worktree: 'D:\\Program Files\\trueMem',
      trigger: 'session.idle',
      watermark: 3,
      messageCount: 8,
      manager: createDeterministicManager(),
    });

    expect(result).toBeDefined();
    expect(result?.metadata).toEqual({
      trigger: 'session.idle',
      watermark: 3,
      messageCount: 8,
      pipelineName: 'memory.ingest',
      pipelineVersion: '0.1.0',
    });
    expect(result?.scope).toMatchObject({
      project: 'd:\\program-files\\truemem',
      session: 'session-1',
      source: 'unknown',
      visibility: 'session',
    });
    expect(result?.traces[0]).toMatchObject({
      runId: 'bridge-run-1',
      pipelineName: 'memory.ingest',
      status: 'completed',
      steps: [{ name: 'ingest.shell', status: 'completed' }],
    });
  });

  it('skips observation when adapter has no effective session id', async () => {
    await expect(observeMemoryIngestPipeline({
      worktree: 'D:\\Program Files\\trueMem',
      trigger: 'session.idle',
      manager: createDeterministicManager(),
    })).resolves.toBeUndefined();
  });

  it('skips shadow observation when adapter has no effective session id', async () => {
    await expect(observeMemoryIngestShadowPipeline({
      worktree: 'D:\\Program Files\\trueMem',
      trigger: 'session.idle.shadow',
      manager: createDeterministicManager(),
      rawText: 'Remember this: I prefer TypeScript over JavaScript',
      role: 'user',
    })).resolves.toBeUndefined();
  });

  it('runs the full ingest workflow in shadow mode without writing to the real database', async () => {
    const result = await observeMemoryIngestShadowPipeline({
      sessionId: 'session-1',
      worktree: 'D:\\Program Files\\trueMem',
      trigger: 'session.idle.shadow',
      watermark: 3,
      messageCount: 8,
      manager: createDeterministicManager(),
      rawText: 'Remember this: I prefer TypeScript over JavaScript',
      role: 'user',
      fullConversation: 'Human: Remember this: I prefer TypeScript over JavaScript',
      recentMessages: ['Remember this: I prefer TypeScript over JavaScript'],
      hasAssistantContext: false,
    });

    expect(result).toBeDefined();
    expect(result?.metadata.shadowIngest).toBe(true);
    expect(result?.metadata.ingestDecision).toMatchObject({
      store: true,
      classification: 'preference',
      cleanSummary: 'I prefer TypeScript over JavaScript',
    });
    expect(result?.metadata.persistResult).toMatchObject({
      status: 'created_or_reconciled',
      reason: 'sqlite_content_hash_reconciliation',
      memory: {
        id: 'shadow:preference:I prefer TypeScript over JavaScript',
        tags: ['shadow-ingest'],
      },
    });
    expect(result?.traces[0]).toMatchObject({
      pipelineName: 'memory.ingest.shadow',
      status: 'completed',
      steps: [
        { name: 'ingest.normalize', status: 'completed' },
        { name: 'ingest.classify', status: 'completed' },
        { name: 'ingest.dedupe', status: 'completed' },
        { name: 'ingest.persist', status: 'completed' },
      ],
    });
  });

  it('records a matched comparison when shadow and v1 decisions agree', async () => {
    const result = await observeMemoryIngestShadowPipeline({
      sessionId: 'session-1',
      worktree: 'D:\Program Files\trueMem',
      trigger: 'session.idle.shadow',
      manager: createDeterministicManager(),
      rawText: 'Remember this: I prefer TypeScript over JavaScript',
      role: 'user',
      fullConversation: 'Human: Remember this: I prefer TypeScript over JavaScript',
      recentMessages: ['Remember this: I prefer TypeScript over JavaScript'],
      hasAssistantContext: false,
    });

    const comparison = compareMemoryIngestShadowDecision({
      store: true,
      reason: 'passed_all_layers',
      classification: 'preference',
      cleanSummary: 'I prefer TypeScript over JavaScript',
      storeTarget: 'ltm',
      projectScope: null,
    }, result);

    expect(comparison).toMatchObject({
      status: 'matched',
      mismatches: [],
    });
    expect(result?.metadata.shadowComparison).toMatchObject({
      status: 'matched',
      expected: {
        classification: 'preference',
        cleanSummary: 'I prefer TypeScript over JavaScript',
      },
      shadow: {
        classification: 'preference',
        cleanSummary: 'I prefer TypeScript over JavaScript',
      },
    });
  });

  it('records field-level mismatches without changing the shadow decision metadata', async () => {
    const result = await observeMemoryIngestShadowPipeline({
      sessionId: 'session-1',
      worktree: 'D:\Program Files\trueMem',
      trigger: 'session.idle.shadow',
      manager: createDeterministicManager(),
      rawText: 'Remember this: I prefer TypeScript over JavaScript',
      role: 'user',
      fullConversation: 'Human: Remember this: I prefer TypeScript over JavaScript',
      recentMessages: ['Remember this: I prefer TypeScript over JavaScript'],
      hasAssistantContext: false,
    });

    const comparison = compareMemoryIngestShadowDecision({
      store: false,
      reason: 'v1_rejected_for_test',
      classification: 'preference',
      cleanSummary: 'I prefer Rust over JavaScript',
      storeTarget: 'stm',
      projectScope: 'D:\Program Files\trueMem',
    }, result);

    expect(comparison.status).toBe('mismatched');
    expect(comparison.mismatches).toEqual([
      'store',
      'storeTarget',
      'projectScope',
      'cleanSummary',
      'reason',
    ]);
    expect(result?.metadata.ingestDecision).toMatchObject({
      store: true,
      classification: 'preference',
      cleanSummary: 'I prefer TypeScript over JavaScript',
    });
  });

  it('records shadow_unavailable when no shadow decision exists', () => {
    const comparison = compareMemoryIngestShadowDecision({
      store: false,
      reason: 'no_importance_signals',
      cleanSummary: 'plain text',
    }, undefined);

    expect(comparison).toEqual({
      status: 'shadow_unavailable',
      mismatches: ['ingestDecision'],
      expected: {
        store: false,
        reason: 'no_importance_signals',
        cleanSummary: 'plain text',
      },
    });
  });

  it('propagates shadow workflow errors so adapter wiring can isolate them', async () => {
    const manager = new PipelineManager({
      createRunId: () => 'bridge-run-failure',
      now: () => new Date(Date.UTC(2026, 3, 30, 2, 1, 0)),
      hooks: {
        beforeStep: step => {
          if (step.name === 'ingest.classify') {
            throw new Error('shadow classifier unavailable');
          }
        },
      },
    });

    await expect(observeMemoryIngestShadowPipeline({
      sessionId: 'session-1',
      worktree: 'D:\\Program Files\\trueMem',
      trigger: 'session.idle.shadow',
      manager,
      rawText: 'Remember this: I prefer TypeScript over JavaScript',
      role: 'user',
    })).rejects.toThrow('shadow classifier unavailable');
  });

  it('routes real ingest writes through the pipeline persist step when explicitly requested', async () => {
    const calls: string[] = [];
    const result = await writeMemoryIngestPipeline({
      sessionId: 'session-1',
      worktree: 'D:\Program Files\trueMem',
      trigger: 'session.idle.write',
      watermark: 3,
      messageCount: 8,
      manager: createDeterministicManager(),
      storage: createStoragePort(calls),
      confidence: 0.91,
      decision: {
        store: true,
        reason: 'passed_all_layers',
        classification: 'preference',
        cleanSummary: 'I prefer TypeScript over JavaScript',
        storeTarget: 'ltm',
        projectScope: null,
      },
    });

    expect(calls).toEqual(['ltm:preference:I prefer TypeScript over JavaScript']);
    expect(result?.metadata.ingestWriteCutover).toBe(true);
    expect(result?.metadata.persistResult).toMatchObject({
      status: 'created_or_reconciled',
      reason: 'sqlite_content_hash_reconciliation',
      memory: {
        id: 'write:preference:I prefer TypeScript over JavaScript',
      },
    });
    expect(result?.traces[0]).toMatchObject({
      pipelineName: 'memory.ingest.write',
      status: 'completed',
      steps: [
        { name: 'ingest.write.seed', status: 'completed' },
        { name: 'ingest.persist', status: 'completed' },
      ],
    });
  });

  it('skips real ingest writes when the v1 decision rejects storage', async () => {
    const calls: string[] = [];
    const result = await writeMemoryIngestPipeline({
      sessionId: 'session-1',
      worktree: 'D:\Program Files\trueMem',
      trigger: 'session.idle.write',
      manager: createDeterministicManager(),
      storage: createStoragePort(calls),
      confidence: 0.3,
      decision: {
        store: false,
        reason: 'is_question_not_statement',
        cleanSummary: 'Do you remember this preference?',
      },
    });

    expect(calls).toEqual([]);
    expect(result?.metadata.persistResult).toMatchObject({
      status: 'skipped',
      reason: 'is_question_not_statement',
    });
  });

  it('propagates real ingest write failures so adapter wiring can fall back to legacy writes', async () => {
    const manager = new PipelineManager({
      createRunId: () => 'bridge-run-write-failure',
      now: () => new Date(Date.UTC(2026, 3, 30, 2, 2, 0)),
      hooks: {
        beforeStep: step => {
          if (step.name === 'ingest.persist') {
            throw new Error('pipeline persist unavailable');
          }
        },
      },
    });

    await expect(writeMemoryIngestPipeline({
      sessionId: 'session-1',
      worktree: 'D:\Program Files\trueMem',
      trigger: 'session.idle.write',
      manager,
      storage: createStoragePort([]),
      confidence: 0.91,
      decision: {
        store: true,
        reason: 'passed_all_layers',
        classification: 'preference',
        cleanSummary: 'I prefer TypeScript over JavaScript',
        storeTarget: 'ltm',
        projectScope: null,
      },
    })).rejects.toThrow('pipeline persist unavailable');
  });
});
