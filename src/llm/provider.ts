/**
 * M4 LLM Auxiliary Shell Types
 *
 * Enforces that all LLM interactions (embedding, chat, rerank) are strictly auxiliary.
 * LLMs must not make deterministic cognitive decisions (e.g., shouldRemember, salience, decay).
 * Their output is always wrapped in an LlmAuxiliaryResult to track provenance, metrics, and fallback status.
 */

export interface LlmUsageMetrics {
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
  readonly latencyMs?: number | undefined;
}

/**
 * Constraint type: Ensures LLM outputs cannot masquerade as deterministic cognitive decisions.
 * Booleans (like shouldRemember) and raw cognitive state transitions are disallowed.
 */
export type LlmAuxiliaryType =
  | string
  | Float32Array
  | readonly Float32Array[]
  | readonly RerankResult[]
  | Record<string, string | number | boolean | null>;

export interface LlmAuxiliaryResult<T extends LlmAuxiliaryType> {
  /** The generated or extracted data (summary, embeddings, scores) */
  readonly data: T;
  readonly model: string;
  readonly providerId: string;
  readonly isFallback: boolean;
  readonly metrics?: LlmUsageMetrics | undefined;
}

export interface EmbeddingProvider {
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;
  readonly localOnly: boolean;

  embed(text: string): Promise<LlmAuxiliaryResult<Float32Array>>;
  embedBatch(texts: readonly string[]): Promise<LlmAuxiliaryResult<readonly Float32Array[]>>;
}

export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  readonly role: ChatMessageRole;
  readonly content: string;
}

export interface ChatProvider {
  readonly providerId: string;
  readonly model: string;
  readonly localOnly: boolean;

  /**
   * Generates text to propose summaries or extract themes.
   * Cognitive layers consume this text but do not let it override deterministic decisions.
   */
  generateText(messages: readonly ChatMessage[]): Promise<LlmAuxiliaryResult<string>>;
}

export interface RerankDocument {
  readonly id: string;
  readonly text: string;
}

export interface RerankResult {
  readonly documentId: string;
  readonly score: number;
}

export interface RerankProvider {
  readonly providerId: string;
  readonly model: string;
  readonly localOnly: boolean;

  /**
   * Reranks retrieved documents based on query relevance.
   * Does not filter out documents—only reorders them for the cognitive layer to process.
   */
  rerank(
    query: string,
    documents: readonly RerankDocument[],
    topN?: number
  ): Promise<LlmAuxiliaryResult<readonly RerankResult[]>>;
}
