import { describe, expect, it } from 'vitest';
import { createV1TrueMemDomainAdapter } from '../../src/domain/index.js';
import type { TrueMemDomainPort } from '../../src/domain/index.js';
import type { MemoryClassification, MessageRole } from '../../src/types.js';

const domain: TrueMemDomainPort = createV1TrueMemDomainAdapter();

interface MatrixCase {
  readonly classification: MemoryClassification;
  readonly text: string;
  readonly role: MessageRole;
  readonly shouldClassify: boolean;
  readonly roleValidated: boolean;
  readonly storeType: 'ltm' | 'stm';
}

const WORKTREE = 'D:\\Program Files\\trueMem';

const MATRIX_CASES: readonly MatrixCase[] = [
  { classification: 'preference', text: 'Remember this: I prefer Vitest over Jest', role: 'user', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'constraint', text: 'Remember this: Never use var in any project', role: 'user', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'learning', text: 'Remember this: I learned that Bun is faster than Node.js', role: 'user', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'procedural', text: 'Remember this: always test before you commit', role: 'user', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'decision', text: 'Remember this: we decided to use SQLite as the database', role: 'user', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'decision', text: 'Remember this: we decided to use SQLite as the database', role: 'assistant', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'semantic', text: 'Remember this: the trueMem API uses REST over HTTP', role: 'user', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'semantic', text: 'Remember this: the trueMem API uses REST over HTTP', role: 'assistant', shouldClassify: true, roleValidated: true, storeType: 'ltm' },
  { classification: 'episodic', text: 'Remember this: yesterday I refactored the pipeline tests', role: 'user', shouldClassify: true, roleValidated: true, storeType: 'stm' },
  { classification: 'episodic', text: 'Remember this: yesterday we fixed a type error', role: 'assistant', shouldClassify: true, roleValidated: true, storeType: 'stm' },
];

const USER_LEVEL_KEYS: readonly MemoryClassification[] = ['preference', 'constraint', 'learning', 'procedural'];

describe('golden: 7-classification × role matrix', () => {
  it('rejects assistant-authored user-level classifications', () => {
    for (const classification of USER_LEVEL_KEYS) {
      const text = 'Remember this: I prefer strict analysis';
      const signals = domain.matchImportanceSignals(text);
      const context = {
        primaryRole: 'assistant' as MessageRole, hasAssistantMessages: true, recentMessages: [text],
        roleWeightedScore: 0.5, hasAssistantContext: true, fullConversation: text,
      };
      const result = domain.classifyWithRoleAwareness(text, [...signals], context);
      if (result.classification && USER_LEVEL_KEYS.includes(result.classification)) {
        expect(result.roleValidated).toBe(false);
      }
    }
  });

  for (const c of MATRIX_CASES) {
    it(`classifies ${c.classification} from ${c.role} role`, () => {
      const signals = domain.matchImportanceSignals(c.text);
      expect(signals.length).toBeGreaterThan(0);

      const baseScore = domain.calculateBaseSignalScore(signals);
      const roleWeighted = domain.calculateRoleWeightedScore(baseScore, c.role, c.text);
      const context = {
        primaryRole: c.role, hasAssistantMessages: c.role === 'assistant', recentMessages: [c.text],
        roleWeightedScore: roleWeighted, hasAssistantContext: c.role === 'assistant', fullConversation: c.text,
      };
      const result = domain.classifyWithRoleAwareness(c.text, [...signals], context);

      expect(result.classification).toBeTruthy();
      expect(result.roleValidated).toBe(c.roleValidated);
    });

    it(`store resolution for ${c.classification}: ${c.storeType}`, () => {
      const store = domain.resolveStore(c.classification, 0.85);
      expect(store.storeTarget).toBe(c.storeType);
    });
  }

  describe('scope resolution', () => {
    it('project-level classifications bind to worktree', () => {
      const d = domain.resolveProjectScope('decision', '', { recentMessages: [], worktree: WORKTREE });
      expect(d.isProjectScope).toBe(true);
      expect(d.projectScope).toBe(WORKTREE);
    });

    it('user-level classifications remain global by default', () => {
      const d = domain.resolveProjectScope('preference', 'Always use TypeScript', {
        recentMessages: ['Always use TypeScript in every project'], worktree: WORKTREE,
      });
      expect(d.projectScope).toBeNull();
    });
  });

  describe('reconsolidation thresholds', () => {
    it('preserves Jaccard-era thresholds', () => {
      const t = domain.getSimilarityThresholds();
      expect(t.DUPLICATE).toBe(0.85);
      expect(t.CONFLICT).toBe(0.7);
      expect(t.MIN_RELEVANT).toBe(0.5);
      expect(domain.isRelevant(0.5)).toBe(true);
      expect(domain.isRelevant(0.49)).toBe(false);
    });
  });

  it('rejects questions', () => {
    const d = domain.shouldStoreMemory('Do you remember my preference?', 'preference', 0.8);
    expect(d.store).toBe(false);
    expect(d.reason).toBe('is_question_not_statement');
  });
});
