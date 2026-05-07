import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Hono } from 'hono';
import type { DerivedIndexSummary, MonitorStatus, UpgradeStateSummary } from '../../shared/types.js';
import { mapMonitorEvent, withViewerDb } from '../db.js';
import { loadConfig } from '../../../config/config.js';
import { getStorageDir } from '../../../config/paths.js';

export const monitorRoute = new Hono();

monitorRoute.get('/status', async (c) => {
  const status = await withViewerDb<MonitorStatus>((db) => {
    const activity = db.get("SELECT COUNT(*) AS count FROM events WHERE timestamp >= datetime('now', '-1 hour')");
    const errors = db.get(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE timestamp >= datetime('now', '-1 hour')
        AND (LOWER(COALESCE(content, '')) LIKE '%error%' OR LOWER(COALESCE(metadata, '')) LIKE '%error%')
    `);
    const sessions = db.get("SELECT COUNT(*) AS count FROM sessions WHERE status = 'active'");
    const memory = db.get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        AVG(strength) AS average_strength,
        SUM(CASE WHEN last_accessed_at IS NULL OR last_accessed_at < datetime('now', '-30 days') THEN 1 ELSE 0 END) AS stale
      FROM memory_units
    `);
    const events = db.all(`
      SELECT id, session_id, hook_type, timestamp, content, tool_name
      FROM events
      ORDER BY timestamp DESC
      LIMIT 20
    `);

    // Derived index summary — fallback to zeros if table doesn't exist
    const derivedIndex = loadDerivedIndexSummary(db);

    const total = numberField(memory?.total);
    return {
      activityRatePerHour: numberField(activity?.count),
      errorRatePerHour: numberField(errors?.count),
      activeSessions: numberField(sessions?.count),
      memoryHealth: {
        activeRatio: total > 0 ? numberField(memory?.active) / total : 0,
        averageStrength: numberField(memory?.average_strength),
        staleCount: numberField(memory?.stale),
      },
      recentEvents: events.map(mapMonitorEvent),
      derivedIndex,
      upgrade: loadUpgradeStatus(),
      generatedAt: new Date().toISOString(),
    };
  });
  return c.json(status);
});

function loadDerivedIndexSummary(db: { all: (sql: string, params?: unknown[]) => Record<string, unknown>[] }): DerivedIndexSummary {
  try {
    const rows = db.all(
      "SELECT status, COUNT(*) AS count FROM derived_index_states GROUP BY status",
    );
    let indexed = 0, failed = 0, stale = 0;
    for (const row of rows) {
      const s = typeof row.status === 'string' ? row.status : '';
      const c = typeof row.count === 'number' ? row.count : 0;
      if (s === 'indexed') indexed = c;
      else if (s === 'failed') failed = c;
      else if (s === 'stale') stale = c;
    }
    const total = indexed + failed + stale;
    return { total, indexed, failed, stale };
  } catch {
    return { total: 0, indexed: 0, failed: 0, stale: 0 };
  }
}

function loadUpgradeStatus(): UpgradeStateSummary {
  try {
    const config = loadConfig();
    const statePath = join(getStorageDir(config.storageLocation), 'upgrade.state.json');
    if (!existsSync(statePath)) return { state: null, updatedAt: '' };
    const raw = JSON.parse(readFileSync(statePath, 'utf-8'));
    const state = typeof raw.state === 'string' ? raw.state : null;
    const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : '';
    return { state, error: raw.error, updatedAt };
  } catch {
    return { state: null, updatedAt: '' };
  }
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
