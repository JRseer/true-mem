import { Hono } from 'hono';
import type { StatsOverview, TrendItem } from '../../shared/types.js';
import { mapDistributionRows, withViewerDb } from '../db.js';

export const statsRoute = new Hono();

statsRoute.get('/overview', async (c) => {
  const stats = await withViewerDb<StatsOverview>((db) => {
    const totals = db.get(`
      SELECT
        COUNT(*) AS memories,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted,
        SUM(CASE WHEN status = 'decayed' THEN 1 ELSE 0 END) AS decayed
      FROM memory_units
    `);
    const sessions = db.get('SELECT COUNT(*) AS count FROM sessions');
    const events = db.get('SELECT COUNT(*) AS count FROM events');
    const strength = db.get(`
      SELECT
        AVG(strength) AS average_strength,
        MIN(strength) AS min_strength,
        MAX(strength) AS max_strength,
        AVG(CASE WHEN status = 'active' THEN strength END) AS active_average_strength
      FROM memory_units
    `);
    const trendRows = db.all(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
      FROM memory_units
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date
    `);

    return {
      totals: {
        memories: numberField(totals?.memories),
        active: numberField(totals?.active),
        deleted: numberField(totals?.deleted),
        decayed: numberField(totals?.decayed),
        sessions: numberField(sessions?.count),
        events: numberField(events?.count),
      },
      storeDistribution: mapDistributionRows(groupBy(db, { column: 'store', alias: 'store' }), 'store'),
      classificationDistribution: mapDistributionRows(groupBy(db, { column: 'classification', alias: 'classification' }), 'classification'),
      statusDistribution: mapDistributionRows(groupBy(db, { column: 'status', alias: 'status' }), 'status'),
      projectDistribution: mapDistributionRows(groupBy(db, { column: 'project_scope', alias: 'project_scope' }), 'project_scope'),
      creationTrend: trendRows.map((row): TrendItem => ({
        date: typeof row.date === 'string' ? row.date : '',
        count: numberField(row.count),
      })),
      strength: {
        average: numberField(strength?.average_strength),
        min: numberField(strength?.min_strength),
        max: numberField(strength?.max_strength),
        activeAverage: numberField(strength?.active_average_strength),
      },
      generatedAt: new Date().toISOString(),
    };
  });
  return c.json(stats);
});

function groupBy(db: Parameters<Parameters<typeof withViewerDb>[0]>[0], field: { column: 'store' | 'classification' | 'status' | 'project_scope'; alias: string }) {
  return db.all(`
    SELECT COALESCE(${field.column}, 'unknown') AS ${field.alias}, COUNT(*) AS count
    FROM memory_units
    GROUP BY COALESCE(${field.column}, 'unknown')
    ORDER BY count DESC
    LIMIT 12
  `);
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
