import type { MemoryClassification, MessageRole } from '../types.js';

/**
 * Scope visibility is a boundary/filter decision, not a cognitive score.
 */
export type ScopeVisibility = 'global' | 'project' | 'session';

export type ScopeSource = MessageRole | 'tool' | 'unknown';

export type ReservedScopeNamespace =
  | 'project'
  | 'session'
  | 'source'
  | 'type'
  | 'confidence'
  | 'visibility';

export type ScopeTagNamespace = ReservedScopeNamespace | 'custom';

export interface ScopeTag {
  readonly namespace: ScopeTagNamespace;
  readonly key: string;
  readonly value: string;
  readonly reserved: boolean;
}

export interface ScopeContext {
  readonly project?: string | undefined;
  readonly session?: string | undefined;
  readonly source: ScopeSource;
  readonly type?: MemoryClassification | undefined;
  readonly confidence?: number | undefined;
  readonly visibility: ScopeVisibility;
  readonly tags: readonly ScopeTag[];
}

export interface ScopeContextInput {
  readonly project?: string | undefined;
  readonly session?: string | undefined;
  readonly source?: ScopeSource | undefined;
  readonly type?: MemoryClassification | undefined;
  readonly confidence?: number | undefined;
  readonly visibility?: ScopeVisibility | undefined;
  readonly tags?: readonly ScopeTag[] | undefined;
}
