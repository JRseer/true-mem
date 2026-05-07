import type { PipelineContext, WorkflowStep } from '../types.js';
import type { SuggestionCreateInput } from '../suggestion.js';
import type { MemoryUnit } from '../../types.js';
import { log } from '../../logger.js';

export const INTENT_PREDICT_STEP_NAME = 'intent.predict';
export const INTENT_PREDICT_STEP_VERSION = '0.1.0';

/**
 * Simple memory-compatible type guard for storage.
 */
interface MinimalStorageRead {
  getMemoriesByScope(
    project?: string,
    limit?: number,
    store?: string,
    sessionId?: string
  ): MemoryUnit[];
}

function isMinimalStorageRead(value: unknown): value is MinimalStorageRead {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>).getMemoriesByScope === 'function';
}

interface PatternMemory extends MemoryUnit {
  classification: 'pattern';
  metadata?: {
    source_memory_ids?: string[];
    cluster_size?: number;
    detection_time?: string;
  };
}

function isPattern(m: MemoryUnit): m is PatternMemory {
  return m.classification === 'pattern' && m.status === 'active';
}

/**
 * INTENT_PREDICT_STEP
 *
 * Produces `suggestionInputs` — an array of SuggestionCreateInput ready for
 * the SuggestionQueue.  This step gathers active patterns + recent project
 * memories and derives ranked suggestions via rule-based heuristics.
 *
 * When a ChatProvider is wired (future), the LLM-based path can enrich
 * the suggestions before queuing.
 */
export const INTENT_PREDICT_STEP: WorkflowStep<PipelineContext> = {
  name: INTENT_PREDICT_STEP_NAME,
  version: INTENT_PREDICT_STEP_VERSION,
  requires: ['storage', 'db'],
  produces: ['suggestionInputs'],
  execute: async (context) => {
    const storage = (context.metadata.storage ?? context.metadata.db) as unknown;

    if (!isMinimalStorageRead(storage)) {
      throw new Error(
        'intent.predict step requires metadata.storage or metadata.db with getMemoriesByScope'
      );
    }

    // 1 ── Gather active patterns (last 24h, utility > 0.3)
    const projectScope =
      typeof context.metadata.worktree === 'string'
        ? context.metadata.worktree
        : undefined;

    const allMemories = storage.getMemoriesByScope(projectScope, 100);
    const patterns = allMemories.filter(isPattern);

    // 2 ── Gather recent project memories (7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentMemories = allMemories.filter(
      m =>
        m.status === 'active' &&
        m.createdAt >= sevenDaysAgo &&
        m.classification !== 'pattern'
    );

    // 3 ── Generate suggestion inputs (rule-based MVP)
    const inputs: SuggestionCreateInput[] = [];

    // Rule A: high-confidence patterns → suggestions
    for (const p of patterns) {
      if ((p.strength ?? 0) < 0.6) continue;
      inputs.push({
        type: 'suggestion',
        priority: Math.min(p.strength, 1),
        summary: `Pattern detected: ${truncate(p.summary, 120)}`,
        detail: `Based on your recurring activity pattern: ${p.summary}`,
        confidence: Math.min((p.confidence ?? 0.6) + 0.1, 1),
        sourcePatternIds: [p.id],
      });
    }

    // Rule B: stale project memories → reminder hints
    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const staleMemories = recentMemories.filter(m => m.lastAccessedAt < staleThreshold);
    if (staleMemories.length > 0 && inputs.length < 5) {
      const topStale = staleMemories
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 3);
      inputs.push({
        type: 'reminder',
        priority: 0.55,
        summary: `You have ${staleMemories.length} memories that haven't been accessed recently`,
        detail: topStale.map(m => `- ${truncate(m.summary, 80)}`).join('\n'),
        confidence: 0.65,
        sourcePatternIds: [],
      });
    }

    context.metadata.suggestionInputs = inputs;
    log(`intent-predict: generated ${inputs.length} suggestion inputs`);

    return context;
  },
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
