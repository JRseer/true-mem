import { extractCleanSummary } from '../../adapters/opencode/message-parser.js';
import { createV1TrueMemDomainAdapter, type TrueMemDomainPort } from '../../domain/index.js';
import type { PipelineContext, WorkflowStep } from '../types.js';
import type { MemoryCreateFeatures, StorageWritePort } from '../../storage/port.js';
import type {
  MemoryClassification,
  MemoryStore,
  MemoryUnit,
  MessageRole,
  RoleAwareContext,
} from '../../types.js';

export const MEMORY_INGEST_NORMALIZE_STEP_NAME = 'ingest.normalize';
export const MEMORY_INGEST_CLASSIFY_STEP_NAME = 'ingest.classify';
export const MEMORY_INGEST_DEDUPE_STEP_NAME = 'ingest.dedupe';
export const MEMORY_INGEST_PERSIST_STEP_NAME = 'ingest.persist';
export const MEMORY_INGEST_STEP_VERSION = '0.1.0';

const DEFAULT_DOMAIN_PORT = createV1TrueMemDomainAdapter();

export interface MemoryIngestDecision {
  readonly store: boolean;
  readonly reason: string;
  readonly classification?: MemoryClassification | undefined;
  readonly confidence: number;
  readonly isolatedContent: string;
  readonly cleanSummary: string;
  readonly roleValidated: boolean;
  readonly validationReason: string;
  readonly baseSignalScore: number;
  readonly storeTarget?: MemoryStore | undefined;
  readonly projectScope?: string | null | undefined;
}

export interface MemoryIngestDedupeDecision {
  readonly status: 'skipped' | 'delegated_to_storage';
  readonly reason: string;
}

export interface MemoryIngestPersistResult {
  readonly status: 'skipped' | 'created_or_reconciled';
  readonly reason: string;
  readonly memory?: MemoryUnit | undefined;
}

type IngestMetadata = PipelineContext['metadata'];

function readString(metadata: IngestMetadata, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(metadata: IngestMetadata, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : [];
}

function readRole(metadata: IngestMetadata): MessageRole {
  const value = metadata.role;
  return value === 'user' || value === 'assistant' || value === 'system' ? value : 'user';
}

function readBoolean(metadata: IngestMetadata, key: string): boolean {
  return metadata[key] === true;
}

function isMemoryIngestDecision(value: unknown): value is MemoryIngestDecision {
  return typeof value === 'object' && value !== null && 'store' in value && 'reason' in value;
}

function isMemoryIngestDedupeDecision(value: unknown): value is MemoryIngestDedupeDecision {
  return typeof value === 'object' && value !== null && 'status' in value && 'reason' in value;
}

function isStorageWritePort(value: unknown): value is StorageWritePort {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<StorageWritePort>;
  return typeof candidate.createMemory === 'function';
}

function isTrueMemDomainPort(value: unknown): value is TrueMemDomainPort {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<TrueMemDomainPort>;
  return typeof candidate.matchImportanceSignals === 'function'
    && typeof candidate.calculateBaseSignalScore === 'function'
    && typeof candidate.calculateRoleWeightedScore === 'function'
    && typeof candidate.classifyWithRoleAwareness === 'function'
    && typeof candidate.shouldStoreMemory === 'function'
    && typeof candidate.resolveProjectScope === 'function'
    && typeof candidate.resolveStore === 'function';
}

function getDomainPort(metadata: IngestMetadata): TrueMemDomainPort {
  const candidate = metadata.domainPort ?? metadata.domain;
  return isTrueMemDomainPort(candidate) ? candidate : DEFAULT_DOMAIN_PORT;
}

function createSkipDecision(reason: string, isolatedContent = ''): MemoryIngestDecision {
  return {
    store: false,
    reason,
    confidence: 0,
    isolatedContent,
    cleanSummary: extractCleanSummary(isolatedContent),
    roleValidated: true,
    validationReason: reason,
    baseSignalScore: 0,
  };
}

function getRecentMessages(metadata: IngestMetadata, text: string): string[] {
  const recentMessages = readStringArray(metadata, 'recentMessages');
  return recentMessages.length > 0 ? recentMessages : [text];
}

export const MEMORY_INGEST_NORMALIZE_STEP: WorkflowStep<PipelineContext> = {
  name: MEMORY_INGEST_NORMALIZE_STEP_NAME,
  version: MEMORY_INGEST_STEP_VERSION,
  produces: ['normalizedText'],
  execute: (context) => {
    const rawText = readString(context.metadata, 'rawText')
      ?? readString(context.metadata, 'text')
      ?? readString(context.metadata, 'messageText')
      ?? '';

    context.metadata.normalizedText = extractCleanSummary(rawText);
    return context;
  },
};

export const MEMORY_INGEST_CLASSIFY_STEP: WorkflowStep<PipelineContext> = {
  name: MEMORY_INGEST_CLASSIFY_STEP_NAME,
  version: MEMORY_INGEST_STEP_VERSION,
  requires: ['normalizedText'],
  produces: ['ingestDecision'],
  execute: (context) => {
    const text = readString(context.metadata, 'normalizedText') ?? '';
    const domain = getDomainPort(context.metadata);

    if (!text.trim()) {
      context.metadata.ingestDecision = createSkipDecision('empty_text');
      return context;
    }

    const signals = domain.matchImportanceSignals(text);
    context.metadata.signals = signals;

    if (signals.length === 0) {
      context.metadata.ingestDecision = createSkipDecision('no_importance_signals', text);
      return context;
    }

    const role = readRole(context.metadata);
    const baseSignalScore = domain.calculateBaseSignalScore(signals);
    const fullConversation = readString(context.metadata, 'fullConversation') ?? text;
    const roleAwareContext: RoleAwareContext = {
      primaryRole: role,
      roleWeightedScore: domain.calculateRoleWeightedScore(baseSignalScore, role, text),
      hasAssistantContext: readBoolean(context.metadata, 'hasAssistantContext'),
      fullConversation,
    };
    const classificationResult = domain.classifyWithRoleAwareness(text, signals, roleAwareContext);
    const cleanSummary = extractCleanSummary(classificationResult.isolatedContent);

    if (/https?:\/\/[^\s]{150,}/.test(classificationResult.isolatedContent)) {
      context.metadata.ingestDecision = createSkipDecision('url_too_long', classificationResult.isolatedContent);
      return context;
    }

    if (classificationResult.isolatedContent.length > 500) {
      context.metadata.ingestDecision = createSkipDecision('content_too_long', classificationResult.isolatedContent);
      return context;
    }

    if (!classificationResult.classification) {
      context.metadata.ingestDecision = createSkipDecision('no_classification_found', classificationResult.isolatedContent);
      return context;
    }

    if (!classificationResult.roleValidated) {
      context.metadata.ingestDecision = {
        store: false,
        reason: classificationResult.validationReason,
        classification: classificationResult.classification,
        confidence: classificationResult.confidence,
        isolatedContent: classificationResult.isolatedContent,
        cleanSummary,
        roleValidated: false,
        validationReason: classificationResult.validationReason,
        baseSignalScore,
      } satisfies MemoryIngestDecision;
      return context;
    }

    const storageDecision = domain.shouldStoreMemory(
      classificationResult.isolatedContent,
      classificationResult.classification,
      baseSignalScore
    );
    const worktree = readString(context.metadata, 'worktree');
    const projectScope = worktree
      ? domain.resolveProjectScope(classificationResult.classification, text, {
          recentMessages: getRecentMessages(context.metadata, text),
          worktree,
        }).projectScope
      : undefined;
    const storeDecision = domain.resolveStore(classificationResult.classification, classificationResult.confidence);

    context.metadata.ingestDecision = {
      store: storageDecision.store,
      reason: storageDecision.reason,
      classification: classificationResult.classification,
      confidence: classificationResult.confidence,
      isolatedContent: classificationResult.isolatedContent,
      cleanSummary,
      roleValidated: true,
      validationReason: classificationResult.validationReason,
      baseSignalScore,
      storeTarget: storeDecision.storeTarget,
      projectScope,
    } satisfies MemoryIngestDecision;

    return context;
  },
};

export const MEMORY_INGEST_DEDUPE_STEP: WorkflowStep<PipelineContext> = {
  name: MEMORY_INGEST_DEDUPE_STEP_NAME,
  version: MEMORY_INGEST_STEP_VERSION,
  requires: ['ingestDecision'],
  produces: ['dedupeDecision'],
  execute: (context) => {
    const decision = context.metadata.ingestDecision;
    if (!isMemoryIngestDecision(decision) || !decision.store) {
      context.metadata.dedupeDecision = {
        status: 'skipped',
        reason: decision && isMemoryIngestDecision(decision) ? decision.reason : 'missing_ingest_decision',
      } satisfies MemoryIngestDedupeDecision;
      return context;
    }

    context.metadata.dedupeDecision = {
      status: 'delegated_to_storage',
      reason: 'sqlite_content_hash_reconciliation',
    } satisfies MemoryIngestDedupeDecision;
    return context;
  },
};

export const MEMORY_INGEST_PERSIST_STEP: WorkflowStep<PipelineContext> = {
  name: MEMORY_INGEST_PERSIST_STEP_NAME,
  version: MEMORY_INGEST_STEP_VERSION,
  requires: ['ingestDecision', 'dedupeDecision'],
  produces: ['persistResult'],
  execute: async (context) => {
    const decision = context.metadata.ingestDecision;
    const dedupeDecision = context.metadata.dedupeDecision;

    if (!isMemoryIngestDecision(decision) || !isMemoryIngestDedupeDecision(dedupeDecision)) {
      throw new Error('memory.ingest persist step requires ingestDecision and dedupeDecision');
    }

    if (!decision.store || !decision.classification || !decision.storeTarget) {
      context.metadata.persistResult = {
        status: 'skipped',
        reason: decision.reason,
      } satisfies MemoryIngestPersistResult;
      return context;
    }

    const storage = context.metadata.storage ?? context.metadata.db;
    if (!isStorageWritePort(storage)) {
      throw new Error('memory.ingest persist step requires a StorageWritePort in metadata.storage or metadata.db');
    }

    const features: Partial<MemoryCreateFeatures> = {
      sessionId: readString(context.metadata, 'sessionId'),
      projectScope: decision.projectScope,
      importance: decision.confidence,
      confidence: decision.confidence,
    };
    const memory = await storage.createMemory(
      decision.storeTarget,
      decision.classification,
      decision.cleanSummary,
      readStringArray(context.metadata, 'sourceEventIds'),
      features
    );

    context.metadata.persistResult = {
      status: 'created_or_reconciled',
      reason: dedupeDecision.reason,
      memory,
    } satisfies MemoryIngestPersistResult;
    return context;
  },
};

export const MEMORY_INGEST_WORKFLOW_STEPS: readonly WorkflowStep<PipelineContext>[] = [
  MEMORY_INGEST_NORMALIZE_STEP,
  MEMORY_INGEST_CLASSIFY_STEP,
  MEMORY_INGEST_DEDUPE_STEP,
  MEMORY_INGEST_PERSIST_STEP,
];
