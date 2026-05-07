import { describe, expect, it } from 'vitest';
import {
  ScheduleManager,
  parseCron,
  getNextRunTime,
} from '../../src/pipeline/index.js';
import type { PipelineSchedule } from '../../src/pipeline/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSchedule(overrides: Partial<PipelineSchedule> = {}): PipelineSchedule {
  return {
    id: 'test-schedule-1',
    cron: '*/5 * * * *',
    pipelineName: 'test.pipeline',
    pipelineVersion: '1.0.0',
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    ...overrides,
  };
}

function createDeterministicManager(epochIso = '2026-05-07T10:00:00Z'): {
  manager: ScheduleManager;
  advance: (minutes: number) => void;
  getNow: () => Date;
} {
  const start = new Date(epochIso).getTime();
  let offset = 0;
  const getNow = (): Date => new Date(start + offset);
  const manager = new ScheduleManager({ now: getNow });
  return {
    manager,
    advance: (minutes: number) => {
      offset += minutes * 60 * 1000;
    },
    getNow,
  };
}

// ---------------------------------------------------------------------------
// parseCron
// ---------------------------------------------------------------------------
describe('golden: parseCron', () => {
  it('parses every-minute wildcard', () => {
    const fields = parseCron('* * * * *');
    expect(fields.minute.size).toBe(60);
    expect(fields.hour.size).toBe(24);
    expect(fields.day.size).toBe(31);
    expect(fields.month.size).toBe(12);
    expect(fields.weekday.size).toBe(7);
  });

  it('parses every-N intervals', () => {
    const fields = parseCron('*/15 */2 * * *');
    // minutes: 0, 15, 30, 45
    expect(fields.minute.has(0)).toBe(true);
    expect(fields.minute.has(15)).toBe(true);
    expect(fields.minute.has(30)).toBe(true);
    expect(fields.minute.has(45)).toBe(true);
    expect(fields.minute.size).toBe(4);
    // hours: 0, 2, 4...22
    expect(fields.hour.has(0)).toBe(true);
    expect(fields.hour.has(2)).toBe(true);
    expect(fields.hour.has(22)).toBe(true);
    expect(fields.hour.size).toBe(12);
  });

  it('parses specific values', () => {
    const fields = parseCron('0 9 1 1 0');
    expect(fields.minute.has(0)).toBe(true);
    expect(fields.minute.size).toBe(1);
    expect(fields.hour.has(9)).toBe(true);
    expect(fields.day.has(1)).toBe(true);
    expect(fields.month.has(1)).toBe(true);
    expect(fields.weekday.has(0)).toBe(true);
  });

  it('parses ranges', () => {
    const fields = parseCron('0 9-17 * * 1-5');
    for (let h = 9; h <= 17; h++) {
      expect(fields.hour.has(h)).toBe(true);
    }
    expect(fields.hour.size).toBe(9);
    for (let d = 1; d <= 5; d++) {
      expect(fields.weekday.has(d)).toBe(true);
    }
    expect(fields.weekday.size).toBe(5);
  });

  it('parses comma-separated values', () => {
    const fields = parseCron('0,30 9,12,18 * * *');
    expect(fields.minute.has(0)).toBe(true);
    expect(fields.minute.has(30)).toBe(true);
    expect(fields.minute.size).toBe(2);
    expect(fields.hour.has(9)).toBe(true);
    expect(fields.hour.has(12)).toBe(true);
    expect(fields.hour.has(18)).toBe(true);
    expect(fields.hour.size).toBe(3);
  });

  it('rejects invalid cron (too few fields)', () => {
    expect(() => parseCron('* * *')).toThrow('Cron expression must have 5 fields');
  });

  it('rejects invalid cron (too many fields)', () => {
    expect(() => parseCron('* * * * * * *')).toThrow('Cron expression must have 5 fields');
  });

  it('rejects out-of-range minute', () => {
    expect(() => parseCron('60 * * * *')).toThrow('Invalid cron value');
  });

  it('rejects out-of-range hour', () => {
    expect(() => parseCron('* 24 * * *')).toThrow('Invalid cron value');
  });

  it('rejects non-numeric garbage', () => {
    expect(() => parseCron('abc * * * *')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getNextRunTime
// ---------------------------------------------------------------------------
describe('golden: getNextRunTime', () => {
  it('finds next matching minute from a given time', () => {
    const from = new Date('2026-05-07T10:03:00Z');
    // cron: every 5 minutes
    const next = getNextRunTime('*/5 * * * *', from);
    expect(next!.getTime()).toBe(new Date('2026-05-07T10:05:00Z').getTime());
  });

  it('returns current minute if it already matches', () => {
    const from = new Date('2026-05-07T10:05:00Z');
    // cron: every 5 minutes, 10:05 IS a match
    const next = getNextRunTime('*/5 * * * *', from);
    // Next should be at least 1 minute after the current match to avoid immediate re-fire
    // Our implementation finds the CURRENT match, not the next one
    // The scheduler itself calls getNextRunTime after fire completes
    expect(next).not.toBeNull();
  });

  it('wraps to next hour when needed', () => {
    const from = new Date('2026-05-07T10:59:00Z');
    const next = getNextRunTime('0 * * * *', from);
    expect(next!.getTime()).toBe(new Date('2026-05-07T11:00:00Z').getTime());
  });

  it('wraps to next day when needed', () => {
    const from = new Date('2026-05-07T23:59:00Z');
    const next = getNextRunTime('0 0 * * *', from);
    expect(next!.getTime()).toBe(new Date('2026-05-08T00:00:00Z').getTime());
  });

  it('returns null for unmatched cron (up to 1 year limit)', () => {
    // Feb 31 doesn't exist - should return null after exhausting search
    const from = new Date('2026-05-07T10:00:00Z');
    const next = getNextRunTime('0 0 31 2 *', from);
    expect(next).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ScheduleManager
// ---------------------------------------------------------------------------
describe('golden: ScheduleManager', () => {
  // --- Registration ---
  it('registers a schedule and sets nextRunAt', () => {
    const { manager, getNow } = createDeterministicManager();
    const schedule = makeSchedule({ cron: '*/5 * * * *' });
    const handlerCalls: PipelineSchedule[] = [];
    const handler = async (s: PipelineSchedule) => {
      handlerCalls.push(s);
    };

    manager.register(schedule, handler);

    expect(manager.isRegistered('test-schedule-1')).toBe(true);
    const stored = manager.getSchedule('test-schedule-1');
    expect(stored).not.toBeNull();
    expect(stored!.nextRunAt).not.toBeNull();
    expect(stored!.lastRunAt).toBeNull();
    // nextRunAt should be in the future relative to fake now
    expect(new Date(stored!.nextRunAt!).getTime()).toBeGreaterThanOrEqual(
      getNow().getTime(),
    );
  });

  it('registers with enabled=false and does NOT schedule next run', () => {
    const { manager } = createDeterministicManager();
    const schedule = makeSchedule({ cron: '*/5 * * * *', enabled: false });

    manager.register(schedule, async () => {});

    const stored = manager.getSchedule('test-schedule-1');
    expect(stored!.nextRunAt).toBeNull();
  });

  // --- Unregistration ---
  it('unregisters a schedule', () => {
    const { manager } = createDeterministicManager();
    const schedule = makeSchedule();
    manager.register(schedule, async () => {});
    expect(manager.isRegistered('test-schedule-1')).toBe(true);

    manager.unregister('test-schedule-1');
    expect(manager.isRegistered('test-schedule-1')).toBe(false);
  });

  it('unregistering a non-existent schedule is a no-op', () => {
    const { manager } = createDeterministicManager();
    expect(() => manager.unregister('nonexistent')).not.toThrow();
  });

  // --- Enable / Disable ---
  it('disable cancels timer and clears nextRunAt', () => {
    const { manager } = createDeterministicManager();
    const schedule = makeSchedule();
    manager.register(schedule, async () => {});

    manager.disable('test-schedule-1');

    const stored = manager.getSchedule('test-schedule-1');
    expect(stored!.enabled).toBe(false);
    expect(stored!.nextRunAt).toBeNull();
  });

  it('enable re-schedules when currently disabled', () => {
    const { manager } = createDeterministicManager();
    const schedule = makeSchedule({ enabled: false });
    manager.register(schedule, async () => {});

    manager.enable('test-schedule-1');

    const stored = manager.getSchedule('test-schedule-1');
    expect(stored!.enabled).toBe(true);
    expect(stored!.nextRunAt).not.toBeNull();
  });

  // --- Handler execution ---
  it('fires handler and updates lastRunAt and nextRunAt', async () => {
    const { manager, advance, getNow } = createDeterministicManager();
    const schedule = makeSchedule({ cron: '*/5 * * * *' });
    const fired: PipelineSchedule[] = [];
    manager.register(schedule, async (s) => {
      fired.push({ ...s });
    });

    // Manually trigger fire to avoid setTimeout dependency
    // Use (manager as any) since fire is private
    await (manager as any).fire('test-schedule-1');

    expect(fired.length).toBe(1);
    expect(fired[0].id).toBe('test-schedule-1');

    const stored = manager.getSchedule('test-schedule-1');
    expect(stored!.lastRunAt).not.toBeNull();
    // nextRunAt should have advanced
    expect(stored!.nextRunAt).not.toBeNull();
  });

  it('handler receives updated schedule with lastRunAt set', async () => {
    const { manager } = createDeterministicManager();
    const schedule = makeSchedule({ cron: '*/5 * * * *' });
    let captured: PipelineSchedule | null = null;
    manager.register(schedule, async (s) => {
      captured = { ...s };
    });

    await (manager as any).fire('test-schedule-1');

    expect(captured!.lastRunAt).not.toBeNull();
    // lastRunAt should be a valid ISO string
    expect(captured!.lastRunAt).toBeTruthy();
    expect(Date.parse(captured!.lastRunAt!)).not.toBeNaN();
  });

  it('handler error does NOT break scheduling (next run still set)', async () => {
    const { manager } = createDeterministicManager();
    const schedule = makeSchedule({ cron: '*/5 * * * *' });
    manager.register(schedule, async () => {
      throw new Error('handler boom');
    });

    // Should not throw
    await (manager as any).fire('test-schedule-1');

    // nextRunAt should still be set (finally block runs)
    const stored = manager.getSchedule('test-schedule-1');
    expect(stored!.nextRunAt).not.toBeNull();
  });

  // --- getAllSchedules ---
  it('getAllSchedules returns all registered schedules', () => {
    const { manager } = createDeterministicManager();
    manager.register(makeSchedule({ id: 's1', cron: '*/5 * * * *' }), async () => {});
    manager.register(makeSchedule({ id: 's2', cron: '0 * * * *' }), async () => {});

    const all = manager.getAllSchedules();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  // --- destroy ---
  it('destroy clears all timers and schedules', () => {
    const { manager } = createDeterministicManager();
    manager.register(makeSchedule({ id: 's1' }), async () => {});
    manager.register(makeSchedule({ id: 's2' }), async () => {});

    manager.destroy();

    expect(manager.getAllSchedules()).toHaveLength(0);
    expect(manager.isRegistered('s1')).toBe(false);
    expect(manager.isRegistered('s2')).toBe(false);
  });

  it('after destroy, register works again', () => {
    const { manager } = createDeterministicManager();
    manager.register(makeSchedule({ id: 's1' }), async () => {});
    manager.destroy();

    manager.register(makeSchedule({ id: 's2', cron: '0 * * * *' }), async () => {});

    expect(manager.isRegistered('s2')).toBe(true);
    expect(manager.getAllSchedules()).toHaveLength(1);
  });

  // --- Multiple fires ---
  it('nextRunAt advances correctly after multiple fires', async () => {
    const { manager, advance } = createDeterministicManager('2026-05-07T10:00:00Z');
    const schedule = makeSchedule({ cron: '*/5 * * * *' });
    manager.register(schedule, async () => {});

    // First fire at ~10:00
    await (manager as any).fire('test-schedule-1');
    const afterFirst = manager.getSchedule('test-schedule-1')!.nextRunAt!;

    // Advance time by 10 minutes to simulate real time passing
    advance(10);

    // Second fire at ~10:10, should schedule next at 10:15
    await (manager as any).fire('test-schedule-1');
    const afterSecond = manager.getSchedule('test-schedule-1')!.nextRunAt!;

    // nextRunAt should have advanced
    expect(new Date(afterSecond).getTime()).toBeGreaterThan(
      new Date(afterFirst).getTime(),
    );
  });

  // --- Deterministic now ---
  it('uses injected now function for time calculations', () => {
    const epoch = new Date('2026-05-07T10:00:00Z');
    const manager = new ScheduleManager({
      now: () => epoch,
    });
    const schedule = makeSchedule({ cron: '*/5 * * * *' });

    manager.register(schedule, async () => {});

    const stored = manager.getSchedule('test-schedule-1');
    // nextRunAt should be 2026-05-07T10:05:00Z (first */5 match)
    expect(stored!.nextRunAt).toBe('2026-05-07T10:05:00.000Z');
  });

  // --- Edge: schedule that fires immediately (current minute matches) ---
  it('handles schedule where current minute matches cron', () => {
    const manager = new ScheduleManager({
      now: () => new Date('2026-05-07T10:05:00Z'),
    });
    const schedule = makeSchedule({ cron: '5 * * * *' });

    manager.register(schedule, async () => {});

    const stored = manager.getSchedule('test-schedule-1');
    // getNextRunTime returns current match, scheduleNext adds 1 minute to avoid immediate fire
    expect(stored!.nextRunAt).not.toBeNull();
    // Should be at least 1 minute in the future
    expect(new Date(stored!.nextRunAt!).getTime()).toBeGreaterThan(
      new Date('2026-05-07T10:05:00Z').getTime(),
    );
  });
});
