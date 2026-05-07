import { describe, expect, it } from 'vitest';

import { createV1TrueMemDomainAdapter } from '../../src/domain/index.js';
import type { RoleAwareContext } from '../../src/types.js';

describe('golden: v1 domain port adapter', () => {
  it('delegates explicit user preference classification to the v1 role-aware classifier', () => {
    const domain = createV1TrueMemDomainAdapter();
    const text = 'Remember this: I prefer deterministic golden tests, I want Vitest, and I like stable baselines';
    const signals = domain.matchImportanceSignals(text);
    const baseSignalScore = domain.calculateBaseSignalScore(signals);
    const roleAwareContext: RoleAwareContext = {
      primaryRole: 'user',
      roleWeightedScore: domain.calculateRoleWeightedScore(baseSignalScore, 'user', text),
      hasAssistantContext: false,
      fullConversation: `Human: ${text}`,
    };

    const result = domain.classifyWithRoleAwareness(text, signals, roleAwareContext);

    expect(result).toEqual({
      classification: 'preference',
      confidence: 1,
      isolatedContent: 'I prefer deterministic golden tests, I want Vitest, and I like stable baselines',
      roleValidated: true,
      validationReason: 'human_intent_boosted',
    });
  });

  it('preserves question rejection and explicit semantic storage decisions', () => {
    const domain = createV1TrueMemDomainAdapter();

    expect(domain.shouldStoreMemory('Should I remember this preference?', 'preference', 1)).toEqual({
      store: false,
      confidence: 0,
      reason: 'is_question_not_statement',
    });

    expect(domain.shouldStoreMemory('Remember this: the memory viewer runs locally', 'semantic', 0)).toEqual({
      store: true,
      confidence: 0.85,
      reason: 'explicit_intent_semantic',
    });
  });

  it('preserves assistant role rejection for user-level preferences', () => {
    const domain = createV1TrueMemDomainAdapter();
    const text = 'Remember this: I prefer option 3 over option 2';
    const signals = domain.matchImportanceSignals(text);
    const baseSignalScore = domain.calculateBaseSignalScore(signals);
    const roleAwareContext: RoleAwareContext = {
      primaryRole: 'assistant',
      roleWeightedScore: domain.calculateRoleWeightedScore(baseSignalScore, 'assistant', text),
      hasAssistantContext: true,
      fullConversation: `Assistant: ${text}`,
    };

    const result = domain.classifyWithRoleAwareness(text, signals, roleAwareContext);

    expect(result).toMatchObject({
      classification: 'preference',
      roleValidated: false,
      validationReason: 'invalid_role_assistant_for_preference',
    });
  });

  it('delegates scope and store heuristics without infrastructure dependencies', () => {
    const domain = createV1TrueMemDomainAdapter();

    expect(domain.resolveProjectScope('preference', 'Always answer in Chinese', {
      recentMessages: ['We are editing D:\\Program Files\\trueMem\\src\\memory\\classifier.ts in this project'],
      worktree: 'D:\\Program Files\\trueMem',
    })).toEqual({
      projectScope: null,
      isProjectScope: false,
      confidence: 0.9,
      reason: 'explicit_global_keyword',
    });

    expect(domain.resolveProjectScope('preference', 'Prefer SQLite for trueMem storage', {
      recentMessages: ['We are editing D:\\Program Files\\trueMem\\src\\memory\\classifier.ts in this project'],
      worktree: 'D:\\Program Files\\trueMem',
    })).toEqual({
      projectScope: 'D:\\Program Files\\trueMem',
      isProjectScope: true,
      confidence: 1,
      reason: 'project_signals: project_path_mentioned, project_terms: truemem, explicit_project_context',
    });

    expect(domain.resolveStore('preference', 0.85)).toEqual({
      storeTarget: 'ltm',
      isExplicitIntent: true,
    });
    expect(domain.resolveStore('episodic', 1)).toEqual({
      storeTarget: 'stm',
      isExplicitIntent: true,
    });
  });

  it('exposes v1 reconsolidation thresholds as domain policy', () => {
    const domain = createV1TrueMemDomainAdapter();

    expect(domain.getSimilarityThresholds()).toEqual({
      DUPLICATE: 0.85,
      CONFLICT: 0.7,
      MIN_RELEVANT: 0.5,
    });
    expect(domain.isRelevant(0.49)).toBe(false);
    expect(domain.isRelevant(0.5)).toBe(true);
  });
});
