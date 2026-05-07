import { Hono } from 'hono';
import type { EmbeddingStatus } from '../../shared/types.js';
import { EmbeddingService } from '../../../memory/embeddings-nlp.js';

export const embeddingsRoute = new Hono();

embeddingsRoute.get('/status', (c) => {
  const svc = EmbeddingService.getInstance();
  const s = svc.getStatus();
  const status: EmbeddingStatus = {
    enabled: s.enabled,
    ready: s.ready,
    failureCount: s.failureCount,
    circuitBreakerActive: s.circuitBreakerActive,
    generatedAt: new Date().toISOString(),
  };
  return c.json(status);
});
