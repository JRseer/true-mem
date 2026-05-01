import type { MemoryUnit } from '../../types.js';
import type { TrueMemoryAdapterState } from './index.js';
import { log } from '../../logger.js';

/**
 * Extract a clean summary from conversation text.
 * Removes "Human:" / "Assistant:" prefixes and trims to reasonable length.
 */
export async function getRelevantMemories(state: TrueMemoryAdapterState, limit: number, query?: string): Promise<MemoryUnit[]> {
  if (query) {
    // Use Jaccard similarity search (text-based, no embeddings)
    return state.db.vectorSearch(query, state.worktree, limit);
  } else {
    // Fall back to scope-based retrieval
    return state.db.getMemoriesByScope(state.worktree, limit);
  }
}

export async function injectContext(state: TrueMemoryAdapterState, sessionId: string, context: string): Promise<void> {
  try {
    await state.client.session.prompt({
      path: { id: sessionId },
      body: {
        noReply: true,
        parts: [{ type: 'text', text: context }],
      },
    });
  } catch (error) {
    log(`Failed to inject context: ${error}`);
  }
}
