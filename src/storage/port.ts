import type {
  Event,
  HookType,
  MemoryClassification,
  MemoryStatus,
  MemoryStore,
  MemoryUnit,
  Session,
} from '../types.js';
import type { DerivedIndexIdentity, DerivedIndexState } from './index-status.js';

export interface MemoryCreateFeatures {
  readonly sessionId?: string | undefined;
  readonly projectScope?: string | null | undefined;
  readonly importance?: number | undefined;
  readonly utility?: number | undefined;
  readonly novelty?: number | undefined;
  readonly confidence?: number | undefined;
  readonly tags?: string[] | undefined;
  readonly embedding?: Float32Array | undefined;
}

export interface EventCreateOptions {
  readonly toolName?: string | undefined;
  readonly toolInput?: string | undefined;
  readonly toolOutput?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface StorageSessionPort {
  createSession(id: string, project: string, metadata?: Record<string, unknown>, transcriptPath?: string): Session;
  endSession(sessionId: string, status?: 'completed' | 'abandoned'): void;
  getSession(sessionId: string): Session | null;
  getMessageWatermark(sessionId: string): number;
  updateMessageWatermark(sessionId: string, watermark: number): void;
}

export interface StorageEventPort {
  createEvent(sessionId: string, hookType: HookType, content: string, options?: EventCreateOptions): Event;
  getSessionEvents(sessionId: string): Event[];
}

export interface StorageReadPort {
  getMemory(memoryId: string): MemoryUnit | null;
  getMemoriesByScope(currentProject?: string, limit?: number, store?: MemoryStore, sessionId?: string): MemoryUnit[];
  vectorSearch(
    queryTextOrEmbedding: Float32Array | string,
    currentProject?: string,
    limit?: number,
    sessionId?: string
  ): Promise<MemoryUnit[]>;
}

export interface StorageWritePort {
  createMemory(
    store: MemoryStore,
    classification: MemoryClassification,
    summary: string,
    sourceEventIds: string[],
    features?: Partial<MemoryCreateFeatures>
  ): Promise<MemoryUnit>;
  updateMemoryStrength(memoryId: string, strength: number): void;
  updateMemoryStatus(memoryId: string, status: MemoryStatus): void;
  incrementFrequency(memoryId: string): void;
  promoteToLtm(memoryId: string): void;
}

export interface StorageMaintenancePort {
  applyDecay(): number;
  runConsolidation(): number;
}

export interface StorageDerivedIndexPort {
  upsertDerivedIndexState(state: DerivedIndexState): void;
  getDerivedIndexState(identity: DerivedIndexIdentity): DerivedIndexState | null;
  getRebuildableDerivedIndexStates(limit?: number): DerivedIndexState[];
}

export interface StorageInjectionTrackingPort {
  recordMemoryInjection(
    sessionId: string,
    memoryId: string,
    injectionContext?: string,
    relevanceScore?: number
  ): void;
  recordMemoryInjectionBatch(
    sessionId: string,
    injections: Array<{ memoryId: string; injectionContext?: string; relevanceScore?: number }>
  ): void;
  getSessionInjections(sessionId: string): Array<{
    id: string;
    memoryId: string;
    memorySummary: string;
    classification: string;
    injectedAt: string;
    relevanceScore: number | null;
  }>;
  getMemoryUsageHistory(memoryId: string, limit?: number): Array<{
    sessionId: string;
    injectedAt: string;
    project: string;
  }>;
}

export interface StorageLifecyclePort {
  close(): void;
}

/**
 * StorageProvider is an infrastructure boundary over the existing SQLite fact source.
 * It persists and retrieves records; it must not decide whether content should become memory.
 */
export interface StorageProvider extends
  StorageSessionPort,
  StorageEventPort,
  StorageReadPort,
  StorageWritePort,
  StorageMaintenancePort,
  StorageDerivedIndexPort,
  StorageInjectionTrackingPort,
  StorageLifecyclePort {}

export type StoragePort = StorageProvider;
