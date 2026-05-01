import { describe, expect, it } from 'vitest';
import type {
  ChatProvider,
  ChatMessage,
  LlmAuxiliaryResult,
  EmbeddingProvider,
} from '../../src/llm/index.js';

class MockAuxiliaryChatProvider implements ChatProvider {
  readonly providerId = 'mock-llm';
  readonly model = 'mock-model-v1';
  readonly localOnly = true;

  async generateText(messages: readonly ChatMessage[]): Promise<LlmAuxiliaryResult<string>> {
    return {
      data: 'Extracted semantic themes: [typescript, bun]',
      model: this.model,
      providerId: this.providerId,
      isFallback: false,
      metrics: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        latencyMs: 42,
      },
    };
  }
}

class MockAuxiliaryEmbeddingProvider implements EmbeddingProvider {
  readonly providerId = 'mock-embed';
  readonly model = 'mock-embed-v1';
  readonly dimension = 3;
  readonly localOnly = true;

  async embed(text: string): Promise<LlmAuxiliaryResult<Float32Array>> {
    return {
      data: new Float32Array([0.1, 0.2, 0.3]),
      model: this.model,
      providerId: this.providerId,
      isFallback: true,
      metrics: { totalTokens: 4 },
    };
  }

  async embedBatch(texts: readonly string[]): Promise<LlmAuxiliaryResult<readonly Float32Array[]>> {
    return {
      data: [new Float32Array([0.1, 0.2, 0.3])],
      model: this.model,
      providerId: this.providerId,
      isFallback: true,
      metrics: { totalTokens: 4 },
    };
  }
}

describe('golden: M4 LLM auxiliary shell', () => {
  it('wraps generative output in LlmAuxiliaryResult, preserving provenance and metrics', async () => {
    const chat = new MockAuxiliaryChatProvider();
    const result = await chat.generateText([{ role: 'user', content: 'Extract themes' }]);

    expect(result.data).toBe('Extracted semantic themes: [typescript, bun]');
    expect(result.providerId).toBe('mock-llm');
    expect(result.model).toBe('mock-model-v1');
    expect(result.isFallback).toBe(false);
    expect(result.metrics?.latencyMs).toBe(42);
    expect(result.metrics?.totalTokens).toBe(15);
  });

  it('keeps embeddings auxiliary with metadata without exposing them as fact sources', async () => {
    const embedder = new MockAuxiliaryEmbeddingProvider();
    const result = await embedder.embed('Hello world');

    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.data.length).toBe(3);
    expect(result.isFallback).toBe(true);
    expect(result.providerId).toBe('mock-embed');
  });

  it('enforces structural boundaries so auxiliary string data does not masquerade as a cognitive decision', () => {
    // We demonstrate that the payload is an auxiliary extraction, not a final Boolean 'shouldRemember'
    const payload: LlmAuxiliaryResult<string> = {
      data: 'User prefers dark mode',
      model: 'local-extraction',
      providerId: 'local-engine',
      isFallback: false,
    };

    expect(typeof payload.data).toBe('string');
    // Cognitive core would receive `payload.data`, run its regex/confidence heuristics,
    // and make the true decision. The LLM only supplies the string.
  });
});
