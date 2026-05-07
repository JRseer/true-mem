import { randomUUID } from 'node:crypto';
import type {
  PipelineContext,
  PipelineDefinition,
  PipelineManagerOptions,
  PipelineRunTrace,
  PipelineSchedule,
  PipelineStepTrace,
  WorkflowStep,
} from './types.js';
import { ScheduleManager } from './scheduler.js';

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function hasMetadataKey(context: PipelineContext, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(context.metadata, key);
}

export class PipelineManager {
  private readonly createRunId: () => string;
  private readonly now: () => Date;
  private readonly hooks: PipelineManagerOptions['hooks'];
  private readonly scheduler: ScheduleManager;
  private readonly scheduledDefinitions = new Map<string, PipelineDefinition>();

  constructor(options: PipelineManagerOptions = {}) {
    this.createRunId = options.createRunId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.hooks = options.hooks;
    this.scheduler = options.scheduler ?? new ScheduleManager({ now: this.now });
  }

  createContext(metadata: Record<string, unknown> = {}): PipelineContext {
    return {
      runId: this.createRunId(),
      metadata,
      traces: [],
    };
  }

  async run<TContext extends PipelineContext>(
    definition: PipelineDefinition<TContext>,
    initialContext: TContext
  ): Promise<TContext> {
    const runTrace: PipelineRunTrace = {
      runId: initialContext.runId,
      pipelineName: definition.name,
      pipelineVersion: definition.version,
      status: 'completed',
      startedAt: this.timestamp(),
      completedAt: this.timestamp(),
      steps: [],
    };

    let context = initialContext;
    const contractState = new Map<string, unknown>();

    try {
      for (const step of definition.steps) {
        const stepTrace: PipelineStepTrace = {
          name: step.name,
          version: step.version,
          status: 'completed',
          startedAt: this.timestamp(),
          completedAt: this.timestamp(),
          requires: step.requires ?? [],
          produces: step.produces ?? [],
        };

        try {
          this.assertRequirements(step, contractState);
          await this.hooks?.beforeStep?.(step, context);
          context = await step.execute(context);
          this.recordProducedKeys(step, context, contractState);
          await this.hooks?.afterStep?.(step, context);
          stepTrace.completedAt = this.timestamp();
        } catch (error) {
          stepTrace.status = 'failed';
          stepTrace.error = formatError(error);
          stepTrace.completedAt = this.timestamp();
          runTrace.steps.push(stepTrace);
          await this.hooks?.onStepError?.(step, context, error);
          throw error;
        }

        runTrace.steps.push(stepTrace);
      }

      runTrace.completedAt = this.timestamp();
      context.traces.push(runTrace);
      return context;
    } catch (error) {
      runTrace.status = 'failed';
      runTrace.error = formatError(error);
      runTrace.completedAt = this.timestamp();
      context.traces.push(runTrace);
      throw error;
    }
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private assertRequirements(
    step: WorkflowStep<PipelineContext>,
    contractState: ReadonlyMap<string, unknown>
  ): void {
    const missing = (step.requires ?? []).filter(key => !contractState.has(key));

    if (missing.length > 0) {
      throw new Error(`Pipeline step "${step.name}" missing required outputs: ${missing.join(', ')}`);
    }
  }

  private recordProducedKeys(
    step: WorkflowStep<PipelineContext>,
    context: PipelineContext,
    contractState: Map<string, unknown>
  ): void {
    for (const key of step.produces ?? []) {
      if (!hasMetadataKey(context, key)) {
        throw new Error(`Pipeline step "${step.name}" did not produce declared output: ${key}`);
      }

      contractState.set(key, context.metadata[key]);
    }
  }

  // ── Schedule support ─────────────────────────────────────────

  registerSchedule(
    schedule: PipelineSchedule,
    definition: PipelineDefinition
  ): void {
    this.scheduledDefinitions.set(schedule.id, definition);
    this.scheduler.register(schedule, async () => {
      const def = this.scheduledDefinitions.get(schedule.id);
      if (!def) return;
      await this.run(def, this.createContext());
    });
  }

  unregisterSchedule(id: string): void {
    this.scheduledDefinitions.delete(id);
    this.scheduler.unregister(id);
  }

  get scheduleCount(): number {
    return this.scheduler.getAllSchedules().length;
  }

  getScheduleInfo(id: string): PipelineSchedule | undefined {
    return this.scheduler.getSchedule(id);
  }
}
