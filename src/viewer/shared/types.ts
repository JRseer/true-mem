import type { TrueMemUserConfig } from '../../types/config.js';

export type ViewerMemoryStore = 'stm' | 'ltm';
export type ViewerMemoryClassification =
  | 'constraint'
  | 'preference'
  | 'learning'
  | 'procedural'
  | 'decision'
  | 'semantic'
  | 'episodic'
  | 'pattern';
export type ViewerMemoryStatus = 'active' | 'decayed' | 'deleted' | 'established' | 'noise';

export interface ViewerMemory {
  id: string;
  sessionId: string | null;
  store: ViewerMemoryStore;
  classification: ViewerMemoryClassification;
  summary: string;
  projectScope: string | null;
  taskScope: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  recency: number;
  frequency: number;
  importance: number;
  utility: number;
  novelty: number;
  confidence: number;
  interference: number;
  strength: number;
  decayRate: number;
  tags: string[];
  associations: string[];
  sourceEventIds: string[];
  status: ViewerMemoryStatus;
  version: number;
}

export interface MemoryFilters {
  store?: ViewerMemoryStore | 'all';
  classification?: ViewerMemoryClassification | 'all';
  status?: ViewerMemoryStatus | 'all';
  project?: string;
  taskScope?: string;
  minStrength?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedMemoriesResponse {
  items: ViewerMemory[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  projects: string[];
  taskScopes: string[];
}

export interface MemoryPatchRequest {
  status?: ViewerMemoryStatus;
  classification?: ViewerMemoryClassification;
}

export interface EndTaskScopeResponse {
  ok: true;
  taskScope: string;
  changes: number;
}

export interface DistributionItem {
  label: string;
  count: number;
}

export interface TrendItem {
  date: string;
  count: number;
}

export interface StrengthMetrics {
  average: number;
  min: number;
  max: number;
  activeAverage: number;
}

export interface StatsOverview {
  totals: {
    memories: number;
    active: number;
    deleted: number;
    decayed: number;
    sessions: number;
    events: number;
  };
  storeDistribution: DistributionItem[];
  classificationDistribution: DistributionItem[];
  statusDistribution: DistributionItem[];
  projectDistribution: DistributionItem[];
  creationTrend: TrendItem[];
  strength: StrengthMetrics;
  generatedAt: string;
}

export interface MonitorEvent {
  id: string;
  sessionId: string | null;
  hookType: string;
  timestamp: string;
  toolName: string | null;
  summary: string;
}

export interface MonitorStatus {
  activityRatePerHour: number;
  errorRatePerHour: number;
  activeSessions: number;
  memoryHealth: {
    activeRatio: number;
    averageStrength: number;
    staleCount: number;
  };
  recentEvents: MonitorEvent[];
  derivedIndex: DerivedIndexSummary;
  upgrade: UpgradeStateSummary;
  generatedAt: string;
}

export interface SettingsResponse {
  config: TrueMemUserConfig;
  defaults: TrueMemUserConfig;
  rawJson: string;
  configPath: string;
}

export interface ApiErrorResponse {
  error: string;
}

// --- Health ---

export interface HealthResponse {
  ok: boolean;
  databasePath: string;
  databaseExists: boolean;
  pluginVersion: string;
  schemaVersion: number | null;
  storageLocation: string;
  generatedAt: string;
}

// --- Embeddings ---

export interface EmbeddingStatus {
  enabled: boolean;
  ready: boolean;
  failureCount: number;
  circuitBreakerActive: boolean;
  generatedAt: string;
}

// --- Derived Index ---

export interface DerivedIndexSummary {
  total: number;
  indexed: number;
  failed: number;
  stale: number;
}

// --- Upgrade State ---

export type UpgradeStateValue =
  | 'ready'
  | 'backing_up'
  | 'migrating'
  | 'rebuilding'
  | 'verifying'
  | 'completed'
  | 'failed';

export interface UpgradeStateSummary {
  state: UpgradeStateValue | null;
  error?: string;
  updatedAt: string;
}

// --- Sessions ---

export interface ViewerSession {
  id: string;
  project: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  memoryCount: number;
  injectionCount: number;
}

export interface PaginatedSessionsResponse {
  items: ViewerSession[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SessionDetail {
  id: string;
  project: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
}

export interface SessionInjection {
  id: string;
  memoryId: string;
  memorySummary: string;
  classification: ViewerMemoryClassification;
  store: ViewerMemoryStore;
  injectedAt: string;
  relevanceScore: number | null;
  injectionContext: string | null;
}

export interface SessionInjectionsResponse {
  sessionId: string;
  injections: SessionInjection[];
  total: number;
}
