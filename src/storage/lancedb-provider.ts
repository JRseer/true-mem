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

export interface LanceDBProviderConfig {
  readonly dbPath: string;
  readonly tableName: string;
  readonly model: string;
  readonly dimension: number;
}

export class LanceDBVectorIndexProvider implements VectorIndexProvider {
  readonly capabilities: VectorIndexProviderCapabilities;
  private readonly config: LanceDBProviderConfig;
  private readonly connection: unknown; // Opaque to avoid strong type dependency

  constructor(config: LanceDBProviderConfig, connection: unknown) {
    this.config = config;
    this.connection = connection;
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
    throw new Error('Not implemented: LanceDB adapter shell');
  }

  async delete(_identity: DerivedIndexIdentity): Promise<void> {
    throw new Error('Not implemented: LanceDB adapter shell');
  }

  async search(_query: VectorIndexQuery): Promise<VectorIndexSearchResult> {
    throw new Error('Not implemented: LanceDB adapter shell');
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
    // We only try to connect if the library is successfully imported.
    // If the library is missing, this try block throws.
    const connection = await lancedb.connect(config.dbPath);
    return new LanceDBVectorIndexProvider(config, connection);
  } catch (error) {
    return createUnavailableVectorIndexProvider(
      capabilities,
      `LanceDB provider unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
