import type { MemoryFilters } from '../shared/types.js';

export type ViewerTab = 'feed' | 'stats' | 'monitor' | 'settings';

export interface ViewerState {
  tab: ViewerTab;
  filters: MemoryFilters;
}

export const state: ViewerState = {
  tab: readTabFromUrl(),
  filters: {
    page: numberParam('page', 1),
    pageSize: 20,
    status: 'active',
    store: 'all',
    classification: classificationParam(),
    project: new URLSearchParams(window.location.search).get('project') ?? '',
    minStrength: optionalNumberParam('minStrength'),
    search: new URLSearchParams(window.location.search).get('search') ?? '',
  },
};

export function setTab(tab: ViewerTab): void {
  state.tab = tab;
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(null, '', url);
}

export function setFilters(filters: MemoryFilters): void {
  state.filters = { ...state.filters, ...filters };
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(state.filters)) {
    if (value === undefined || value === '' || value === 'all') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  window.history.replaceState(null, '', url);
}

function readTabFromUrl(): ViewerTab {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab === 'stats' || tab === 'monitor' || tab === 'settings' ? tab : 'feed';
}

function numberParam(name: string, fallback: number): number {
  const value = new URLSearchParams(window.location.search).get(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalNumberParam(name: string): number | undefined {
  const value = new URLSearchParams(window.location.search).get(name);
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function classificationParam(): MemoryFilters['classification'] {
  const value = new URLSearchParams(window.location.search).get('classification');
  return value === 'constraint' || value === 'preference' || value === 'learning' || value === 'procedural' || value === 'decision' || value === 'semantic' || value === 'episodic' || value === 'pattern' ? value : 'all';
}
