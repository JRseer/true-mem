import { describe, expect, it } from 'vitest';

import { PipelineManager } from '../../src/pipeline/index.js';
import {
  attachScopeContext,
  createScopeContext,
  isReservedScopeNamespace,
  normalizeScopeValue,
  resolveScopeVisibility,
  type ScopeTag,
} from '../../src/scope/index.js';

describe('golden: ScopeContext tags are boundaries, not cognition', () => {
  it('resolves visibility with session over project over explicit global', () => {
    expect(resolveScopeVisibility({ visibility: 'global' })).toBe('global');
    expect(resolveScopeVisibility({ project: 'trueMem', visibility: 'global' })).toBe('project');
    expect(resolveScopeVisibility({ project: 'trueMem', session: 'session-1', visibility: 'global' })).toBe('session');
  });

  it('normalizes reserved tags deterministically', () => {
    expect(createScopeContext({
      project: 'True Mem',
      session: 'Session 123',
      source: 'user',
      type: 'semantic',
      confidence: 1.25,
      visibility: 'global',
    })).toEqual({
      project: 'true-mem',
      session: 'session-123',
      source: 'user',
      type: 'semantic',
      confidence: 1,
      visibility: 'session',
      tags: [
        { namespace: 'visibility', key: 'visibility', value: 'session', reserved: true },
        { namespace: 'project', key: 'project', value: 'true-mem', reserved: true },
        { namespace: 'session', key: 'session', value: 'session-123', reserved: true },
        { namespace: 'source', key: 'source', value: 'user', reserved: true },
        { namespace: 'type', key: 'type', value: 'semantic', reserved: true },
        { namespace: 'confidence', key: 'confidence', value: '1', reserved: true },
      ],
    });
  });

  it('prevents custom tags from overriding reserved namespaces', () => {
    const customTags: ScopeTag[] = [
      { namespace: 'visibility', key: 'visibility', value: 'global', reserved: false },
      { namespace: 'custom', key: ' Team ', value: ' Memory Systems ', reserved: false },
      { namespace: 'custom', key: 'team', value: 'duplicate', reserved: false },
    ];

    const scope = createScopeContext({ project: 'trueMem', tags: customTags });

    expect(scope.tags).toEqual([
      { namespace: 'visibility', key: 'visibility', value: 'project', reserved: true },
      { namespace: 'project', key: 'project', value: 'truemem', reserved: true },
      { namespace: 'source', key: 'source', value: 'unknown', reserved: true },
      { namespace: 'custom', key: 'team', value: 'memory-systems', reserved: false },
    ]);
  });

  it('attaches scope to pipeline context without changing trace semantics', () => {
    const manager = new PipelineManager({
      createRunId: () => 'run-scope',
      now: () => new Date('2026-04-30T00:00:00.000Z'),
    });
    const pipelineContext = manager.createContext({ purpose: 'scope-boundary' });
    const scope = createScopeContext({ project: 'trueMem' });

    expect(attachScopeContext(pipelineContext, scope)).toEqual({
      runId: 'run-scope',
      metadata: { purpose: 'scope-boundary' },
      traces: [],
      scope,
    });
  });

  it('keeps namespace helpers explicit and value normalization stable', () => {
    expect(isReservedScopeNamespace('confidence')).toBe(true);
    expect(isReservedScopeNamespace('custom')).toBe(false);
    expect(normalizeScopeValue(' True Mem  V2 ')).toBe('true-mem-v2');
  });
});
