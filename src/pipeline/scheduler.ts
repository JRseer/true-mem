import { randomUUID } from 'node:crypto';
import type { PipelineSchedule, ScheduleManagerOptions, ScheduleHandler } from './types.js';
import { log } from '../logger.js';

// ── Cron Parser ──────────────────────────────────────────────────

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  day: Set<number>;
  month: Set<number>;
  weekday: Set<number>;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();

  if (field === '*') {
    for (let i = min; i <= max; i++) result.add(i);
    return result;
  }

  const parts = field.split(',');
  for (const part of parts) {
    if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10);
      if (isNaN(step) || step < 1) throw new Error(`Invalid cron step: ${part}`);
      for (let i = min; i <= max; i += step) result.add(i);
    } else if (part.includes('-')) {
      const rangeParts = part.split('-');
      const startStr = rangeParts[0]!;
      const endStr = rangeParts[1]!;
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid cron range: ${part}`);
      for (let i = start; i <= end; i++) result.add(i);
    } else {
      const val = parseInt(part, 10);
      if (isNaN(val) || val < min || val > max) throw new Error(`Invalid cron value: ${part} (expected ${min}-${max})`);
      result.add(val);
    }
  }

  return result;
}

function parseCron(cron: string): CronFields {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have 5 fields: ${cron}`);
  }

  // Destructure after length check to satisfy TypeScript
  const [m, h, d, mo, w] = fields as [string, string, string, string, string];

  return {
    minute: parseField(m, 0, 59),
    hour: parseField(h, 0, 23),
    day: parseField(d, 1, 31),
    month: parseField(mo, 1, 12),
    weekday: parseField(w, 0, 6),
  };
}

function getNextRunTime(cron: string, from: Date): Date | null {
  const fields = parseCron(cron);

  // Start from next minute to avoid re-triggering
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Safety cap: iterate at most 525600 minutes (1 year)
  for (let i = 0; i < 525600; i++) {
    const month = candidate.getMonth() + 1; // 1-12
    const day = candidate.getDate();
    const weekday = candidate.getDay(); // 0=Sun
    const hour = candidate.getHours();
    const minute = candidate.getMinutes();

    if (
      fields.month.has(month) &&
      fields.day.has(day) &&
      fields.weekday.has(weekday) &&
      fields.hour.has(hour) &&
      fields.minute.has(minute)
    ) {
      return candidate;
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

// ── ScheduleManager ──────────────────────────────────────────────

export class ScheduleManager {
  private readonly now: () => Date;
  private readonly schedules = new Map<string, PipelineSchedule>();
  private readonly handlers = new Map<string, ScheduleHandler>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: ScheduleManagerOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  register(
    schedule: PipelineSchedule,
    handler: ScheduleHandler
  ): void {
    // Validate cron expression
    getNextRunTime(schedule.cron, this.now());

    const s: PipelineSchedule = {
      ...schedule,
      enabled: schedule.enabled,
      lastRunAt: schedule.lastRunAt ?? null,
      nextRunAt: null,
    };

    this.schedules.set(s.id, s);
    this.handlers.set(s.id, handler);

    if (s.enabled) {
      this.scheduleNext(s.id);
    }

    log(`[ScheduleManager] Registered schedule: ${s.pipelineName} (${s.id}) cron="${s.cron}"`);
  }

  unregister(id: string): void {
    this.clearTimer(id);
    this.schedules.delete(id);
    this.handlers.delete(id);
    log(`[ScheduleManager] Unregistered schedule: ${id}`);
  }

  isRegistered(id: string): boolean {
    return this.schedules.has(id);
  }

  getSchedule(id: string): PipelineSchedule | undefined {
    return this.schedules.get(id);
  }

  getAllSchedules(): PipelineSchedule[] {
    return Array.from(this.schedules.values());
  }

  enable(id: string): void {
    const s = this.schedules.get(id);
    if (!s) return;
    s.enabled = true;
    this.scheduleNext(id);
    log(`[ScheduleManager] Enabled schedule: ${id}`);
  }

  disable(id: string): void {
    const s = this.schedules.get(id);
    if (!s) return;
    s.enabled = false;
    s.nextRunAt = null;
    this.clearTimer(id);
    log(`[ScheduleManager] Disabled schedule: ${id}`);
  }

  destroy(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }
    this.schedules.clear();
    this.handlers.clear();
    log('[ScheduleManager] Destroyed all schedules');
  }

  private scheduleNext(id: string): void {
    const s = this.schedules.get(id);
    if (!s || !s.enabled) return;

    const next = getNextRunTime(s.cron, this.now());
    if (!next) {
      log(`[ScheduleManager] No future match for schedule ${id} (cron="${s.cron}")`);
      return;
    }
    s.nextRunAt = next.toISOString();

    const delay = next.getTime() - this.now().getTime();
    if (delay <= 0) {
      // Should not happen with proper getNextRunTime, but guard anyway
      return;
    }

    // Cap at max timer value (~24.8 days) to avoid overflow
    const safeDelay = Math.min(delay, 2147483647);

    const timer = setTimeout(() => {
      void this.fire(id);
    }, safeDelay);

    this.timers.set(id, timer);
  }

  private async fire(id: string): Promise<void> {
    const s = this.schedules.get(id);
    const handler = this.handlers.get(id);
    if (!s || !handler || !s.enabled) return;

    const startedAt = Date.now();

    try {
      s.lastRunAt = this.now().toISOString();
      await handler(s);
      const elapsed = Date.now() - startedAt;
      log(`[ScheduleManager] Schedule fired: ${s.pipelineName} (${id}) elapsed=${elapsed}ms`);
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      log(`[ScheduleManager] Schedule failed: ${s.pipelineName} (${id}) elapsed=${elapsed}ms error=${String(error)}`);
    } finally {
      // Schedule next run only if still enabled and not destroyed
      if (s.enabled) {
        this.scheduleNext(id);
      }
    }
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

// ── Exported helpers ─────────────────────────────────────────────

export { getNextRunTime, parseCron };
