import { attachScopeContext, createScopeContext } from '../scope/index.js';
import { PipelineManager } from './manager.js';
import type { ScopeContextInput, ScopedPipelineContext } from '../scope/index.js';
import type { PipelineDefinition, WorkflowStep } from './types.js';

export const MEMORY_INGEST_PIPELINE_NAME = 'memory.ingest';
export const MEMORY_INGEST_PIPELINE_VERSION = '0.1.0';
export const MEMORY_INGEST_BOUNDARY_STEP_NAME = 'ingest.shell';
export const MEMORY_INGEST_BOUNDARY_STEP_VERSION = '0.1.0';

export interface MemoryIngestShellInput {
  readonly metadata?: Record<string, unknown> | undefined;
  readonly scope?: ScopeContextInput | undefined;
}

export type MemoryIngestPipelineContext = ScopedPipelineContext;

const MEMORY_INGEST_BOUNDARY_STEP: WorkflowStep<MemoryIngestPipelineContext> = {
  name: MEMORY_INGEST_BOUNDARY_STEP_NAME,
  version: MEMORY_INGEST_BOUNDARY_STEP_VERSION,
  execute: (context) => context,
};

export const MEMORY_INGEST_PIPELINE: PipelineDefinition<MemoryIngestPipelineContext> = {
  name: MEMORY_INGEST_PIPELINE_NAME,
  version: MEMORY_INGEST_PIPELINE_VERSION,
  steps: [MEMORY_INGEST_BOUNDARY_STEP],
};

export function createMemoryIngestPipelineContext(
  manager: PipelineManager,
  input: MemoryIngestShellInput = {}
): MemoryIngestPipelineContext {
  const context = manager.createContext({
    ...input.metadata,
    pipelineName: MEMORY_INGEST_PIPELINE_NAME,
    pipelineVersion: MEMORY_INGEST_PIPELINE_VERSION,
  });
  const scope = createScopeContext(input.scope);

  return attachScopeContext(context, scope);
}

export async function runMemoryIngestPipelineShell(
  input: MemoryIngestShellInput = {},
  manager: PipelineManager = new PipelineManager()
): Promise<MemoryIngestPipelineContext> {
  const context = createMemoryIngestPipelineContext(manager, input);
  return manager.run(MEMORY_INGEST_PIPELINE, context);
}
