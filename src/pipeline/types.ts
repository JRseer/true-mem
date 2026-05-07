/**
 * Pipeline execution contracts.
 *
 * These types describe execution only. Cognitive memory decisions remain owned
 * by the domain layer and existing memory classifier functions.
 */

export type PipelineRunStatus = 'completed' | 'failed';

export type PipelineStepStatus = 'completed' | 'failed';

export interface PipelineStepTrace {
  name: string;
  version: string;
  status: PipelineStepStatus;
  startedAt: string;
  completedAt: string;
  requires: readonly string[];
  produces: readonly string[];
  error?: string | undefined;
}

export interface PipelineRunTrace {
  runId: string;
  pipelineName: string;
  pipelineVersion: string;
  status: PipelineRunStatus;
  startedAt: string;
  completedAt: string;
  steps: PipelineStepTrace[];
  error?: string | undefined;
}

export interface PipelineContext {
  readonly runId: string;
  readonly metadata: Record<string, unknown>;
  readonly traces: PipelineRunTrace[];
}

export interface PipelineContractState {
  has(key: string): boolean;
  set(key: string, value: unknown): void;
}

export interface PipelineStepHooks<TContext extends PipelineContext = PipelineContext> {
  beforeStep?(step: WorkflowStep<TContext>, context: TContext): Promise<void> | void;
  afterStep?(step: WorkflowStep<TContext>, context: TContext): Promise<void> | void;
  onStepError?(step: WorkflowStep<TContext>, context: TContext, error: unknown): Promise<void> | void;
}

export interface WorkflowStep<TContext extends PipelineContext = PipelineContext> {
  readonly name: string;
  readonly version: string;
  readonly requires?: readonly string[] | undefined;
  readonly produces?: readonly string[] | undefined;
  execute(context: TContext): Promise<TContext> | TContext;
}

export interface PipelineDefinition<TContext extends PipelineContext = PipelineContext> {
  readonly name: string;
  readonly version: string;
  readonly steps: readonly WorkflowStep<TContext>[];
}

export interface PipelineManagerOptions {
  readonly createRunId?: (() => string) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly hooks?: PipelineStepHooks | undefined;
  readonly scheduler?: import('./scheduler.js').ScheduleManager | undefined;
}

// ── Schedule types ──────────────────────────────────────────────

export interface PipelineSchedule {
  readonly id: string;
  readonly cron: string;
  readonly pipelineName: string;
  readonly pipelineVersion: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface ScheduleManagerOptions {
  readonly now?: () => Date;
}

/** Callback invoked when a schedule fires */
export type ScheduleHandler = (schedule: PipelineSchedule) => Promise<void>;
