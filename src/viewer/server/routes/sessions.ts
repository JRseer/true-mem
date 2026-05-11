import { Hono } from 'hono';
import { withViewerDb } from '../db.js';

export const sessionsRoute = new Hono();

// GET /api/sessions - List all sessions with pagination
sessionsRoute.get('/', async (c) => {
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10);
  const project = c.req.query('project') ?? '';
  const status = c.req.query('status') ?? '';

  const offset = (page - 1) * pageSize;

  const result = await withViewerDb((db) => {
    // Build WHERE clause
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (project && project.trim().length > 0) {
      whereClauses.push('s.project = ?');
      params.push(project.trim());
    }

    if (status && status.trim().length > 0) {
      whereClauses.push('s.status = ?');
      params.push(status.trim());
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Check if memory_injections table exists
    const tableCheck = db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_injections'"
    );
    const hasInjectionsTable = !!tableCheck;

    // Get total count
    const totalRow = db.get(`SELECT COUNT(*) AS count FROM sessions s ${whereClause}`, params);
    const total = typeof totalRow?.count === 'number' ? totalRow.count : 0;

    // Get sessions with memory and injection counts
    let rows;
    if (hasInjectionsTable) {
      rows = db.all(
        `
        SELECT 
          s.id,
          s.project,
          s.started_at as startedAt,
          s.ended_at as endedAt,
          s.status,
          COUNT(DISTINCT mu.id) as memoryCount,
          COUNT(DISTINCT mi.id) as injectionCount
        FROM sessions s
        LEFT JOIN memory_units mu ON s.id = mu.session_id
        LEFT JOIN memory_injections mi ON s.id = mi.session_id
        ${whereClause}
        GROUP BY s.id
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      );
    } else {
      // Fallback query without memory_injections table
      rows = db.all(
        `
        SELECT 
          s.id,
          s.project,
          s.started_at as startedAt,
          s.ended_at as endedAt,
          s.status,
          COUNT(DISTINCT mu.id) as memoryCount,
          0 as injectionCount
        FROM sessions s
        LEFT JOIN memory_units mu ON s.id = mu.session_id
        ${whereClause}
        GROUP BY s.id
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      );
    }

    return {
      items: rows.map((row: any) => ({
        id: row.id,
        project: row.project,
        startedAt: row.startedAt,
        endedAt: row.endedAt ?? null,
        status: row.status,
        memoryCount: row.memoryCount ?? 0,
        injectionCount: row.injectionCount ?? 0,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

  return c.json(result);
});

// GET /api/sessions/:id - Get session details
sessionsRoute.get('/:id', async (c) => {
  const sessionId = c.req.param('id');

  const session = await withViewerDb((db) => {
    const row = db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (!row) return null;

    return {
      id: row.id,
      project: row.project,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    };
  });

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json(session);
});

// GET /api/sessions/:id/injections - Get memory injections for a session
sessionsRoute.get('/:id/injections', async (c) => {
  const sessionId = c.req.param('id');

  const result = await withViewerDb((db) => {
    // Check if memory_injections table exists
    const tableCheck = db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_injections'"
    );
    
    if (!tableCheck) {
      // Table doesn't exist yet, return empty result
      return {
        sessionId,
        injections: [],
        total: 0,
      };
    }

    const rows = db.all(
      `
      SELECT 
        mi.id,
        mi.memory_id as memoryId,
        mu.summary as memorySummary,
        mu.classification,
        mu.store,
        mi.injected_at as injectedAt,
        mi.relevance_score as relevanceScore,
        mi.injection_context as injectionContext
      FROM memory_injections mi
      JOIN memory_units mu ON mi.memory_id = mu.id
      WHERE mi.session_id = ?
      ORDER BY mi.injected_at ASC
      `,
      [sessionId]
    );

    return {
      sessionId,
      injections: rows.map((row: any) => ({
        id: row.id,
        memoryId: row.memoryId,
        memorySummary: row.memorySummary,
        classification: row.classification,
        store: row.store,
        injectedAt: row.injectedAt,
        relevanceScore: row.relevanceScore,
        injectionContext: row.injectionContext,
      })),
      total: rows.length,
    };
  });

  return c.json(result);
});
