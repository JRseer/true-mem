import { describe, expect, it } from 'vitest';
import { extractConversationText, extractConversationTextWithRoles, extractCleanSummary } from '../../src/adapters/opencode/message-parser.js';
import { formatMemoriesForInjection, formatMemoryListForResponse, buildCompactionPrompt } from '../../src/adapters/opencode/formatters.js';
import type { MemoryUnit } from '../../src/types.js';

describe('golden: adapter extraction functions', () => {
  describe('message-parser', () => {
    it('extractConversationText extracts plain text correctly from openCode message container', () => {
      const messages: any[] = [
        { info: { role: 'user' }, parts: [{ type: 'text', text: 'Hello' }] },
        { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Hi there' }, { type: 'tool_call', name: 'search' }] }
      ];
      
      const text = extractConversationText(messages);
      
      expect(text).toBe('Human: Hello\nAssistant: Hi there');
    });

    it('extractConversationTextWithRoles prefixes text with roles', () => {
      const messages: any[] = [
        { info: { role: 'user' }, parts: [{ type: 'text', text: 'What is bun?' }] },
        { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Bun is a JS runtime.' }] }
      ];
      
      const result = extractConversationTextWithRoles(messages);
      
      expect(result.text).toBe('Human: What is bun?\nAssistant: Bun is a JS runtime.');
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].role).toBe('user');
    });

    it('extractCleanSummary removes prefixes and truncates appropriately', () => {
      expect(extractCleanSummary('Human: This is a test memory.')).toBe('This is a test memory.');
      expect(extractCleanSummary('Assistant: I learned something new.')).toBe('I learned something new.');
      expect(extractCleanSummary('Human:  Trim whitespace  ')).toBe('Trim whitespace');
      
      const longSummary = 'A'.repeat(550);
      expect(extractCleanSummary(longSummary).length).toBeLessThanOrEqual(503); // 500 + '...'
      expect(extractCleanSummary(longSummary).endsWith('...')).toBe(true);
    });
  });

  describe('formatters', () => {
    it('formatMemoriesForInjection formats User and Project level memories appropriately', () => {
      const memories: MemoryUnit[] = [
        {
          id: '1', classification: 'preference', summary: 'Use typescript', store: 'ltm',
          sessionId: 's1', sourceEventIds: [], createdAt: new Date(), updatedAt: new Date(), lastAccessedAt: new Date(),
          recency: 0, frequency: 1, importance: 0.8, utility: 0.8, novelty: 0.5, confidence: 0.9, interference: 0,
          strength: 0.9, decayRate: 0.01, tags: [], associations: [], status: 'active', version: 1, evidence: []
        },
        {
          id: '2', classification: 'decision', summary: 'Using LanceDB', store: 'stm',
          sessionId: 's2', sourceEventIds: [], createdAt: new Date(), updatedAt: new Date(), lastAccessedAt: new Date(),
          recency: 0, frequency: 1, importance: 0.7, utility: 0.7, novelty: 0.5, confidence: 0.8, interference: 0,
          strength: 0.8, decayRate: 0.05, tags: [], associations: [], status: 'active', version: 1, evidence: []
        }
      ];

      const formatted = formatMemoriesForInjection(memories, 'D:\\Project\\test-app');
      
      expect(formatted).toContain('## Relevant Memories from Previous Sessions');
      expect(formatted).toContain('### User Preferences & Constraints');
      expect(formatted).toContain('- [LTM] [preference] Use typescript');
      expect(formatted).toContain('### test-app Context');
      expect(formatted).toContain('- [STM] [decision] Using LanceDB');
    });

    it('formatMemoryListForResponse formats for Chat UI', () => {
      const memories: MemoryUnit[] = [
        {
          id: '1', classification: 'preference', summary: 'Use typescript', store: 'ltm',
          sessionId: 's1', sourceEventIds: [], createdAt: new Date(), updatedAt: new Date(), lastAccessedAt: new Date(),
          recency: 0, frequency: 1, importance: 0.8, utility: 0.8, novelty: 0.5, confidence: 0.9, interference: 0,
          strength: 0.9, decayRate: 0.01, tags: [], associations: [], status: 'active', version: 1, evidence: []
        }
      ];

      const response = formatMemoryListForResponse(memories);
      
      expect(response).toContain('**GLOBAL SCOPE:**');
      expect(response).toContain('**LTM:**');
      expect(response).toContain('• [preference] Use typescript');
    });

    it('buildCompactionPrompt wraps context appropriately', () => {
      const promptWithoutContext = buildCompactionPrompt(null);
      expect(promptWithoutContext).toContain('You are compacting a conversation. Preserve:');
      
      const promptWithContext = buildCompactionPrompt('Some existing memories');
      expect(promptWithContext).toContain('Some existing memories');
      expect(promptWithContext).toContain('You are compacting a conversation. Preserve:');
    });
  });
});
