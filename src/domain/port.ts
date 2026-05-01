import type {
  ImportanceSignal,
  MemoryClassification,
  MemoryStore,
  MessageRole,
  RoleAwareContext,
} from '../types.js';

export interface DomainClassificationResult {
  readonly classification: MemoryClassification | null;
  readonly confidence: number;
  readonly isolatedContent: string;
  readonly roleValidated: boolean;
  readonly validationReason: string;
}

export interface DomainStorageDecision {
  readonly store: boolean;
  readonly confidence: number;
  readonly reason: string;
}

export interface DomainScopeContext {
  readonly recentMessages: readonly string[];
  readonly worktree: string;
}

export interface DomainScopeDecision {
  readonly projectScope: string | null;
  readonly isProjectScope: boolean;
  readonly confidence: number;
  readonly reason: string;
}

export interface DomainStoreDecision {
  readonly storeTarget: MemoryStore;
  readonly isExplicitIntent: boolean;
}

export interface DomainImportanceScoringPort {
  calculateBaseSignalScore(signals: readonly ImportanceSignal[]): number;
  calculateRoleWeightedScore(baseSignalScore: number, role: MessageRole, text: string): number;
}

export interface DomainClassificationPort {
  matchImportanceSignals(text: string): ImportanceSignal[];
  classifyWithRoleAwareness(
    text: string,
    signals: readonly ImportanceSignal[],
    roleAwareContext: RoleAwareContext | null
  ): DomainClassificationResult;
  shouldStoreMemory(text: string, classification: MemoryClassification, baseSignalScore: number): DomainStorageDecision;
}

export interface DomainScopePort {
  resolveProjectScope(
    classification: MemoryClassification,
    text: string,
    context: DomainScopeContext
  ): DomainScopeDecision;
  resolveStore(classification: MemoryClassification, confidence: number): DomainStoreDecision;
}

export interface DomainReconsolidationThresholds {
  readonly DUPLICATE: number;
  readonly CONFLICT: number;
  readonly MIN_RELEVANT: number;
}

export interface DomainReconsolidationPort {
  getSimilarityThresholds(): DomainReconsolidationThresholds;
  isRelevant(similarity: number): boolean;
}

export interface TrueMemDomainPort extends
  DomainImportanceScoringPort,
  DomainClassificationPort,
  DomainScopePort,
  DomainReconsolidationPort {}
