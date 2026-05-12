import { describe, expect, it } from 'vitest';

import {
  calculateClassificationScore,
  classifyWithExplicitIntent,
  classifyWithRoleAwareness,
  inferClassification,
  shouldStoreMemory,
  shouldStoreMemoryWithRole,
} from '../../src/memory/classifier.js';
import {
  getMatchingNegativePatterns,
  isMemoryMetaCommand,
  isQuestion,
  matchesNegativePattern,
} from '../../src/memory/negative-patterns.js';
import {
  detectProjectSignals,
  extractProjectTerms,
  hasGlobalScopeKeyword,
  matchAllPatterns,
  shouldBeProjectScope,
  type ConversationContext,
} from '../../src/memory/patterns.js';
import {
  hasAssistantListPattern,
  hasExplicitRememberSignal,
  inferRoleFromText,
  parseConversationLines,
  scoreAssistantAcknowledgment,
  scoreHumanIntent,
} from '../../src/memory/role-patterns.js';
import { getSimilarityThresholds, isRelevant } from '../../src/memory/reconsolidate.js';
import type { RoleAwareContext } from '../../src/types.js';

describe('golden: classifier four-layer defense', () => {
  it('keeps deterministic classification scores for multilingual preference and weak single-signal learning', () => {
    expect(calculateClassificationScore('I prefer TypeScript over JavaScript for memory plugins', 'preference')).toBe(0.65);
    expect(calculateClassificationScore('I learned something', 'learning')).toBe(0.5);
  });

  it('rejects questions before keyword scoring', () => {
    expect(shouldStoreMemory('Should I remember this preference?', 'preference', 1)).toEqual({
      store: false,
      confidence: 0,
      reason: 'is_question_not_statement',
    });
  });

  it('rejects weak signals below threshold and stores explicit semantic intent', () => {
    expect(shouldStoreMemory('I learned something', 'learning', 0.2)).toEqual({
      store: false,
      confidence: 0.35,
      reason: 'below_confidence_threshold',
    });

    expect(shouldStoreMemory('Remember this: the memory viewer runs locally', 'semantic', 0)).toEqual({
      store: true,
      confidence: 0.85,
      reason: 'explicit_intent_semantic',
    });
  });

  it('isolates explicit remember content before inferring classification', () => {
    expect(classifyWithExplicitIntent('Noise before. Remember this: I prefer Bun over npm', [])).toEqual({
      classification: 'preference',
      confidence: 0.85,
      isolatedContent: 'I prefer Bun over npm',
    });

    expect(classifyWithExplicitIntent('记住：trueMem 使用 SQLite 作为事实源', [])).toEqual({
      classification: 'semantic',
      confidence: 0.85,
      isolatedContent: 'trueMem 使用 SQLite 作为事实源',
    });
  });

  it('handles common Chinese explicit remember keywords', () => {
    expect(classifyWithExplicitIntent('请记住：trueMem 使用 SQLite 作为事实源', [])).toEqual({
      classification: 'semantic',
      confidence: 0.85,
      isolatedContent: 'trueMem 使用 SQLite 作为事实源',
    });

    expect(matchAllPatterns('帮我记住 trueMem 使用 SQLite')).toContainEqual(
      expect.objectContaining({ type: 'explicit_remember', source: '帮我记住' })
    );
  });

  it('preserves role-aware human primacy for user-level memories', () => {
    expect(shouldStoreMemoryWithRole('I prefer Chinese responses', 'preference', 'assistant')).toEqual({
      store: false,
      reason: 'invalid_role_assistant_for_preference',
    });

    expect(shouldStoreMemoryWithRole('I prefer Chinese responses', 'preference', 'user')).toEqual({
      store: true,
      reason: 'role_validation_passed',
    });
  });

  it('boosts confidence only when explicit human intent is primary', () => {
    const context: RoleAwareContext = {
      primaryRole: 'user',
      roleWeightedScore: 1,
      hasAssistantContext: false,
      fullConversation: 'Human: Remember this: I prefer deterministic golden tests, I want Vitest, and I like stable baselines',
    };

    expect(classifyWithRoleAwareness('Remember this: I prefer deterministic golden tests, I want Vitest, and I like stable baselines', [], context)).toEqual({
      classification: 'preference',
      confidence: 1,
      isolatedContent: 'I prefer deterministic golden tests, I want Vitest, and I like stable baselines',
      roleValidated: true,
      validationReason: 'human_intent_boosted',
    });
  });

  it('keeps classification priority stable', () => {
    expect(inferClassification('I decided because this architecture is safer')).toBe('decision');
    expect(inferClassification('No durable signal here')).toBeNull();
  });
});

describe('golden: negative pattern boundaries', () => {
  it('filters questions, AI meta-talk, first-person recall, and negations', () => {
    expect(isQuestion('怎么可以记住这个配置？')).toBe(true);
    expect(matchesNegativePattern('Summary: The user prefers TypeScript', 'preference')).toBe(true);
    expect(matchesNegativePattern('I remember when we used SQLite', 'semantic')).toBe(true);
    expect(matchesNegativePattern("I don't understand the memory pipeline", 'learning')).toBe(true);
  });

  it('blocks memory-system meta commands but allows explicit storage overrides', () => {
    expect(isMemoryMetaCommand('delete this memory: I learned SQLite')).toBe(true);
    expect(isMemoryMetaCommand('Remember to delete the temp files')).toBe(false);
    expect(matchesNegativePattern('delete this memory: I learned SQLite', 'learning')).toBe(true);
    expect(matchesNegativePattern('Remember to delete the temp files', 'procedural')).toBe(false);
  });

  it('reports stable debug markers for matched negative layers', () => {
    expect(getMatchingNegativePatterns('Summary: The user prefers Bun', 'preference')).toContain('[AI_META_TALK]');
    expect(getMatchingNegativePatterns('delete this memory: I learned SQLite', 'learning')).toContain('[MEMORY_COMMAND]');
  });
});

describe('golden: role pattern detection', () => {
  it('scores human intent and assistant acknowledgement separately', () => {
    expect(scoreHumanIntent('Remember this: I prefer Bun')).toBe(0.6);
    expect(scoreAssistantAcknowledgment('The user prefers Bun and got it, noted')).toBe(0.75);
    expect(inferRoleFromText('The user prefers Bun and got it, noted')).toBe('assistant');
  });

  it('detects explicit remember signals and assistant list patterns', () => {
    expect(hasExplicitRememberSignal('请记住 trueMem 的事实源是 SQLite')).toBe(true);
    expect(hasExplicitRememberSignal('幫我記一下：偏好繁體中文')).toBe(true);
    expect(hasAssistantListPattern("I've noted the following:")).toBe(true);
  });

  it('parses role-prefixed conversation lines without inventing roles', () => {
    expect(parseConversationLines('Human: I prefer Bun\nAssistant: Noted\nSystem: hidden')).toEqual([
      { text: 'I prefer Bun', role: 'user', lineNumber: 0 },
      { text: 'Noted', role: 'assistant', lineNumber: 1 },
    ]);
  });
});

describe('golden: scope heuristics are filtering boundaries, not cognition', () => {
  const context: ConversationContext = {
    recentMessages: ['We are editing D:\\Program Files\\trueMem\\src\\memory\\classifier.ts in this project'],
    worktree: 'D:\\Program Files\\trueMem',
    projectTerms: ['truemem'],
  };

  it('detects global scope keywords across languages', () => {
    expect(hasGlobalScopeKeyword('Use Chinese responses in all projects')).toBe(true);
    expect(hasGlobalScopeKeyword('这个偏好适用于所有项目')).toBe(true);
    expect(hasGlobalScopeKeyword('這個偏好適用於所有專案')).toBe(true);
    expect(hasGlobalScopeKeyword('Use Chinese responses here')).toBe(false);
  });

  it('extracts project terms and project signals deterministically', () => {
    expect(extractProjectTerms('D:\\Program Files\\trueMem')).toEqual(['truemem']);
    expect(detectProjectSignals(context)).toEqual({
      score: 1,
      reasons: [
        'project_path_mentioned',
        'project_terms: truemem',
        'explicit_project_context',
      ],
    });
  });

  it('respects explicit global keywords over project signals', () => {
    expect(shouldBeProjectScope('Always answer in Chinese', context, true)).toEqual({
      isProjectScope: false,
      confidence: 0.9,
      reason: 'explicit_global_keyword',
    });

    expect(shouldBeProjectScope('Prefer SQLite for trueMem storage', context, false)).toEqual({
      isProjectScope: true,
      confidence: 1,
      reason: 'project_signals: project_path_mentioned, project_terms: truemem, explicit_project_context',
    });
  });
});

describe('golden: reconsolidation thresholds', () => {
  it('keeps Jaccard-era thresholds stable', () => {
    expect(getSimilarityThresholds()).toEqual({
      DUPLICATE: 0.85,
      CONFLICT: 0.7,
      MIN_RELEVANT: 0.5,
    });
  });

  it('keeps minimum relevance inclusive at 0.5', () => {
    expect(isRelevant(0.49)).toBe(false);
    expect(isRelevant(0.5)).toBe(true);
  });
});
