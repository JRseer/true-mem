import { getRetrievePipelineEnabledFromConfig } from '../../config/config.js';
import { log } from '../../logger.js';
import { PipelineManager, runMemoryRetrievePipeline } from '../../pipeline/index.js';
import type { ScopeSource } from '../../scope/index.js';
import type { StorageReadPort } from '../../storage/index.js';
import type { MemoryStore, MemoryUnit } from '../../types.js';

export interface RetrievePipelineRoutingOptions {
  readonly enabled?: boolean | undefined;
  readonly manager?: PipelineManager | undefined;
  readonly source?: ScopeSource | undefined;
}

export function shouldUseRetrievePipeline(): boolean {
  return getRetrievePipelineEnabledFromConfig() === 1;
}

export async function getScopeMemoriesWithRetrievePipelineFallback(
  storage: StorageReadPort,
  worktree: string | undefined,
  limit: number,
  store?: MemoryStore | undefined,
  options: RetrievePipelineRoutingOptions = {}
): Promise<MemoryUnit[]> {
  const enabled = options.enabled ?? shouldUseRetrievePipeline();

  if (!enabled) {
    return storage.getMemoriesByScope(worktree, limit, store);
  }

  try {
    const result = await runMemoryRetrievePipeline({
      metadata: {
        storage,
        limit,
        store,
      },
      scope: worktree
        ? { project: worktree, source: options.source ?? 'unknown' }
        : { visibility: 'global', source: options.source ?? 'unknown' },
    }, options.manager ?? new PipelineManager());
    const retrieveResult = result.metadata.retrieveResult;

    if (!isRetrieveResultMemoryList(retrieveResult)) {
      throw new Error('memory.retrieve completed without retrieveResult memories');
    }

    log('Retrieve pipeline routed scope-only read', {
      worktree,
      limit,
      store,
      memories: retrieveResult.memories.length,
      metadata: retrieveResult.metadata,
    });

    return [...retrieveResult.memories];
  } catch (error) {
    log(`Retrieve pipeline failed; falling back to legacy scope read: ${error}`);
    return storage.getMemoriesByScope(worktree, limit, store);
  }
}

export async function getQueryMemoriesWithRetrievePipelineFallback(
  storage: StorageReadPort,
  query: string,
  worktree: string | undefined,
  limit: number,
  options: RetrievePipelineRoutingOptions = {}
): Promise<MemoryUnit[]> {
  const enabled = options.enabled ?? shouldUseRetrievePipeline();

  if (!enabled) {
    return storage.vectorSearch(query, worktree, limit);
  }

  try {
    const result = await runMemoryRetrievePipeline({
      metadata: {
        storage,
        query,
        limit,
      },
      scope: worktree
        ? { project: worktree, source: options.source ?? 'unknown' }
        : { visibility: 'global', source: options.source ?? 'unknown' },
    }, options.manager ?? new PipelineManager());
    const retrieveResult = result.metadata.retrieveResult;

    if (!isRetrieveResultMemoryList(retrieveResult)) {
      throw new Error('memory.retrieve query completed without retrieveResult memories');
    }

    log('Retrieve pipeline routed query read', {
      worktree,
      limit,
      queryLength: query.length,
      memories: retrieveResult.memories.length,
      metadata: retrieveResult.metadata,
    });

    return [...retrieveResult.memories];
  } catch (error) {
    log(`Retrieve pipeline query failed; falling back to legacy vectorSearch: ${error}`);
    return storage.vectorSearch(query, worktree, limit);
  }
}

function isRetrieveResultMemoryList(value: unknown): value is { readonly memories: readonly MemoryUnit[]; readonly metadata: unknown } {
  return typeof value === 'object'
    && value !== null
    && 'memories' in value
    && Array.isArray(value.memories);
}
