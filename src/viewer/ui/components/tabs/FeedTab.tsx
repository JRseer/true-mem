import { useEffect, useState } from 'preact/hooks';
import type { MemoryFilters, PaginatedMemoriesResponse, ViewerMemory, ViewerMemoryClassification, ViewerMemoryStatus } from '../../../shared/types.js';
import { classificationLabels, copy, statusLabels, storeLabels } from '../../i18n/zh-CN.js';
import { fetchMemories, patchMemory } from '../../lib/api/client.js';
import { formatDateTime, formatNumber } from '../../lib/format.js';
import { setFilters, state } from '../../state.js';
import { StatusBadge } from '../shared/StatusBadge.js';

const EMPTY_RESULT: PaginatedMemoriesResponse = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1, projects: [] };

export function FeedTab() {
  const [data, setData] = useState(EMPTY_RESULT);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setLocalFilters] = useState<MemoryFilters>(state.filters);

  async function load(): Promise<void> {
    try {
      setData(await fetchMemories(state.filters));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    }
  }

  function updateFilters(patch: MemoryFilters): void {
    const next = { ...filters, ...patch };
    setLocalFilters(next);
    setFilters(patch);
    void load();
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  async function updateMemory(id: string, patch: { status?: ViewerMemoryStatus; classification?: ViewerMemoryClassification }): Promise<void> {
    await patchMemory(id, patch);
    await load();
  }

  return (
    <section aria-labelledby="feed-title" class="space-y-4">
      <div>
        <h2 id="feed-title" class="text-xl font-semibold text-white">{copy.feed.title}</h2>
        <p class="mt-1 text-sm text-slate-400">{copy.feed.description}</p>
      </div>
      <div class="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 lg:flex-row lg:items-end">
        <label class="flex-1 text-sm text-slate-300">
          {copy.feed.searchLabel}
          <input class="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus-visible:ring-2 focus-visible:ring-mint-400" name="search" value={filters.search ?? ''} onInput={(event) => updateFilters({ search: event.currentTarget.value, page: 1 })} placeholder={copy.feed.searchPlaceholder} />
        </label>
        <FilterSelect label={copy.feed.storeLabel} name="store" value={filters.store ?? 'all'} options={[['all', storeLabels.all], ['stm', storeLabels.stm], ['ltm', storeLabels.ltm]]} onChange={(value) => updateFilters({ store: value === 'stm' || value === 'ltm' ? value : 'all', page: 1 })} />
        <FilterSelect label={copy.feed.classificationLabel} name="classification" value={filters.classification ?? 'all'} options={classificationOptions()} onChange={(value) => updateFilters({ classification: classificationValue(value), page: 1 })} />
        <FilterSelect label={copy.feed.statusLabel} name="status" value={filters.status ?? 'active'} options={statusOptions()} onChange={(value) => updateFilters({ status: statusValue(value), page: 1 })} />
        <FilterSelect label={copy.feed.projectLabel} name="project" value={filters.project ?? ''} options={projectOptions(data.projects)} onChange={(value) => updateFilters({ project: value, page: 1 })} />
        <label class="text-sm text-slate-300">
          {copy.feed.strengthLabel}
          <input class="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus-visible:ring-2 focus-visible:ring-mint-400" name="minStrength" type="number" min="0" max="1" step="0.05" value={filters.minStrength ?? ''} onInput={(event) => updateFilters({ minStrength: parseOptionalStrength(event.currentTarget.value), page: 1 })} aria-describedby="strength-hint" />
          <span id="strength-hint" class="mt-1 block text-xs text-slate-500">{copy.feed.strengthHint}</span>
        </label>
        <button class="rounded-xl bg-mint-400 px-4 py-2 font-semibold text-slate-950 focus-visible:ring-2 focus-visible:ring-white" type="button" onClick={() => void load()}>{copy.common.refresh}</button>
      </div>
      <p aria-live="polite" class="text-sm text-slate-400">{error || copy.feed.total(formatNumber(data.total), data.page, data.totalPages)}</p>
      <div class="space-y-3">
        {data.items.map((memory) => (
          <MemoryRow key={memory.id} memory={memory} expanded={expanded === memory.id} onToggle={() => setExpanded(expanded === memory.id ? null : memory.id)} onUpdate={updateMemory} />
        ))}
      </div>
      <div class="flex justify-between">
        <button class="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-mint-400" type="button" disabled={data.page <= 1} onClick={() => updateFilters({ page: Math.max(1, data.page - 1) })}>{copy.feed.previous}</button>
        <button class="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-mint-400" type="button" disabled={data.page >= data.totalPages} onClick={() => updateFilters({ page: data.page + 1 })}>{copy.feed.next}</button>
      </div>
    </section>
  );
}

function FilterSelect({ label, name, value, options, onChange }: { label: string; name: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label class="text-sm text-slate-300">
      {label}
      <select class="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus-visible:ring-2 focus-visible:ring-mint-400" name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </label>
  );
}

function MemoryRow({ memory, expanded, onToggle, onUpdate }: { memory: ViewerMemory; expanded: boolean; onToggle: () => void; onUpdate: (id: string, patch: { status?: ViewerMemoryStatus; classification?: ViewerMemoryClassification }) => Promise<void> }) {
  return (
    <article class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <button type="button" class="text-left focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-mint-400" onClick={onToggle} aria-expanded={expanded}>
          <p class="break-words text-sm text-slate-100">{memory.summary}</p>
          <p class="mt-2 text-xs text-slate-500">{classificationLabels[memory.classification]} · {storeLabels[memory.store]} · {copy.feed.strengthLabel} {formatNumber(memory.strength)} · 更新 {formatDateTime(memory.updatedAt)}</p>
        </button>
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge status={memory.status} />
          <label class="text-xs text-slate-300">
            {copy.feed.reclassify}
            <select class="ml-2 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-slate-100 focus-visible:ring-2 focus-visible:ring-mint-400" value={memory.classification} onChange={(event) => void onUpdate(memory.id, { classification: classificationValue(event.currentTarget.value) as ViewerMemoryClassification })}>
              {classificationOptions().filter(([value]) => value !== 'all').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button class="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-mint-400" type="button" onClick={() => { if (memory.status === 'deleted' || window.confirm(copy.feed.deleteConfirm)) void onUpdate(memory.id, { status: memory.status === 'deleted' ? 'active' : 'deleted' }); }}>{memory.status === 'deleted' ? copy.feed.restore : copy.feed.delete}</button>
        </div>
      </div>
      {expanded ? (
        <dl aria-label={copy.feed.detail} class="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
          <Detail label="项目" value={memory.projectScope ?? 'global'} />
          <Detail label="会话 ID" value={memory.sessionId ?? '-'} />
          <Detail label="版本" value={formatNumber(memory.version)} />
          <Detail label="状态" value={statusLabels[memory.status]} />
          <Detail label="分类" value={classificationLabels[memory.classification]} />
          <Detail label="存储" value={storeLabels[memory.store]} />
          <Detail label="创建时间" value={formatDateTime(memory.createdAt)} />
          <Detail label="更新时间" value={formatDateTime(memory.updatedAt)} />
          <Detail label="最后访问" value={formatDateTime(memory.lastAccessedAt)} />
          <Detail label="近因 recency" value={formatNumber(memory.recency)} />
          <Detail label="频率 frequency" value={formatNumber(memory.frequency)} />
          <Detail label="重要性 importance" value={formatNumber(memory.importance)} />
          <Detail label="效用 utility" value={formatNumber(memory.utility)} />
          <Detail label="新颖性 novelty" value={formatNumber(memory.novelty)} />
          <Detail label="置信度 confidence" value={formatNumber(memory.confidence)} />
          <Detail label="干扰 interference" value={formatNumber(memory.interference)} />
          <Detail label="强度 strength" value={formatNumber(memory.strength)} />
          <Detail label="衰减率 decay" value={formatNumber(memory.decayRate)} />
          <Detail label="标签" value={memory.tags.length > 0 ? memory.tags.join(', ') : '-'} />
          <Detail label="关联" value={memory.associations.length > 0 ? memory.associations.join(', ') : '-'} />
          <Detail label="来源事件" value={memory.sourceEventIds.length > 0 ? memory.sourceEventIds.join(', ') : '-'} />
        </dl>
      ) : null}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt class="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd class="break-words text-slate-200">{value}</dd></div>;
}

function classificationOptions(): Array<[string, string]> {
  return Object.entries(classificationLabels);
}

function statusOptions(): Array<[string, string]> {
  return Object.entries(statusLabels);
}

function projectOptions(projects: string[]): Array<[string, string]> {
  return [['', copy.common.all], ...projects.map((project): [string, string] => [project, project])];
}

function classificationValue(value: string): ViewerMemoryClassification | 'all' {
  return value === 'constraint' || value === 'preference' || value === 'learning' || value === 'procedural' || value === 'decision' || value === 'semantic' || value === 'episodic' ? value : 'all';
}

function statusValue(value: string): ViewerMemoryStatus | 'all' {
  return value === 'active' || value === 'decayed' || value === 'deleted' ? value : 'all';
}

function parseOptionalStrength(value: string): number | undefined {
  if (value.trim().length === 0) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : undefined;
}
