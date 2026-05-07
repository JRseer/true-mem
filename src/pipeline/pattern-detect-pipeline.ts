/**
 * Pattern Detect Pipeline — 模式检测 Pipeline 定义 + 调度注册
 *
 * 定时扫描记忆图谱，识别重复主题并生成 Pattern 实体。
 */
import { PipelineManager } from './manager.js';
import { PATTERN_DETECT_STEP } from './steps/pattern-detect.js';
import type { PipelineDefinition, PipelineContext } from './types.js';
import type { PipelineSchedule } from './types.js';

export const PATTERN_DETECT_PIPELINE_NAME = 'pattern.detect';
export const PATTERN_DETECT_PIPELINE_VERSION = '0.1.0';

/** pattern-detect 默认调度间隔（分钟） */
export const PATTERN_DETECT_DEFAULT_INTERVAL_MINUTES = 60;

export const PATTERN_DETECT_WORKFLOW_STEPS = [PATTERN_DETECT_STEP] as const;

export const PATTERN_DETECT_PIPELINE: PipelineDefinition<PipelineContext> = {
  name: PATTERN_DETECT_PIPELINE_NAME,
  version: PATTERN_DETECT_PIPELINE_VERSION,
  steps: PATTERN_DETECT_WORKFLOW_STEPS,
};

export interface PatternDetectPipelineInput {
  readonly metadata?: Record<string, unknown> | undefined;
  /** 调度间隔（分钟），默认 60 */
  readonly intervalMinutes?: number;
}

/**
 * 为 pattern-detect pipeline 创建调度配置
 */
export function createPatternDetectSchedule(input: PatternDetectPipelineInput = {}): PipelineSchedule {
  const interval = input.intervalMinutes ?? PATTERN_DETECT_DEFAULT_INTERVAL_MINUTES;

  // cron: "0 */N * * *" 表示每隔 N 小时在整分钟触发
  // 对于 N < 60，我们使用 "*/N * * * *"
  const cron = interval >= 60
    ? `0 */${Math.floor(interval / 60)} * * *`
    : `*/${interval} * * *`;

  return {
    id: PATTERN_DETECT_PIPELINE_NAME,
    cron,
    pipelineName: PATTERN_DETECT_PIPELINE_NAME,
    pipelineVersion: PATTERN_DETECT_PIPELINE_VERSION,
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
  };
}

/**
 * 在 PipelineManager 上注册 pattern-detect 调度
 */
export function registerPatternDetectSchedule(
  manager: PipelineManager,
  input: PatternDetectPipelineInput = {}
): void {
  const schedule = createPatternDetectSchedule(input);
  manager.registerSchedule(schedule, PATTERN_DETECT_PIPELINE);
}

export function createPatternDetectPipelineContext(
  manager: PipelineManager,
  input: PatternDetectPipelineInput = {}
): PipelineContext {
  return manager.createContext({
    ...input.metadata,
    pipelineName: PATTERN_DETECT_PIPELINE_NAME,
    pipelineVersion: PATTERN_DETECT_PIPELINE_VERSION,
  });
}

export async function runPatternDetectPipeline(
  input: PatternDetectPipelineInput = {},
  manager: PipelineManager = new PipelineManager()
): Promise<PipelineContext> {
  const context = createPatternDetectPipelineContext(manager, input);
  return manager.run(PATTERN_DETECT_PIPELINE, context);
}
