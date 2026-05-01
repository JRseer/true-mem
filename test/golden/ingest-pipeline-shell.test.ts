import { describe, expect, it } from 'vitest';

import {
  createMemoryIngestPipelineContext,
  MEMORY_INGEST_BOUNDARY_STEP_NAME,
  MEMORY_INGEST_PIPELINE,
  MEMORY_INGEST_PIPELINE_NAME,
  MEMORY_INGEST_PIPELINE_VERSION,
  PipelineManager,
  runMemoryIngestPipelineShell,
} from '../../src/pipeline/index.js';

function createDeterministicManager(): PipelineManager {
  let runCounter = 0;
  let timeCounter = 0;

  return new PipelineManager({
    createRunId: () => `ingest-run-${++runCounter}`,
    now: () => new Date(Date.UTC(2026, 3, 30, 1, 0, timeCounter++)),
  });
}

describe('golden: memory.ingest pipeline shell', () => {
  it('carries ScopeContext through metadata and records a boundary-only trace', async () => {
    const manager = createDeterministicManager();
    const context = createMemoryIngestPipelineContext(manager, {
      metadata: { source: 'golden' },
      scope: {
        project: 'trueMem',
        session: 'session-1',
        source: 'user',
        type: 'preference',
        confidence: 0.65,
      },
    });

    const result = await manager.run(MEMORY_INGEST_PIPELINE, context);

    expect(result).toBe(context);
    expect(result.metadata).toEqual({
      source: 'golden',
      pipelineName: MEMORY_INGEST_PIPELINE_NAME,
      pipelineVersion: MEMORY_INGEST_PIPELINE_VERSION,
    });
    expect(result.scope).toMatchObject({
      project: 'truemem',
      session: 'session-1',
      source: 'user',
      type: 'preference',
      confidence: 0.65,
      visibility: 'session',
    });
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0]).toMatchObject({
      runId: 'ingest-run-1',
      pipelineName: 'memory.ingest',
      pipelineVersion: '0.1.0',
      status: 'completed',
      steps: [
        {
          name: 'ingest.shell',
          version: '0.1.0',
          status: 'completed',
        },
      ],
    });
  });

  it('does not pretend that cognition has moved into pipeline steps', () => {
    expect(MEMORY_INGEST_PIPELINE.steps.map(step => step.name)).toEqual([
      MEMORY_INGEST_BOUNDARY_STEP_NAME,
    ]);
    expect(MEMORY_INGEST_PIPELINE.steps.map(step => step.name)).not.toContain('classify');
    expect(MEMORY_INGEST_PIPELINE.steps.map(step => step.name)).not.toContain('score');
    expect(MEMORY_INGEST_PIPELINE.steps.map(step => step.name)).not.toContain('dedupe');
  });

  it('provides a runnable shell helper with default global scope', async () => {
    const manager = createDeterministicManager();

    const result = await runMemoryIngestPipelineShell({}, manager);

    expect(result.runId).toBe('ingest-run-1');
    expect(result.scope).toMatchObject({
      source: 'unknown',
      visibility: 'global',
    });
    expect(result.traces[0]).toMatchObject({
      pipelineName: 'memory.ingest',
      status: 'completed',
      steps: [{ name: 'ingest.shell', status: 'completed' }],
    });
  });
});
