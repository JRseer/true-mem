import { describe, expect, it } from 'vitest';
import { PipelineManager } from '../../src/pipeline/index.js';
import type { PipelineContext, PipelineDefinition, WorkflowStep } from '../../src/pipeline/index.js';

interface TestPipelineContext extends PipelineContext {
  readonly events: string[];
}

function createDeterministicManager(): PipelineManager {
  let runCounter = 0;
  let timeCounter = 0;

  return new PipelineManager({
    createRunId: () => `run-${++runCounter}`,
    now: () => new Date(Date.UTC(2026, 3, 30, 0, 0, timeCounter++)),
  });
}

describe('golden: PipelineManager execution shell', () => {
  it('executes versioned workflow steps in order and records run trace', async () => {
    const manager = createDeterministicManager();
    const context: TestPipelineContext = {
      ...manager.createContext({ source: 'golden' }),
      events: [],
    };
    const steps: WorkflowStep<TestPipelineContext>[] = [
      {
        name: 'normalize',
        version: '1.0.0',
        execute: (currentContext) => {
          currentContext.events.push('normalize');
          return currentContext;
        },
      },
      {
        name: 'classify',
        version: '1.0.0',
        execute: async (currentContext) => {
          currentContext.events.push('classify');
          return currentContext;
        },
      },
    ];
    const definition: PipelineDefinition<TestPipelineContext> = {
      name: 'memory.ingest',
      version: '0.1.0',
      steps,
    };

    const result = await manager.run(definition, context);

    expect(result).toBe(context);
    expect(result.events).toEqual(['normalize', 'classify']);
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0]).toMatchObject({
      runId: 'run-1',
      pipelineName: 'memory.ingest',
      pipelineVersion: '0.1.0',
      status: 'completed',
      steps: [
        { name: 'normalize', version: '1.0.0', status: 'completed' },
        { name: 'classify', version: '1.0.0', status: 'completed' },
      ],
    });
  });

  it('records failed step trace and rethrows without swallowing the root error', async () => {
    const manager = createDeterministicManager();
    const context: TestPipelineContext = {
      ...manager.createContext(),
      events: [],
    };
    const failure = new Error('classification stayed domain-owned');
    const definition: PipelineDefinition<TestPipelineContext> = {
      name: 'memory.ingest',
      version: '0.1.0',
      steps: [
        {
          name: 'normalize',
          version: '1.0.0',
          execute: (currentContext) => {
            currentContext.events.push('normalize');
            return currentContext;
          },
        },
        {
          name: 'classify',
          version: '1.0.0',
          execute: () => {
            throw failure;
          },
        },
      ],
    };

    await expect(manager.run(definition, context)).rejects.toThrow(failure);

    expect(context.traces).toHaveLength(1);
    expect(context.traces[0]).toMatchObject({
      status: 'failed',
      error: 'classification stayed domain-owned',
      steps: [
        { name: 'normalize', version: '1.0.0', status: 'completed' },
        {
          name: 'classify',
          version: '1.0.0',
          status: 'failed',
          error: 'classification stayed domain-owned',
        },
      ],
    });
  });

  it('enforces declared step inputs and outputs through metadata contracts', async () => {
    const manager = createDeterministicManager();
    const context: TestPipelineContext = {
      ...manager.createContext(),
      events: [],
    };
    const definition: PipelineDefinition<TestPipelineContext> = {
      name: 'memory.ingest',
      version: '0.1.0',
      steps: [
        {
          name: 'normalize',
          version: '1.0.0',
          produces: ['normalizedText'],
          execute: (currentContext) => {
            currentContext.events.push('normalize');
            currentContext.metadata.normalizedText = 'Remember this: always use TypeScript';
            return currentContext;
          },
        },
        {
          name: 'classify',
          version: '1.0.0',
          requires: ['normalizedText'],
          produces: ['classification'],
          execute: (currentContext) => {
            currentContext.events.push('classify');
            currentContext.metadata.classification = 'preference';
            return currentContext;
          },
        },
      ],
    };

    const result = await manager.run(definition, context);

    expect(result.events).toEqual(['normalize', 'classify']);
    expect(result.traces[0]?.steps).toMatchObject([
      {
        name: 'normalize',
        requires: [],
        produces: ['normalizedText'],
        status: 'completed',
      },
      {
        name: 'classify',
        requires: ['normalizedText'],
        produces: ['classification'],
        status: 'completed',
      },
    ]);
  });

  it('fails before execution when a step requires an unavailable upstream output', async () => {
    const manager = createDeterministicManager();
    const context: TestPipelineContext = {
      ...manager.createContext(),
      events: [],
    };
    const definition: PipelineDefinition<TestPipelineContext> = {
      name: 'memory.ingest',
      version: '0.1.0',
      steps: [
        {
          name: 'classify',
          version: '1.0.0',
          requires: ['normalizedText'],
          execute: (currentContext) => {
            currentContext.events.push('classify');
            return currentContext;
          },
        },
      ],
    };

    await expect(manager.run(definition, context)).rejects.toThrow(
      'Pipeline step "classify" missing required outputs: normalizedText'
    );

    expect(context.events).toEqual([]);
    expect(context.traces[0]).toMatchObject({
      status: 'failed',
      steps: [
        {
          name: 'classify',
          status: 'failed',
          error: 'Pipeline step "classify" missing required outputs: normalizedText',
        },
      ],
    });
  });

  it('fails after execution when a step does not produce a declared output', async () => {
    const manager = createDeterministicManager();
    const context: TestPipelineContext = {
      ...manager.createContext(),
      events: [],
    };
    const definition: PipelineDefinition<TestPipelineContext> = {
      name: 'memory.ingest',
      version: '0.1.0',
      steps: [
        {
          name: 'normalize',
          version: '1.0.0',
          produces: ['normalizedText'],
          execute: (currentContext) => {
            currentContext.events.push('normalize');
            return currentContext;
          },
        },
      ],
    };

    await expect(manager.run(definition, context)).rejects.toThrow(
      'Pipeline step "normalize" did not produce declared output: normalizedText'
    );

    expect(context.events).toEqual(['normalize']);
    expect(context.traces[0]).toMatchObject({
      status: 'failed',
      steps: [
        {
          name: 'normalize',
          status: 'failed',
          produces: ['normalizedText'],
          error: 'Pipeline step "normalize" did not produce declared output: normalizedText',
        },
      ],
    });
  });

  it('runs step interceptors around execution and reports failures to the error hook', async () => {
    const hookEvents: string[] = [];
    const manager = new PipelineManager({
      createRunId: () => 'run-hooks',
      now: () => new Date(Date.UTC(2026, 3, 30, 0, 1, hookEvents.length)),
      hooks: {
        beforeStep: step => {
          hookEvents.push(`before:${step.name}`);
        },
        afterStep: step => {
          hookEvents.push(`after:${step.name}`);
        },
        onStepError: (step, _context, error) => {
          hookEvents.push(`error:${step.name}:${error instanceof Error ? error.message : String(error)}`);
        },
      },
    });
    const context: TestPipelineContext = {
      ...manager.createContext(),
      events: [],
    };
    const failure = new Error('persist failed');
    const definition: PipelineDefinition<TestPipelineContext> = {
      name: 'memory.ingest',
      version: '0.1.0',
      steps: [
        {
          name: 'normalize',
          version: '1.0.0',
          execute: (currentContext) => {
            currentContext.events.push('normalize');
            return currentContext;
          },
        },
        {
          name: 'persist',
          version: '1.0.0',
          execute: () => {
            throw failure;
          },
        },
      ],
    };

    await expect(manager.run(definition, context)).rejects.toThrow(failure);

    expect(hookEvents).toEqual([
      'before:normalize',
      'after:normalize',
      'before:persist',
      'error:persist:persist failed',
    ]);
  });
});
