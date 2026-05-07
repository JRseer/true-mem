/**
 * Suggestion Feedback — v3.0 proactive feedback loop
 *
 * Detects suggestion acceptance/ignoring signals in assistant messages
 * and updates corresponding Pattern utility scores.
 */
import type { Suggestion, SuggestionQueue } from '../../pipeline/suggestion.js';
import { log } from '../../logger.js';

/**
 * FeedbackResult maps suggestion IDs to their disposition.
 */
export interface FeedbackResult {
  readonly actedOn: readonly string[];
  readonly ignored: readonly string[];
}

/**
 * Quick heuristic: if the assistant message references a suggestion ID
 * (via data-suggestion-id), treat it as acted_on.
 *
 * More sophisticated detection (e.g. sentiment analysis) can be added
 * without changing the interface.
 */
export function detectFeedbackFromResponse(
  suggestions: readonly Suggestion[],
  assistantResponse: string
): FeedbackResult {
  const actedOn: string[] = [];
  const ignored: string[] = [];

  // Only consider injected suggestions
  const injected = suggestions.filter(s => s.status === 'injected');
  if (injected.length === 0) return { actedOn, ignored };

  // Heuristic: if the assistant mentions the suggestion summary keywords,
  // the user probably acted on it
  const responseLower = assistantResponse.toLowerCase();

  for (const s of injected) {
    // Extract key terms from summary (first 3-4 words)
    const keywords = s.summary
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3);

    if (keywords.length > 0) {
      const matchCount = keywords.filter(k => responseLower.includes(k)).length;
      // If 2+ keyword fragments match, consider it acted_on
      if (matchCount >= 2) {
        actedOn.push(s.id);
      } else {
        ignored.push(s.id);
      }
    } else {
      ignored.push(s.id);
    }
  }

  return { actedOn, ignored };
}

/**
 * Apply feedback to SuggestionQueue and return pattern updates.
 *
 * @returns Array of { patternId, delta } for utility adjustments
 */
export function applyFeedbackToQueue(
  queue: SuggestionQueue,
  feedback: FeedbackResult
): Array<{ patternId: string; delta: number }> {
  const patternDeltas = new Map<string, number>();

  for (const id of feedback.actedOn) {
    const s = queue.all.find(item => item.id === id);
    queue.markActedOn(id);
    if (s) {
      for (const pid of s.sourcePatternIds) {
        patternDeltas.set(pid, (patternDeltas.get(pid) ?? 0) + 0.1);
      }
    }
  }

  for (const id of feedback.ignored) {
    const s = queue.all.find(item => item.id === id);
    queue.markIgnored(id);
    if (s) {
      for (const pid of s.sourcePatternIds) {
        patternDeltas.set(pid, (patternDeltas.get(pid) ?? 0) - 0.05);
      }
    }
  }

  const result: Array<{ patternId: string; delta: number }> = [];
  for (const [patternId, delta] of patternDeltas) {
    result.push({ patternId, delta });
  }
  return result;
}

/**
 * Apply utility deltas to patterns in storage via strength field.
 *
 * Strength is used as a proxy for pattern utility since it's the
 * primary persisted cognitive metric.
 *
 * @param applyDelta - function that updates a memory's strength in storage
 */
export async function applyPatternUtilityUpdates(
  deltas: Array<{ patternId: string; delta: number }>,
  updateStrength: (memoryId: string, delta: number) => void
): Promise<void> {
  for (const { patternId, delta } of deltas) {
    try {
      updateStrength(patternId, delta);
      log(`Pattern ${patternId} utility ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
    } catch (err) {
      log(`Failed to update pattern ${patternId}: ${err}`);
    }
  }
}
