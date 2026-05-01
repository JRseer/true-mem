import type {
  ChatMessage,
  ChatProvider,
  EmbeddingProvider,
  LlmAuxiliaryResult,
  RerankDocument,
  RerankProvider,
  RerankResult,
} from './provider.js';

// ── Local Embedding Provider ────────────────────────────────────────────

export interface LocalEmbeddingProviderConfig {
  readonly providerId?: string | undefined;
  readonly model?: string | undefined;
  readonly dimension?: number | undefined;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;
  readonly localOnly: boolean = true;

  constructor(config: LocalEmbeddingProviderConfig = {}) {
    this.providerId = config.providerId ?? 'local-hash';
    this.model = config.model ?? 'hash-v1';
    this.dimension = config.dimension ?? 384;
  }

  async embed(text: string): Promise<LlmAuxiliaryResult<Float32Array>> {
    const vector = hashEmbed(text, this.dimension);
    return {
      data: vector,
      model: this.model,
      providerId: this.providerId,
      isFallback: false,
    };
  }

  async embedBatch(texts: readonly string[]): Promise<LlmAuxiliaryResult<readonly Float32Array[]>> {
    const vectors = texts.map(text => hashEmbed(text, this.dimension));
    return {
      data: vectors,
      model: this.model,
      providerId: this.providerId,
      isFallback: false,
    };
  }
}

// ── Mock Chat Provider ────────────────────────────────────────────────

export interface MockChatProviderConfig {
  readonly providerId?: string | undefined;
  readonly model?: string | undefined;
}

export class MockChatProvider implements ChatProvider {
  readonly providerId: string;
  readonly model: string;
  readonly localOnly: boolean = true;

  constructor(config: MockChatProviderConfig = {}) {
    this.providerId = config.providerId ?? 'local-mock-chat';
    this.model = config.model ?? 'mock-v1';
  }

  async generateText(messages: readonly ChatMessage[]): Promise<LlmAuxiliaryResult<string>> {
    // Deterministic mock: returns the last user message content as-is.
    // Cognitive layers consume this text but do not let it override deterministic decisions.
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    const text = lastUserMessage?.content ?? '(no user message)';

    return {
      data: text,
      model: this.model,
      providerId: this.providerId,
      isFallback: true, // Always marked as fallback since this is a deterministic mock
    };
  }
}

// ── Mock Rerank Provider ──────────────────────────────────────────────

export interface MockRerankProviderConfig {
  readonly providerId?: string | undefined;
  readonly model?: string | undefined;
}

export class MockRerankProvider implements RerankProvider {
  readonly providerId: string;
  readonly model: string;
  readonly localOnly: boolean = true;

  constructor(config: MockRerankProviderConfig = {}) {
    this.providerId = config.providerId ?? 'local-mock-rerank';
    this.model = config.model ?? 'jaccard-v1';
  }

  async rerank(
    query: string,
    documents: readonly RerankDocument[],
    topN?: number
  ): Promise<LlmAuxiliaryResult<readonly RerankResult[]>> {
    const scored = documents.map(doc => ({
      documentId: doc.id,
      score: jaccardScore(query, doc.text),
    }));

    scored.sort((a, b) => b.score - a.score);
    const data = topN !== undefined ? scored.slice(0, topN) : scored;

    return {
      data,
      model: this.model,
      providerId: this.providerId,
      isFallback: true, // Jaccard-based reranking is a fallback heuristic
    };
  }
}

// ── Shared Utilities ──────────────────────────────────────────────────

function hashEmbed(text: string, dimension: number): Float32Array {
  const vector = new Float32Array(dimension);
  const chars = text.normalize('NFC');

  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    for (let dim = 0; dim < dimension; dim++) {
      const idx = ((code * (dim + 1) + i * 31 + dim * 17) % dimension + dimension) % dimension;
      vector[idx] = (vector[idx]!) + 0.01;
    }
  }

  // Normalize to unit length
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += (vector[i]!) * (vector[i]!);
  }
  norm = Math.sqrt(norm) || 1;

  for (let i = 0; i < dimension; i++) {
    vector[i] = (vector[i]!) / norm;
  }

  return vector;
}

function jaccardScore(query: string, document: string): number {
  const tokenize = (text: string): Set<string> => {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0);
    return new Set(words);
  };

  const set1 = tokenize(query);
  const set2 = tokenize(document);

  if (set1.size === 0 || set2.size === 0) {
    return 0;
  }

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}
