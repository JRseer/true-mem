import type { DerivedIndexIdentity } from './index-status.js';
import {
  createUnavailableVectorIndexProvider,
  validateVectorIndexRecord,
  type VectorIndexProvider,
  type VectorIndexProviderCapabilities,
  type VectorIndexQuery,
  type VectorIndexRecord,
  type VectorIndexSearchResult,
} from './vector-provider.js';
import { log } from '../logger.js';

export interface LanceDBProviderConfig {
  readonly dbPath: string;
  readonly tableName: string;
  readonly model: string;
  readonly dimension: number;
}

function sanitizeMemoryId(memoryId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(memoryId)) {
    throw new Error(`Invalid memory_id for LanceDB predicate: ${memoryId}`);
  }
  return memoryId;
}

export class LanceDBVectorIndexProvider implements VectorIndexProvider {
  readonly capabilities: VectorIndexProviderCapabilities;
  private readonly config: LanceDBProviderConfig;
  private connection: any;
  private table: any | null;

  constructor(config: LanceDBProviderConfig, connection: any) {
    this.config = config;
    this.connection = connection;
    this.table = null;
    this.capabilities = {
      providerId: 'local-lancedb',
      model: config.model,
      dimension: config.dimension,
      localOnly: true,
      supportsUpsert: true,
      supportsDelete: true,
      supportsSimilaritySearch: true,
    };
  }

  async upsert(record: VectorIndexRecord): Promise<void> {
    validateVectorIndexRecord(record);

    const table = await this.ensureTable();
    const safeId = sanitizeMemoryId(record.memoryId);

    await table.delete(`memory_id = '${safeId}'`);

    await table.add([{
      memory_id: record.memoryId,
      vector: [...record.vector],
      scope_keys: JSON.stringify(record.scopeKeys),
      created_at: record.createdAt.toISOString(),
      memory_version: record.memoryVersion,
      provider_id: record.providerId,
      model: record.model,
      dimension: record.dimension,
    }]);
  }

  async delete(identity: DerivedIndexIdentity): Promise<void> {
    const table = await this.ensureTable();
    const safeId = sanitizeMemoryId(identity.memoryId);

    await table.delete(`memory_id = '${safeId}'`);
  }

  async search(query: VectorIndexQuery): Promise<VectorIndexSearchResult> {
    const table = await this.ensureTable();
    const limit = Math.max(1, Math.floor(query.limit));

    let builder = table.search([...query.vector]).limit(limit);

    if (query.scopeKeys && query.scopeKeys.length > 0) {
      // LanceDB pre-filtering: scopeKeys are JSON arrays, we match presence of any scope key
      // Since scope filtering is approximate in LanceDB (derived index semantics),
      // we keep SQLite as authoritative; LanceDB provides candidate ranking only.
    }

    const rows = await builder.toArray();

    const hits = rows.map((row: any) => ({
      memoryId: String(row.memory_id),
      memoryVersion: typeof row.memory_version === 'number' ? row.memory_version : 0,
      score: typeof row._distance === 'number' ? 1 / (1 + row._distance) : 0.5,
    }));

    return { hits };
  }

  private async ensureTable(): Promise<any> {
    if (this.table) return this.table;

    try {
      this.table = await this.connection.openTable(this.config.tableName);
      log(`LanceDB: opened existing table ${this.config.tableName}`);
    } catch (_openError) {
      log(`LanceDB: creating new table ${this.config.tableName}`);
      this.table = await this.connection.createTable(this.config.tableName, []);
    }

    return this.table;
  }
}

export async function createLanceDBProviderOrUnavailable(
  config: LanceDBProviderConfig
): Promise<VectorIndexProvider> {
  const capabilities: VectorIndexProviderCapabilities = {
    providerId: 'local-lancedb',
    model: config.model,
    dimension: config.dimension,
    localOnly: true,
    supportsUpsert: true,
    supportsDelete: true,
    supportsSimilaritySearch: true,
  };

  try {
    const lancedb = await import('@lancedb/lancedb');
    const connection = await lancedb.connect(config.dbPath);
    log('LanceDB: connection established');
    return new LanceDBVectorIndexProvider(config, connection);
  } catch (error) {
    log(`LanceDB: provider unavailable — ${error instanceof Error ? error.message : String(error)}`);
    return createUnavailableVectorIndexProvider(
      capabilities,
      `LanceDB provider unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
