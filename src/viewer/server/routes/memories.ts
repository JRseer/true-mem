import { Hono } from 'hono';
import type { MemoryFilters, MemoryPatchRequest, ViewerMemoryClassification, ViewerMemoryStatus } from '../../shared/types.js';
import { mapMemoryRow, withViewerDb } from '../db.js';

const CLASSIFICATIONS = new Set<ViewerMemoryClassification>([
  'constraint',
  'preference',
  'learning',
  'procedural',
  'decision',
  'semantic',
  'episodic',
  'pattern',
]);
const STATUSES = new Set<ViewerMemoryStatus>(['active', 'decayed', 'deleted', 'established', 'noise']);

export const memoriesRoute = new Hono();

memoriesRoute.get('/', async (c) => {
  const filters = parseFilters(c.req.query());
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const where = buildWhere(filters);

  const result = await withViewerDb((db) => {
    const totalRow = db.get(`SELECT COUNT(*) AS count FROM memory_units ${where.sql}`, where.params);
    const rows = db.all(
      `SELECT * FROM memory_units ${where.sql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...where.params, pageSize, offset],
    );
    const projectRows = db.all(
      `SELECT DISTINCT project_scope FROM memory_units WHERE project_scope IS NOT NULL AND project_scope != '' ORDER BY project_scope`,
    );
    const total = typeof totalRow?.count === 'number' ? totalRow.count : 0;
    const projects = projectRows
      .map((row) => row.project_scope)
      .filter((project): project is string => typeof project === 'string');

    return {
      items: rows.map(mapMemoryRow),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      projects,
    };
  });

  return c.json(result);
});

memoriesRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const memory = await withViewerDb((db) => {
    const row = db.get('SELECT * FROM memory_units WHERE id = ?', [id]);
    return row ? mapMemoryRow(row) : null;
  });
  if (!memory) return c.json({ error: 'Memory not found' }, 404);
  return c.json(memory);
});

memoriesRoute.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body: unknown = await c.req.json();
  if (!isPatchRequest(body)) {
    return c.json({ error: 'Invalid memory patch request' }, 400);
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(body.status);
  }
  if (body.classification !== undefined) {
    updates.push('classification = ?');
    params.push(body.classification);
  }
  if (updates.length === 0) {
    return c.json({ error: 'No supported fields provided' }, 400);
  }

  params.push(new Date().toISOString(), id);
  const result = await withViewerDb((db) => db.run(
    `UPDATE memory_units SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`,
    params,
  ));

  if (result.changes === 0) return c.json({ error: 'Memory not found' }, 404);
  return c.json({ ok: true });
});

function parseFilters(query: Record<string, string>): MemoryFilters {
  return {
    store: query.store === 'stm' || query.store === 'ltm' ? query.store : 'all',
    classification: CLASSIFICATIONS.has(query.classification as ViewerMemoryClassification)
      ? (query.classification as ViewerMemoryClassification)
      : 'all',
    status: STATUSES.has(query.status as ViewerMemoryStatus) ? (query.status as ViewerMemoryStatus) : 'active',
    project: query.project ?? '',
    minStrength: boundedNumber(query.minStrength, 0, 1),
    search: query.search ?? '',
    page: boundedInteger(query.page, 1, 10_000) ?? 1,
    pageSize: boundedInteger(query.pageSize, 1, 100) ?? 20,
  };
}

function buildWhere(filters: MemoryFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.store && filters.store !== 'all') {
    clauses.push('store = ?');
    params.push(filters.store);
  }
  if (filters.classification && filters.classification !== 'all') {
    clauses.push('classification = ?');
    params.push(filters.classification);
  }
  if (filters.status && filters.status !== 'all') {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.project && filters.project.trim().length > 0) {
    clauses.push('project_scope = ?');
    params.push(filters.project.trim());
  }
  if (filters.minStrength !== undefined) {
    clauses.push('strength >= ?');
    params.push(filters.minStrength);
  }
  if (filters.search && filters.search.trim().length > 0) {
    clauses.push("summary LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(filters.search.trim())}%`);
  }
  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function boundedInteger(value: string | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function boundedNumber(value: string | undefined, min: number, max: number): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function isPatchRequest(value: unknown): value is MemoryPatchRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof MemoryPatchRequest, unknown>>;
  const statusOk = candidate.status === undefined || STATUSES.has(candidate.status as ViewerMemoryStatus);
  const classificationOk = candidate.classification === undefined
    || CLASSIFICATIONS.has(candidate.classification as ViewerMemoryClassification);
  return statusOk && classificationOk;
}
