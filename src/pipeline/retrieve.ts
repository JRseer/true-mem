import { attachScopeContext, createScopeContext } from '../scope/index.js';
import { PipelineManager } from './manager.js';
import { MEMORY_RETRIEVE_WORKFLOW_STEPS } from './steps/retrieve.js';
import type { ScopeContextInput, ScopedPipelineContext } from '../scope/index.js';
import type { PipelineDefinition } from './types.js';

export const MEMORY_RETRIEVE_PIPELINE_NAME = 'memory.retrieve';
export const MEMORY_RETRIEVE_PIPELINE_VERSION = '0.1.0';

export interface MemoryRetrievePipelineInput {
  readonly metadata?: Record<string, unknown> | undefined;
  readonly scope?: ScopeContextInput | undefined;
}

export type MemoryRetrievePipelineContext = ScopedPipelineContext;

export const MEMORY_RETRIEVE_PIPELINE: PipelineDefinition<MemoryRetrievePipelineContext> = {
  name: MEMORY_RETRIEVE_PIPELINE_NAME,
  version: MEMORY_RETRIEVE_PIPELINE_VERSION,
  steps: MEMORY_RETRIEVE_WORKFLOW_STEPS,
};

export function createMemoryRetrievePipelineContext(
  manager: PipelineManager,
  input: MemoryRetrievePipelineInput = {}
): MemoryRetrievePipelineContext {
  const context = manager.createContext({
    ...input.metadata,
    pipelineName: MEMORY_RETRIEVE_PIPELINE_NAME,
    pipelineVersion: MEMORY_RETRIEVE_PIPELINE_VERSION,
  });
  const scope = createScopeContext(input.scope);

  return attachScopeContext(context, scope);
}

export async function runMemoryRetrievePipeline(
  input: MemoryRetrievePipelineInput = {},
  manager: PipelineManager = new PipelineManager()
): Promise<MemoryRetrievePipelineContext> {
  const context = createMemoryRetrievePipelineContext(manager, input);
  return manager.run(MEMORY_RETRIEVE_PIPELINE, context);
}
