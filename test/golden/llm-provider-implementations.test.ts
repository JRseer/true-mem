import { describe, expect, it } from 'vitest';
import {
  LocalEmbeddingProvider,
  MockChatProvider,
  MockRerankProvider,
} from '../../src/llm/index.js';
import type {
  EmbeddingProvider,
  ChatProvider,
  RerankProvider,
  LlmAuxiliaryResult,
} from '../../src/llm/index.js';

describe('golden: LLM provider implementations', () => {
  describe('LocalEmbeddingProvider', () => {
    it('produces deterministic Float32Array vector from text', async () => {
      const provider = new LocalEmbeddingProvider({ dimension: 128 });

      const result1 = await provider.embed('Hello world');
      const result2 = await provider.embed('Hello world');

      expect(result1.data).toBeInstanceOf(Float32Array);
      expect(result1.data.length).toBe(128);
      expect(result1.model).toBe('hash-v1');
      expect(result1.isFallback).toBe(false);

      // Deterministic: same input → same output
      expect([...result1.data]).toEqual([...result2.data]);
    });

    it('normalizes vectors to unit length', async () => {
      const provider = new LocalEmbeddingProvider({ dimension: 64 });
      const result = await provider.embed('test');

      let norm = 0;
      for (let i = 0; i < result.data.length; i++) {
        norm += result.data[i]! * result.data[i]!;
      }
      norm = Math.sqrt(norm);

      expect(norm).toBeCloseTo(1, 4);
    });

    it('embeds batches with consistent dimension', async () => {
      const provider = new LocalEmbeddingProvider({ dimension: 64 });
      const result = await provider.embedBatch(['alpha', 'beta', 'gamma']);

      expect(result.data).toHaveLength(3);
      expect(result.data[0]!.length).toBe(64);
    });

    it('satisfies the EmbeddingProvider interface structurally', () => {
      const provider: EmbeddingProvider = new LocalEmbeddingProvider();
      expect(provider.localOnly).toBe(true);
      expect(provider.providerId).toBe('local-hash');
      expect(provider.model).toBe('hash-v1');
      expect(provider.dimension).toBe(384);
    });
  });

  describe('MockChatProvider', () => {
    it('returns the last user message content as a fallback text', async () => {
      const provider = new MockChatProvider();

      const result = await provider.generateText([
        { role: 'system', content: 'You are a memory assistant.' },
        { role: 'user', content: 'Summarize my preference' },
        { role: 'assistant', content: 'The user prefers Bun.' },
      ]);

      expect(result.data).toBe('Summarize my preference');
      expect(result.model).toBe('mock-v1');
      expect(result.isFallback).toBe(true);
    });

    it('satisfies the ChatProvider interface structurally', () => {
      const provider: ChatProvider = new MockChatProvider();
      expect(provider.localOnly).toBe(true);
    });
  });

  describe('MockRerankProvider', () => {
    it('scores documents by Jaccard similarity to query', async () => {
      const provider = new MockRerankProvider();

      const result = await provider.rerank('TypeScript preference', [
        { id: 'doc-1', text: 'I prefer TypeScript over JavaScript' },
        { id: 'doc-2', text: 'The database uses SQLite' },
      ]);

      expect(result.isFallback).toBe(true);
      expect(result.data).toHaveLength(2);
      // doc-1 should score higher (contains TypeScript)
      expect(result.data[0]!.documentId).toBe('doc-1');
      expect(result.data[1]!.documentId).toBe('doc-2');
      expect(result.data[0]!.score).toBeGreaterThan(result.data[1]!.score);
    });

    it('respects topN parameter', async () => {
      const provider = new MockRerankProvider();
      const docs = [
        { id: 'a', text: 'cat dog bird' },
        { id: 'b', text: 'dog bird fish' },
        { id: 'c', text: 'bird fish cat' },
      ];

      const result = await provider.rerank('cat', docs, 2);
      expect(result.data).toHaveLength(2);
    });

    it('satisfies the RerankProvider interface structurally', () => {
      const provider: RerankProvider = new MockRerankProvider();
      expect(provider.localOnly).toBe(true);
    });
  });
});
