import { PipelineManager } from './manager.js';
import {
  createMemoryIngestPipelineContext,
  MEMORY_INGEST_PIPELINE_VERSION,
  runMemoryIngestPipelineShell,
} from './ingest.js';
import {
  MEMORY_INGEST_PERSIST_STEP,
  MEMORY_INGEST_STEP_VERSION,
  MEMORY_INGEST_WORKFLOW_STEPS,
} from './steps/ingest.js';
import type { MemoryIngestPipelineContext } from './ingest.js';
import type { MemoryIngestDecision, MemoryIngestDedupeDecision } from './steps/ingest.js';
import type { PipelineContext, WorkflowStep } from './types.js';
import type { StorageWritePort } from '../storage/port.js';
import type { MemoryClassification, MemoryStore, MemoryUnit, MessageRole } from '../types.js';

export interface MemoryIngestBridgeInput {
  readonly sessionId?: string | undefined;
  readonly worktree: string;
  readonly trigger: string;
  readonly watermark?: number | undefined;
  readonly messageCount?: number | undefined;
  readonly manager?: PipelineManager | undefined;
}

export interface MemoryIngestShadowInput extends MemoryIngestBridgeInput {
  readonly rawText: string;
  readonly role: MessageRole;
  readonly fullConversation?: string | undefined;
  readonly recentMessages?: readonly string[] | undefined;
  readonly hasAssistantContext?: boolean | undefined;
  readonly sourceEventIds?: readonly string[] | undefined;
}

export interface MemoryIngestWriteInput extends MemoryIngestBridgeInput {
  readonly storage: StorageWritePort;
  readonly decision: MemoryIngestExpectedDecision;
  readonly confidence: number;
  readonly sourceEventIds?: readonly string[] | undefined;
}

export interface MemoryIngestExpectedDecision {
  readonly store: boolean;
  readonly reason: string;
  readonly classification?: MemoryClassification | undefined;
  readonly cleanSummary: string;
  readonly storeTarget?: MemoryStore | undefined;
  readonly projectScope?: string | null | undefined;
}

export interface MemoryIngestShadowComparison {
  readonly status: 'matched' | 'mismatched' | 'shadow_unavailable';
  readonly mismatches: readonly string[];
  readonly expected: MemoryIngestExpectedDecision;
  readonly shadow?: MemoryIngestExpectedDecision | undefined;
}

function isMemoryIngestDecision(value: unknown): value is MemoryIngestDecision {
  return typeof value === 'object' && value !== null && 'store' in value && 'reason' in value;
}

function toComparableDecision(decision: MemoryIngestDecision): MemoryIngestExpectedDecision {
  return {
    store: decision.store,
    reason: decision.reason,
    classification: decision.classification,
    cleanSummary: decision.cleanSummary,
    storeTarget: decision.storeTarget,
    projectScope: decision.projectScope,
  };
}

function pushMismatch<T>(
  mismatches: string[],
  field: string,
  expected: T,
  actual: T
): void {
  if (expected !== actual) {
    mismatches.push(field);
  }
}

function createShadowMemory(
  store: MemoryStore,
  classification: MemoryClassification,
  summary: string,
  sourceEventIds: string[],
  projectScope: string | null | undefined,
  confidence: number | undefined,
  sessionId: string | undefined
): MemoryUnit {
  const timestamp = new Date('1970-01-01T00:00:00.000Z');
  const strength = confidence ?? 0;

  return {
    id: `shadow:${classification}:${summary}`,
    sessionId,
    store,
    classification,
    summary,
    sourceEventIds,
    projectScope: projectScope ?? undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastAccessedAt: timestamp,
    recency: 0,
    frequency: 1,
    importance: strength,
    utility: 0,
    novelty: 0,
    confidence: strength,
    interference: 0,
    strength,
    decayRate: 0,
    tags: ['shadow-ingest'],
    associations: [],
    status: 'active',
    version: 1,
    evidence: [],
    embedding: undefined,
  };
}

function createShadowStoragePort(): StorageWritePort {
  return {
    createMemory: async (store, classification, summary, sourceEventIds, features) => createShadowMemory(
      store,
      classification,
      summary,
      sourceEventIds,
      features?.projectScope,
      features?.confidence,
      features?.sessionId
    ),
    updateMemoryStrength: () => {},
    updateMemoryStatus: () => {},
    incrementFrequency: () => {},
    promoteToLtm: () => {},
  };
}

const MEMORY_INGEST_WRITE_SEED_STEP: WorkflowStep<PipelineContext> = {
  name: 'ingest.write.seed',
  version: MEMORY_INGEST_STEP_VERSION,
  produces: ['ingestDecision', 'dedupeDecision'],
  execute: context => context,
};

function createWriteIngestDecision(
  input: MemoryIngestWriteInput
): MemoryIngestDecision {
  return {
    store: input.decision.store,
    reason: input.decision.reason,
    classification: input.decision.classification,
    confidence: input.confidence,
    isolatedContent: input.decision.cleanSummary,
    cleanSummary: input.decision.cleanSummary,
    roleValidated: true,
    validationReason: input.decision.reason,
    baseSignalScore: 0,
    storeTarget: input.decision.storeTarget,
    projectScope: input.decision.projectScope,
  };
}

function createWriteDedupeDecision(input: MemoryIngestWriteInput): MemoryIngestDedupeDecision {
  return input.decision.store
    ? {
        status: 'delegated_to_storage',
        reason: 'sqlite_content_hash_reconciliation',
      }
    : {
        status: 'skipped',
        reason: input.decision.reason,
      };
}

export async function observeMemoryIngestPipeline(
  input: MemoryIngestBridgeInput
): Promise<MemoryIngestPipelineContext | undefined> {
  if (!input.sessionId) {
    return undefined;
  }

  const manager = input.manager ?? new PipelineManager();

  return runMemoryIngestPipelineShell({
    metadata: {
      trigger: input.trigger,
      watermark: input.watermark,
      messageCount: input.messageCount,
    },
    scope: {
      project: input.worktree,
      session: input.sessionId,
      source: 'unknown',
    },
  }, manager);
}

export async function observeMemoryIngestShadowPipeline(
  input: MemoryIngestShadowInput
): Promise<PipelineContext | undefined> {
  if (!input.sessionId) {
    return undefined;
  }

  const manager = input.manager ?? new PipelineManager();
  const context = createMemoryIngestPipelineContext(manager, {
    metadata: {
      trigger: input.trigger,
      watermark: input.watermark,
      messageCount: input.messageCount,
      rawText: input.rawText,
      role: input.role,
      worktree: input.worktree,
      sessionId: input.sessionId,
      fullConversation: input.fullConversation,
      recentMessages: input.recentMessages,
      hasAssistantContext: input.hasAssistantContext,
      sourceEventIds: input.sourceEventIds,
      storage: createShadowStoragePort(),
      shadowIngest: true,
    },
    scope: {
      project: input.worktree,
      session: input.sessionId,
      source: input.role,
    },
  });

  return manager.run({
    name: 'memory.ingest.shadow',
    version: MEMORY_INGEST_PIPELINE_VERSION,
    steps: MEMORY_INGEST_WORKFLOW_STEPS,
  }, context);
}

export async function writeMemoryIngestPipeline(
  input: MemoryIngestWriteInput
): Promise<PipelineContext | undefined> {
  if (!input.sessionId) {
    return undefined;
  }

  const manager = input.manager ?? new PipelineManager();
  const context = createMemoryIngestPipelineContext(manager, {
    metadata: {
      trigger: input.trigger,
      watermark: input.watermark,
      messageCount: input.messageCount,
      sessionId: input.sessionId,
      worktree: input.worktree,
      sourceEventIds: input.sourceEventIds,
      storage: input.storage,
      ingestDecision: createWriteIngestDecision(input),
      dedupeDecision: createWriteDedupeDecision(input),
      ingestWriteCutover: true,
    },
    scope: {
      project: input.worktree,
      session: input.sessionId,
      source: 'user',
    },
  });

  return manager.run({
    name: 'memory.ingest.write',
    version: MEMORY_INGEST_PIPELINE_VERSION,
    steps: [MEMORY_INGEST_WRITE_SEED_STEP, MEMORY_INGEST_PERSIST_STEP],
  }, context);
}

export function compareMemoryIngestShadowDecision(
  expected: MemoryIngestExpectedDecision,
  shadowContext: PipelineContext | undefined
): MemoryIngestShadowComparison {
  const shadowDecision = shadowContext?.metadata.ingestDecision;

  if (!isMemoryIngestDecision(shadowDecision)) {
    const comparison: MemoryIngestShadowComparison = {
      status: 'shadow_unavailable',
      mismatches: ['ingestDecision'],
      expected,
    };

    if (shadowContext) {
      shadowContext.metadata.shadowComparison = comparison;
    }

    return comparison;
  }

  const shadow = toComparableDecision(shadowDecision);
  const mismatches: string[] = [];
  pushMismatch(mismatches, 'store', expected.store, shadow.store);
  pushMismatch(mismatches, 'classification', expected.classification, shadow.classification);
  pushMismatch(mismatches, 'storeTarget', expected.storeTarget, shadow.storeTarget);
  pushMismatch(mismatches, 'projectScope', expected.projectScope, shadow.projectScope);
  pushMismatch(mismatches, 'cleanSummary', expected.cleanSummary, shadow.cleanSummary);
  pushMismatch(mismatches, 'reason', expected.reason, shadow.reason);

  const comparison: MemoryIngestShadowComparison = {
    status: mismatches.length === 0 ? 'matched' : 'mismatched',
    mismatches,
    expected,
    shadow,
  };

  if (shadowContext) {
    shadowContext.metadata.shadowComparison = comparison;
  }

  return comparison;
}
