/**
 * Retrieval degradation metadata.
 *
 * This is observability for fallback behavior. It does not wrap or modify memory results,
 * and it must not affect salience, classification, or SQLite fact semantics.
 */

export type RetrievalMode = 'normal' | 'degraded';

export type RetrievalFallback =
  | 'sqlite_metadata'
  | 'sqlite_keyword'
  | 'strength_ordered';

export type RetrievalDegradationReason =
  | 'vector_index_unavailable'
  | 'vector_index_failed'
  | 'vector_index_stale'
  | 'embedding_provider_unavailable';

export interface NormalRetrievalMetadata {
  readonly mode: 'normal';
  readonly source: 'vector_index' | 'sqlite';
  readonly generatedAt: Date;
}

export interface DegradedRetrievalMetadata {
  readonly mode: 'degraded';
  readonly reason: RetrievalDegradationReason;
  readonly fallback: RetrievalFallback;
  readonly generatedAt: Date;
  readonly providerId?: string | undefined;
  readonly detail?: string | undefined;
}

export type RetrievalMetadata = NormalRetrievalMetadata | DegradedRetrievalMetadata;

export interface CreateDegradedRetrievalMetadataInput {
  readonly reason: RetrievalDegradationReason;
  readonly fallback: RetrievalFallback;
  readonly generatedAt: Date;
  readonly providerId?: string | undefined;
  readonly detail?: string | undefined;
}

export function createNormalRetrievalMetadata(
  source: NormalRetrievalMetadata['source'],
  generatedAt: Date
): NormalRetrievalMetadata {
  return {
    mode: 'normal',
    source,
    generatedAt,
  };
}

export function createDegradedRetrievalMetadata(
  input: CreateDegradedRetrievalMetadataInput
): DegradedRetrievalMetadata {
  return {
    mode: 'degraded',
    reason: input.reason,
    fallback: input.fallback,
    generatedAt: input.generatedAt,
    providerId: input.providerId,
    detail: input.detail,
  };
}

export function isRetrievalDegraded(metadata: RetrievalMetadata): metadata is DegradedRetrievalMetadata {
  return metadata.mode === 'degraded';
}

export function formatRetrievalMetadata(metadata: RetrievalMetadata): string {
  if (!isRetrievalDegraded(metadata)) {
    return `retrieval:${metadata.mode}:${metadata.source}`;
  }

  const provider = metadata.providerId ? `:${metadata.providerId}` : '';
  return `retrieval:${metadata.mode}:${metadata.reason}:${metadata.fallback}${provider}`;
}
