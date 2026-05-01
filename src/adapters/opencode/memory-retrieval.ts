import type { MemoryUnit } from '../../types.js';
import type { TrueMemoryAdapterState } from './index.js';
import { log } from '../../logger.js';
import {
  getQueryMemoriesWithRetrievePipelineFallback,
  getScopeMemoriesWithRetrievePipelineFallback,
} from './retrieve-pipeline-routing.js';

/**
 * Extract a clean summary from conversation text.
 * Removes "Human:" / "Assistant:" prefixes and trims to reasonable length.
 */
export async function getRelevantMemories(state: TrueMemoryAdapterState, limit: number, query?: string): Promise<MemoryUnit[]> {
  if (query) {
    // Use Jaccard similarity search (text-based, no embeddings)
    return getQueryMemoriesWithRetrievePipelineFallback(
      state.db,
      query,
      state.worktree,
      limit,
      {
        manager: state.pipelineManager,
        source: 'tool',
      }
    );
  } else {
    // Fall back to scope-based retrieval
    return getScopeMemoriesWithRetrievePipelineFallback(
      state.db,
      state.worktree,
      limit,
      undefined,
      {
        manager: state.pipelineManager,
        source: 'tool',
      }
    );
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
