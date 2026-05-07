/**
 * Intent Predict Pipeline — proactive memory v3.0
 *
 * Assembly helpers for the intent-predict pipeline.
 */
import type { PipelineContext, PipelineDefinition, PipelineSchedule } from './types.js';
import { PipelineManager } from './manager.js';
import { INTENT_PREDICT_STEP } from './steps/intent-predict.js';
import type { SuggestionCreateInput, SuggestionQueue } from './suggestion.js';
import { log } from '../logger.js';

export const INTENT_PREDICT_PIPELINE_NAME = 'intent-predict';
export const INTENT_PREDICT_PIPELINE_VERSION = '0.1.0';

export const INTENT_PREDICT_PIPELINE: PipelineDefinition<PipelineContext> = {
  name: INTENT_PREDICT_PIPELINE_NAME,
  version: INTENT_PREDICT_PIPELINE_VERSION,
  steps: [INTENT_PREDICT_STEP],
};

export interface IntentPredictPipelineInput {
  readonly manager: PipelineManager;
  readonly context: PipelineContext;
}

export interface IntentPredictRegisterInput {
  readonly manager: PipelineManager;
  readonly queue: SuggestionQueue;
  readonly cron?: string;
}

function assertSuggestionInputs(
  value: unknown
): value is SuggestionCreateInput[] {
  return Array.isArray(value);
}

/**
 * Run the intent-predict pipeline and feed results into the SuggestionQueue.
 */
export async function runIntentPredictPipeline(
  input: IntentPredictPipelineInput,
  queue: SuggestionQueue
): Promise<PipelineContext> {
  const result = await input.manager.run(
    INTENT_PREDICT_PIPELINE,
    input.context
  );

  const inputs = result.metadata.suggestionInputs;
  if (assertSuggestionInputs(inputs)) {
    let enqueued = 0;
    for (const item of inputs) {
      const s = queue.enqueue(item);
      if (s) enqueued++;
    }
    log(`intent-predict: enqueued ${enqueued}/${inputs.length} suggestions`);
  }

  return result;
}

export function createIntentPredictSchedule(intervalMinutes: number = 30): PipelineSchedule {
  return {
    id: 'schedule:intent-predict',
    cron: `*/${Math.max(1, Math.min(intervalMinutes, 1440))} * * * *`,
    pipelineName: INTENT_PREDICT_PIPELINE_NAME,
    pipelineVersion: INTENT_PREDICT_PIPELINE_VERSION,
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
  };
}

export function registerIntentPredictSchedule(
  input: IntentPredictRegisterInput
): PipelineSchedule {
  const schedule = createIntentPredictSchedule();

  input.manager.registerSchedule(schedule, INTENT_PREDICT_PIPELINE);

  log(
    `intent-predict schedule registered: ${schedule.id} (cron=${schedule.cron})`
  );

  return schedule;
}
