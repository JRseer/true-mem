import { existsSync } from 'fs';
import { createDatabase, type SqliteDatabase } from '../../storage/sqlite-adapter.js';
import { getDatabasePath } from '../../config/paths.js';
import { loadConfig } from '../../config/config.js';
import type {
  DistributionItem,
  MonitorEvent,
  ViewerMemory,
  ViewerMemoryClassification,
  ViewerMemoryStatus,
  ViewerMemoryStore,
} from '../shared/types.js';

type Row = Record<string, unknown>;

export class ViewerDatabase {
  private constructor(private readonly db: SqliteDatabase) {}

  static async open(): Promise<ViewerDatabase> {
    const config = loadConfig();
    const dbPath = getDatabasePath(config.storageLocation);
    if (!existsSync(dbPath)) {
      throw new ViewerDatabaseUnavailableError(`trueMem database not found at ${dbPath}`);
    }
    const db = await createDatabase(dbPath);
    const viewerDb = new ViewerDatabase(db);
    if (!viewerDb.hasRequiredTables()) {
      viewerDb.close();
      throw new ViewerDatabaseUnavailableError('trueMem database is missing required viewer tables');
    }
    return viewerDb;
  }

  static currentDatabasePath(): string {
    return getDatabasePath(loadConfig().storageLocation);
  }

  static exists(): boolean {
    return existsSync(ViewerDatabase.currentDatabasePath());
  }

  all(sql: string, params: unknown[] = []): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  get(sql: string, params: unknown[] = []): Row | undefined {
    const result = this.db.prepare(sql).get(...params);
    return isRow(result) ? result : undefined;
  }

  run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
    return this.db.prepare(sql).run(...params);
  }

  close(): void {
    this.db.close();
  }

  private hasRequiredTables(): boolean {
    const rows = this.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('memory_units', 'sessions', 'events')",
    );
    const tableNames = new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === 'string'));
    return tableNames.has('memory_units') && tableNames.has('sessions') && tableNames.has('events');
  }
}

export class ViewerDatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ViewerDatabaseUnavailableError';
  }
}

export async function withViewerDb<T>(fn: (db: ViewerDatabase) => T): Promise<T> {
  const db = await ViewerDatabase.open();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function mapMemoryRow(row: Row): ViewerMemory {
  return {
    id: stringValue(row.id),
    sessionId: nullableString(row.session_id),
    store: memoryStore(row.store),
    classification: memoryClassification(row.classification),
    summary: stringValue(row.summary),
    sourceEventIds: jsonStringArray(row.source_event_ids),
    projectScope: nullableString(row.project_scope),
    taskScope: nullableString(row.task_scope),
    expiresAt: nullableString(row.expires_at),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
    lastAccessedAt: nullableString(row.last_accessed_at),
    recency: numberValue(row.recency),
    frequency: integerValue(row.frequency),
    importance: numberValue(row.importance),
    utility: numberValue(row.utility),
    novelty: numberValue(row.novelty),
    confidence: numberValue(row.confidence),
    interference: numberValue(row.interference),
    strength: numberValue(row.strength),
    decayRate: numberValue(row.decay_rate),
    tags: jsonStringArray(row.tags),
    associations: jsonStringArray(row.associations),
    status: memoryStatus(row.status),
    version: integerValue(row.version),
  };
}

export function mapDistributionRows(rows: Row[], labelKey: string): DistributionItem[] {
  return rows.map((row) => ({
    label: stringValue(row[labelKey], 'unknown'),
    count: integerValue(row.count),
  }));
}

export function mapMonitorEvent(row: Row): MonitorEvent {
  return {
    id: stringValue(row.id),
    sessionId: nullableString(row.session_id),
    hookType: stringValue(row.hook_type, 'unknown'),
    timestamp: stringValue(row.timestamp),
    toolName: nullableString(row.tool_name),
    summary: eventSummary(row),
  };
}

function eventSummary(row: Row): string {
  const content = nullableString(row.content);
  if (content && content.trim().length > 0) return content.trim().slice(0, 180);
  const toolName = nullableString(row.tool_name);
  if (toolName) return `Tool executed: ${toolName}`;
  return stringValue(row.hook_type, 'Event');
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function integerValue(value: unknown): number {
  return Math.trunc(numberValue(value));
}

function jsonStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function memoryStore(value: unknown): ViewerMemoryStore {
  return value === 'stm' || value === 'ltm' ? value : 'ltm';
}

function memoryClassification(value: unknown): ViewerMemoryClassification {
  switch (value) {
    case 'constraint':
    case 'preference':
    case 'learning':
    case 'procedural':
    case 'decision':
    case 'semantic':
    case 'episodic':
    case 'pattern':
      return value;
    default:
      return 'semantic';
  }
}

function memoryStatus(value: unknown): ViewerMemoryStatus {
  switch (value) {
    case 'active':
    case 'decayed':
    case 'deleted':
    case 'established':
    case 'noise':
      return value;
    default:
      return 'active';
  }
}
