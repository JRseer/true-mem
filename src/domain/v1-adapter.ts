import {
  calculateRoleWeightedScore as v1CalculateRoleWeightedScore,
  classifyWithRoleAwareness as v1ClassifyWithRoleAwareness,
  shouldStoreMemory as v1ShouldStoreMemory,
} from '../memory/classifier.js';
import {
  extractProjectTerms,
  hasGlobalScopeKeyword,
  matchAllPatterns,
  shouldBeProjectScope,
} from '../memory/patterns.js';
import {
  getSimilarityThresholds as v1GetSimilarityThresholds,
  isRelevant as v1IsRelevant,
} from '../memory/reconsolidate.js';
import type {
  DomainClassificationResult,
  DomainScopeContext,
  DomainScopeDecision,
  DomainStoreDecision,
  TrueMemDomainPort,
} from './port.js';
import type {
  ImportanceSignal,
  MemoryClassification,
  MessageRole,
  RoleAwareContext,
} from '../types.js';

const USER_LEVEL_CLASSIFICATIONS: readonly MemoryClassification[] = [
  'constraint',
  'preference',
  'learning',
  'procedural',
];

const AUTO_PROMOTE_CLASSIFICATIONS: readonly MemoryClassification[] = ['learning', 'decision'];

const SUPPORTED_CLASSIFICATIONS: readonly MemoryClassification[] = [
  'episodic',
  'semantic',
  'procedural',
  'learning',
  'preference',
  'decision',
  'constraint',
];

function isMemoryClassification(value: string | null): value is MemoryClassification {
  return value !== null && SUPPORTED_CLASSIFICATIONS.includes(value as MemoryClassification);
}

export class V1TrueMemDomainAdapter implements TrueMemDomainPort {
  matchImportanceSignals(text: string): ImportanceSignal[] {
    return matchAllPatterns(text);
  }

  calculateBaseSignalScore(signals: readonly ImportanceSignal[]): number {
    if (signals.length === 0) {
      return 0;
    }

    return signals.reduce((sum, signal) => sum + signal.weight, 0) / signals.length;
  }

  calculateRoleWeightedScore(baseSignalScore: number, role: MessageRole, text: string): number {
    return v1CalculateRoleWeightedScore(baseSignalScore, role, text);
  }

  classifyWithRoleAwareness(
    text: string,
    signals: readonly ImportanceSignal[],
    roleAwareContext: RoleAwareContext | null
  ): DomainClassificationResult {
    const result = v1ClassifyWithRoleAwareness(text, [...signals], roleAwareContext);
    return {
      classification: isMemoryClassification(result.classification) ? result.classification : null,
      confidence: result.confidence,
      isolatedContent: result.isolatedContent,
      roleValidated: result.roleValidated,
      validationReason: result.validationReason,
    };
  }

  shouldStoreMemory(text: string, classification: MemoryClassification, baseSignalScore: number) {
    return v1ShouldStoreMemory(text, classification, baseSignalScore);
  }

  resolveProjectScope(
    classification: MemoryClassification,
    text: string,
    context: DomainScopeContext
  ): DomainScopeDecision {
    if (!USER_LEVEL_CLASSIFICATIONS.includes(classification)) {
      return {
        projectScope: context.worktree,
        isProjectScope: true,
        confidence: 1,
        reason: 'project_level_classification',
      };
    }

    const scopeDecision = shouldBeProjectScope(
      text,
      {
        recentMessages: [...context.recentMessages],
        worktree: context.worktree,
        projectTerms: extractProjectTerms(context.worktree),
      },
      hasGlobalScopeKeyword(text)
    );

    return {
      projectScope: scopeDecision.isProjectScope ? context.worktree : null,
      isProjectScope: scopeDecision.isProjectScope,
      confidence: scopeDecision.confidence,
      reason: scopeDecision.reason,
    };
  }

  resolveStore(classification: MemoryClassification, confidence: number): DomainStoreDecision {
    const isExplicitIntent = confidence >= 0.85;
    const shouldPromoteToLtm = classification !== 'episodic'
      && (isExplicitIntent || AUTO_PROMOTE_CLASSIFICATIONS.includes(classification));

    return {
      storeTarget: shouldPromoteToLtm ? 'ltm' : 'stm',
      isExplicitIntent,
    };
  }

  getSimilarityThresholds() {
    return v1GetSimilarityThresholds();
  }

  isRelevant(similarity: number): boolean {
    return v1IsRelevant(similarity);
  }
}

export function createV1TrueMemDomainAdapter(): TrueMemDomainPort {
  return new V1TrueMemDomainAdapter();
}
