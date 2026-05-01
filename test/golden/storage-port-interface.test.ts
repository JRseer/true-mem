import { describe, expect, it } from 'vitest';

import { MemoryDatabase } from '../../src/storage/database.js';
import type { MemoryUnit, Session } from '../../src/types.js';
import type { DerivedIndexState, StorageDerivedIndexPort, StoragePort, StorageReadPort } from '../../src/storage/index.js';

function acceptsStoragePort(port: StoragePort): StoragePort {
  return port;
}

function acceptsReadPort(port: StorageReadPort): StorageReadPort {
  return port;
}

describe('golden: SQLite StoragePort shell', () => {
  it('keeps MemoryDatabase assignable as the authoritative StoragePort', () => {
    const database = new MemoryDatabase();

    expect(acceptsStoragePort(database)).toBe(database);
  });

  it('allows injection-style consumers to depend only on read methods', async () => {
    const memory: MemoryUnit = {
      id: 'memory-1',
      sessionId: 'session-1',
      store: 'ltm',
      classification: 'preference',
      summary: 'User prefers Bun',
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
    };
    const readPort: StorageReadPort = {
      getMemory: () => memory,
      getMemoriesByScope: () => [memory],
      vectorSearch: async () => [memory],
    };

    const accepted = acceptsReadPort(readPort);

    expect(accepted.getMemoriesByScope('D:\\Program Files\\trueMem', 20)).toEqual([memory]);
    await expect(accepted.vectorSearch('bun', undefined, 1)).resolves.toEqual([memory]);
  });

  it('keeps session watermark operations on the storage boundary', () => {
    const session: Session = {
      id: 'session-1',
      project: 'D:\\Program Files\\trueMem',
      startedAt: new Date('2026-04-30T00:00:00.000Z'),
      status: 'active',
      messageWatermark: 0,
    };
    let watermark = session.messageWatermark ?? 0;
    const storagePort: Pick<StoragePort, 'createSession' | 'getMessageWatermark' | 'updateMessageWatermark'> = {
      createSession: () => session,
      getMessageWatermark: () => watermark,
      updateMessageWatermark: (_sessionId, nextWatermark) => {
        watermark = nextWatermark;
      },
    };

    expect(storagePort.createSession(session.id, session.project)).toBe(session);
    expect(storagePort.getMessageWatermark(session.id)).toBe(0);

    storagePort.updateMessageWatermark(session.id, 8);

    expect(storagePort.getMessageWatermark(session.id)).toBe(8);
  });

  it('keeps derived index state operations on the storage boundary', () => {
    const state: DerivedIndexState = {
      memoryId: 'memory-1',
      memoryVersion: 1,
      indexKind: 'vector',
      providerId: 'local-nlp',
      model: 'jaccard-compatible',
      dimension: 384,
      status: 'failed',
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      retryCount: 1,
      error: 'index unavailable',
    };
    let storedState: DerivedIndexState | null = null;
    const derivedIndexPort: StorageDerivedIndexPort = {
      upsertDerivedIndexState: (nextState) => {
        storedState = nextState;
      },
      getDerivedIndexState: () => storedState,
      getRebuildableDerivedIndexStates: () => storedState ? [storedState] : [],
    };

    derivedIndexPort.upsertDerivedIndexState(state);

    expect(derivedIndexPort.getDerivedIndexState(state)).toBe(state);
    expect(derivedIndexPort.getRebuildableDerivedIndexStates()).toEqual([state]);
  });
});
