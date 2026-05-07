import { describe, it, expect } from 'vitest';
import { SuggestionQueue } from '../../src/pipeline/suggestion';
import { wrapProactiveContext } from '../../src/adapters/opencode/injection';
import { createSuggestion } from '../../src/pipeline/suggestion';

describe('wrapProactiveContext', () => {
  it('should return empty string for no active suggestions', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    expect(wrapProactiveContext(q.getActive())).toBe('');
  });

  it('should produce XML for active suggestions', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    const s = q.enqueue({
      type: 'suggestion',
      priority: 0.85,
      summary: 'Pattern detected: RAG research',
      detail: '3 new papers match your direction',
      confidence: 0.7,
      sourcePatternIds: ['p1'],
    });
    expect(s).not.toBeNull();

    const xml = wrapProactiveContext(q.getActive(), 3);
    expect(xml).toContain('<proactive_context>');
    expect(xml).toContain('<suggestion');
    expect(xml).toContain('suggestion id=');
    expect(xml).toContain('Pattern detected');
    expect(xml).toContain('data-suggestion-id');
    expect(xml).toContain('</proactive_context>');
  });

  it('should escape XML special chars in detail', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    q.enqueue({
      type: 'alert',
      priority: 0.5,
      summary: 'Alert & <script>',
      detail: '>> details <<',
      confidence: 0.5,
      sourcePatternIds: [],
    });
    const xml = wrapProactiveContext(q.getActive(), 3);
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&gt;&gt;');
  });

  it('should respect maxSuggestions limit', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    for (let i = 0; i < 5; i++) {
      q.enqueue({
        type: 'suggestion',
        priority: 0.5 - i * 0.1,
        summary: `suggestion ${i}`,
        detail: '',
        confidence: 0.5,
        sourcePatternIds: [],
      });
    }
    const xml = wrapProactiveContext(q.getActive(), 2);
    // Count suggestion opening tags
    const matches = xml.match(/<suggestion /g);
    expect(matches).toHaveLength(2);
  });

  it('should sort by priority descending', () => {
    const q = new SuggestionQueue({ maxSize: 10 });
    q.enqueue({ type: 'suggestion', priority: 0.3, summary: 'low', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.enqueue({ type: 'suggestion', priority: 0.9, summary: 'high', detail: '', confidence: 0.5, sourcePatternIds: [] });
    q.enqueue({ type: 'suggestion', priority: 0.6, summary: 'mid', detail: '', confidence: 0.5, sourcePatternIds: [] });

    const xml = wrapProactiveContext(q.getActive(), 3);
    const highIdx = xml.indexOf('high');
    const midIdx = xml.indexOf('mid');
    const lowIdx = xml.indexOf('low');
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });
});
