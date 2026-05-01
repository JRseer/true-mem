import type { PipelineContext } from '../pipeline/index.js';
import type {
  ReservedScopeNamespace,
  ScopeContext,
  ScopeContextInput,
  ScopeTag,
  ScopeTagNamespace,
  ScopeVisibility,
} from './types.js';

const RESERVED_NAMESPACES: ReadonlySet<ScopeTagNamespace> = new Set([
  'project',
  'session',
  'source',
  'type',
  'confidence',
  'visibility',
]);

export interface ScopedPipelineContext extends PipelineContext {
  readonly scope: ScopeContext;
}

export function isReservedScopeNamespace(namespace: ScopeTagNamespace): namespace is ReservedScopeNamespace {
  return RESERVED_NAMESPACES.has(namespace) && namespace !== 'custom';
}

export function normalizeScopeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

export function resolveScopeVisibility(input: ScopeContextInput): ScopeVisibility {
  if (input.session && input.session.trim().length > 0) {
    return 'session';
  }

  if (input.project && input.project.trim().length > 0) {
    return 'project';
  }

  return input.visibility ?? 'global';
}

export function createScopeContext(input: ScopeContextInput = {}): ScopeContext {
  const confidence = normalizeConfidence(input.confidence);
  const visibility = resolveScopeVisibility(input);
  const reservedTags = buildReservedScopeTags({ ...input, confidence, visibility });
  const customTags = normalizeCustomTags(input.tags ?? []);

  return {
    project: normalizeOptionalValue(input.project),
    session: normalizeOptionalValue(input.session),
    source: input.source ?? 'unknown',
    type: input.type,
    confidence,
    visibility,
    tags: mergeScopeTags(reservedTags, customTags),
  };
}

export function attachScopeContext(context: PipelineContext, scope: ScopeContext): ScopedPipelineContext {
  return { ...context, scope };
}

function buildReservedScopeTags(input: ScopeContextInput & { readonly visibility: ScopeVisibility }): ScopeTag[] {
  const tags: ScopeTag[] = [createReservedTag('visibility', 'visibility', input.visibility)];
  const project = normalizeOptionalValue(input.project);
  const session = normalizeOptionalValue(input.session);

  if (project) {
    tags.push(createReservedTag('project', 'project', project));
  }

  if (session) {
    tags.push(createReservedTag('session', 'session', session));
  }

  tags.push(createReservedTag('source', 'source', input.source ?? 'unknown'));

  if (input.type) {
    tags.push(createReservedTag('type', 'type', input.type));
  }

  if (input.confidence !== undefined) {
    tags.push(createReservedTag('confidence', 'confidence', formatConfidence(input.confidence)));
  }

  return tags;
}

function createReservedTag(namespace: ReservedScopeNamespace, key: string, value: string): ScopeTag {
  return {
    namespace,
    key: normalizeScopeValue(key),
    value: normalizeScopeValue(value),
    reserved: true,
  };
}

function normalizeCustomTags(tags: readonly ScopeTag[]): ScopeTag[] {
  return tags
    .filter(tag => !isReservedScopeNamespace(tag.namespace))
    .map(tag => ({
      namespace: 'custom' as const,
      key: normalizeScopeValue(tag.key),
      value: normalizeScopeValue(tag.value),
      reserved: false,
    }));
}

function mergeScopeTags(reservedTags: readonly ScopeTag[], customTags: readonly ScopeTag[]): readonly ScopeTag[] {
  const byIdentity = new Map<string, ScopeTag>();

  for (const tag of reservedTags) {
    byIdentity.set(getTagIdentity(tag), tag);
  }

  for (const tag of customTags) {
    const identity = getTagIdentity(tag);
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, tag);
    }
  }

  return [...byIdentity.values()];
}

function getTagIdentity(tag: ScopeTag): string {
  return `${tag.namespace}:${tag.key}`;
}

function normalizeOptionalValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeScopeValue(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeConfidence(confidence: number | undefined): number | undefined {
  if (confidence === undefined) {
    return undefined;
  }

  if (Number.isNaN(confidence)) {
    return 0;
  }

  return Math.min(Math.max(confidence, 0), 1);
}

function formatConfidence(confidence: number): string {
  return confidence.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
