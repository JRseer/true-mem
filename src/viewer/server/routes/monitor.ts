import { Hono } from 'hono';
import type { MonitorStatus } from '../../shared/types.js';
import { mapMonitorEvent, withViewerDb } from '../db.js';

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
      generatedAt: new Date().toISOString(),
    };
  });
  return c.json(status);
});

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
