import type { DerivedIndexIdentity } from './index-status.js';
import type { DegradedRetrievalMetadata } from './retrieval-state.js';
import { createDegradedRetrievalMetadata } from './retrieval-state.js';

export interface VectorIndexProviderCapabilities {
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;
  readonly localOnly: boolean;
  readonly supportsUpsert: boolean;
  readonly supportsDelete: boolean;
  readonly supportsSimilaritySearch: boolean;
}

export interface VectorIndexRecord extends DerivedIndexIdentity {
  readonly vector: readonly number[];
  readonly scopeKeys: readonly string[];
  readonly createdAt: Date;
}

export interface VectorIndexQuery {
  readonly vector: readonly number[];
  readonly scopeKeys?: readonly string[] | undefined;
  readonly limit: number;
}

export interface VectorIndexSearchHit {
  readonly memoryId: string;
  readonly memoryVersion: number;
  readonly score: number;
}

export interface VectorIndexSearchResult {
  readonly hits: readonly VectorIndexSearchHit[];
  readonly degraded?: DegradedRetrievalMetadata | undefined;
}

export interface VectorIndexProvider {
  readonly capabilities: VectorIndexProviderCapabilities;
  upsert(record: VectorIndexRecord): Promise<void>;
  delete(identity: DerivedIndexIdentity): Promise<void>;
  search(query: VectorIndexQuery): Promise<VectorIndexSearchResult>;
}

export class UnavailableVectorIndexProvider implements VectorIndexProvider {
  readonly capabilities: VectorIndexProviderCapabilities;
  private readonly reason: string;

  constructor(capabilities: VectorIndexProviderCapabilities, reason: string) {
    this.capabilities = capabilities;
    this.reason = reason;
  }

  async upsert(_record: VectorIndexRecord): Promise<void> {
    throw new Error(this.reason);
  }

  async delete(_identity: DerivedIndexIdentity): Promise<void> {
    throw new Error(this.reason);
  }

  async search(_query: VectorIndexQuery): Promise<VectorIndexSearchResult> {
    return {
      hits: [],
      degraded: createDegradedRetrievalMetadata({
        reason: 'vector_index_unavailable',
        fallback: 'sqlite_keyword',
        generatedAt: new Date(0),
        providerId: this.capabilities.providerId,
        detail: this.reason,
      }),
    };
  }
}

export function createUnavailableVectorIndexProvider(
  capabilities: VectorIndexProviderCapabilities,
  reason: string
): VectorIndexProvider {
  return new UnavailableVectorIndexProvider(capabilities, reason);
}

export function validateVectorIndexRecord(record: VectorIndexRecord): void {
  if (record.vector.length !== record.dimension) {
    throw new Error(`Vector dimension mismatch: expected ${record.dimension}, got ${record.vector.length}`);
  }
}
