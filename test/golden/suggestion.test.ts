import { describe, it, expect } from 'vitest';
import { SuggestionQueue, createSuggestion } from '../../src/pipeline/suggestion';
import type { Suggestion } from '../../src/pipeline/suggestion';

function future(ms: number): Date {
  return new Date(Date.now() + ms);
}

describe('SuggestionQueue', () => {
  it('should enqueue a suggestion', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    const s = q.enqueue({
      type: 'suggestion',
      priority: 0.8,
      summary: 'Test suggestion',
      detail: 'Some detail',
      confidence: 0.7,
      sourcePatternIds: ['p1'],
    });
    expect(s).not.toBeNull();
    expect(s!.status).toBe('pending');
    expect(q.size()).toBe(1);
  });

  it('should respect maxSize', () => {
    const q = new SuggestionQueue({ maxSize: 2 });
    expect(q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'a', detail: '', confidence: 0.5, sourcePatternIds: [] })).not.toBeNull();
    expect(q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'b', detail: '', confidence: 0.5, sourcePatternIds: [] })).not.toBeNull();
    const s3 = q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'c', detail: '', confidence: 0.5, sourcePatternIds: [] });
    expect(s3).toBeNull();
    expect(q.size()).toBe(2);
  });

  it('should dequeue by priority order', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    q.enqueue({ type: 'suggestion', priority: 0.3, summary: 'low', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.enqueue({ type: 'suggestion', priority: 0.9, summary: 'high', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.enqueue({ type: 'suggestion', priority: 0.6, summary: 'mid', detail: '', confidence: 0.5, sourcePatternIds: [] });

    const dequeued = q.dequeue(2);
    expect(dequeued).toHaveLength(2);
    expect(dequeued[0].summary).toBe('high');
    expect(dequeued[1].summary).toBe('mid');
    expect(dequeued[0].status).toBe('injected');
  });

  it('should mark suggestion as acted_on', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    const s = q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'x', detail: '', confidence: 0.5, sourcePatternIds: [] });
    expect(s).not.toBeNull();
    q.markActedOn(s!.id);
    expect(s!.status).toBe('acted_on');
  });

  it('should mark suggestion as ignored', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    const s = q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'x', detail: '', confidence: 0.5, sourcePatternIds: [] });
    expect(s).not.toBeNull();
    q.markIgnored(s!.id);
    expect(s!.status).toBe('ignored');
  });

  it('should expire stale suggestions', () => {
    const q = new SuggestionQueue({ maxSize: 10, now: () => future(31 * 60 * 1000) }); // 31 min later
    const s = q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'x', detail: '', confidence: 0.5, sourcePatternIds: [], ttlMs: 1 });
    expect(s).not.toBeNull();
    q.expireStale();
    expect(s!.status).toBe('expired');
  });

  it('should not dequeue expired suggestions', () => {
    const q = new SuggestionQueue({ maxSize: 10, now: () => future(31 * 60 * 1000) });
    q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'stale', detail: '', confidence: 0.5, sourcePatternIds: [], ttlMs: 1 });
    const result = q.dequeue(1);
    expect(result).toHaveLength(0);
  });

  it('getActive returns only pending', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'a', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'b', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.dequeue(1); // a becomes injected
    expect(q.getActive()).toHaveLength(1);
  });

  it('clear should remove all', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'a', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.clear();
    expect(q.size()).toBe(0);
  });

  it('pendingCount should only count pending', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'a', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.enqueue({ type: 'suggestion', priority: 0.5, summary: 'b', detail: '', confidence: 0.5, sourcePatternIds: [] });
    expect(q.pendingCount).toBe(2);
    q.dequeue(1);
    expect(q.pendingCount).toBe(1);
  });

  it('createSuggestion should set correct defaults', () => {
    const now = new Date();
    const s = createSuggestion({
      type: 'alert',
      priority: 0.7,
      summary: 'test',
      detail: '',
      confidence: 0.9,
      sourcePatternIds: ['p1', 'p2'],
    });
    expect(s.id).toBeTruthy();
    expect(s.type).toBe('alert');
    expect(s.confidence).toBe(0.9);
    expect(s.sourcePatternIds).toEqual(['p1', 'p2']);
    expect(s.status).toBe('pending');
    expect(s.expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('custom ttl should be respected', () => {
    const s = createSuggestion({
      type: 'suggestion',
      priority: 0.5,
      summary: 'x',
      detail: '',
      confidence: 0.5,
      sourcePatternIds: [],
      ttlMs: 5000,
    });
    const diff = s.expiresAt.getTime() - s.createdAt.getTime();
    expect(diff).toBe(5000);
  });
});
