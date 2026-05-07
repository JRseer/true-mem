import type {
  EmbeddingStatus,
  HealthResponse,
  MemoryFilters,
  MemoryPatchRequest,
  MonitorStatus,
  PaginatedMemoriesResponse,
  SettingsResponse,
  StatsOverview,
} from '../../../shared/types.js';

export async function fetchMemories(filters: MemoryFilters): Promise<PaginatedMemoriesResponse> {
  return request(`/api/memories?${memoryQuery(filters)}`);
}

export async function patchMemory(id: string, body: MemoryPatchRequest): Promise<void> {
  await request(`/api/memories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: viewerWriteHeaders(),
    body: JSON.stringify(body),
  });
}

export async function fetchStats(): Promise<StatsOverview> {
  return request('/api/stats/overview');
}

export async function fetchMonitorStatus(): Promise<MonitorStatus> {
  return request('/api/monitor/status');
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request('/api/health');
}

export async function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
  return request('/api/embeddings/status');
}

export async function fetchSettings(): Promise<SettingsResponse> {
  return request('/api/settings');
}

export async function saveSettings(config: SettingsResponse['config']): Promise<SettingsResponse> {
  return request('/api/settings', {
    method: 'PUT',
    headers: viewerWriteHeaders(),
    body: JSON.stringify(config),
  });
}

export async function resetSettings(): Promise<SettingsResponse> {
  return request('/api/settings/reset', { method: 'POST', headers: viewerWriteHeaders() });
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function memoryQuery(filters: MemoryFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== 'all') params.set(key, String(value));
  }
  return params.toString();
}

function viewerWriteHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-True-Mem-Viewer': '1' };
}
