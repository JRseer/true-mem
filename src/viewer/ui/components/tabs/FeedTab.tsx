import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Archive, ChevronDown, ChevronLeft, ChevronRight, Clock, Filter, Loader2, RefreshCw, RotateCcw, Search, Tag, Trash2, Zap } from 'lucide-preact';
import type { MemoryFilters, PaginatedMemoriesResponse, ViewerMemory, ViewerMemoryClassification, ViewerMemoryStatus } from '../../../shared/types.js';
import { classificationLabels, copy, statusLabels, storeLabels } from '../../i18n/zh-CN.js';
import { fetchMemories, patchMemory } from '../../lib/api/client.js';
import { formatDateTime, formatNumber } from '../../lib/format.js';
import { setFilters, state } from '../../state.js';
import { StatusBadge } from '../shared/StatusBadge.js';

const EMPTY_RESULT: PaginatedMemoriesResponse = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1, projects: [] };
const VIRTUAL_VIEWPORT_HEIGHT = 680;
const COLLAPSED_ROW_HEIGHT = 178;
const EXPANDED_ROW_ESTIMATED_HEIGHT = 920;
const VIRTUAL_OVERSCAN = 2;

export function FeedTab() {
  const [data, setData] = useState(EMPTY_RESULT);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setLocalFilters] = useState<MemoryFilters>(state.filters);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      setData(await fetchMemories(state.filters));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 8_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function updateMemory(id: string, patch: { status?: ViewerMemoryStatus; classification?: ViewerMemoryClassification }): Promise<void> {
    await patchMemory(id, patch);
    await load();
  }

  return (
    <section aria-labelledby="feed-title" class="space-y-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="feed-title" class="text-xl font-semibold text-white">{copy.feed.title}</h2>
          <p class="mt-1 max-w-2xl text-sm text-slate-400">{copy.feed.description}</p>
        </div>
        <button class="inline-flex items-center justify-center gap-2 rounded-xl border border-mint-400/30 bg-mint-400/10 px-4 py-2 text-sm font-semibold text-mint-200 transition hover:border-mint-300 hover:bg-mint-400/15 focus-visible:ring-2 focus-visible:ring-mint-400" type="button" onClick={() => void load()}>
          {loading ? <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw class="h-4 w-4" aria-hidden="true" />}
          {copy.common.refresh}
        </button>
      </div>

      <div class="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-dark-900 via-dark-950 to-slate-950 shadow-soft">
        <button class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-mint-400" type="button" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
          <span class="flex items-center gap-3">
            <span class="rounded-2xl bg-mint-400/10 p-2 text-mint-300"><Filter class="h-4 w-4" aria-hidden="true" /></span>
            <span>
              <span class="block text-sm font-semibold text-white">筛选与检索</span>
              <span class="block text-xs text-slate-500">{activeFilterSummary(filters)}</span>
            </span>
          </span>
          <ChevronDown class={`h-5 w-5 text-slate-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {filtersOpen ? (
          <div class="animate-fade-in border-t border-white/10 p-4">
            <label class="block text-sm text-slate-300">
              {copy.feed.searchLabel}
              <span class="mt-1 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 transition focus-within:border-mint-400/70 focus-within:ring-2 focus-within:ring-mint-400/30">
                <Search class="h-4 w-4 text-slate-500" aria-hidden="true" />
                <input class="w-full bg-transparent text-white outline-none placeholder:text-slate-600" name="search" value={filters.search ?? ''} onInput={(event) => updateFilters({ search: event.currentTarget.value, page: 1 })} placeholder={copy.feed.searchPlaceholder} />
              </span>
            </label>
            <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <FilterSelect label={copy.feed.storeLabel} name="store" value={filters.store ?? 'all'} options={[['all', storeLabels.all], ['stm', storeLabels.stm], ['ltm', storeLabels.ltm]]} onChange={(value) => updateFilters({ store: value === 'stm' || value === 'ltm' ? value : 'all', page: 1 })} />
              <FilterSelect label={copy.feed.classificationLabel} name="classification" value={filters.classification ?? 'all'} options={classificationOptions()} onChange={(value) => updateFilters({ classification: classificationValue(value), page: 1 })} />
              <FilterSelect label={copy.feed.statusLabel} name="status" value={filters.status ?? 'active'} options={statusOptions()} onChange={(value) => updateFilters({ status: statusValue(value), page: 1 })} />
              <FilterSelect label={copy.feed.projectLabel} name="project" value={filters.project ?? ''} options={projectOptions(data.projects)} onChange={(value) => updateFilters({ project: value, page: 1 })} />
              <label class="text-sm text-slate-300">
                {copy.feed.strengthLabel}
                <input class="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white transition focus-visible:border-mint-400 focus-visible:ring-2 focus-visible:ring-mint-400/40" name="minStrength" type="number" min="0" max="1" step="0.05" value={filters.minStrength ?? ''} onInput={(event) => updateFilters({ minStrength: parseOptionalStrength(event.currentTarget.value), page: 1 })} aria-describedby="strength-hint" />
                <span id="strength-hint" class="mt-1 block text-xs text-slate-500">{copy.feed.strengthHint}</span>
              </label>
            </div>
          </div>
        ) : null}
      </div>
      <p aria-live="polite" class={`text-sm ${error ? 'text-accent-rose' : 'text-slate-400'}`}>{error || copy.feed.total(formatNumber(data.total), data.page, data.totalPages)}</p>
      <div>
        <VirtualizedMemoryList items={data.items} expandedId={expanded} onToggle={(memoryId) => setExpanded(expanded === memoryId ? null : memoryId)} onUpdate={updateMemory} />
        {data.items.length === 0 ? <EmptyState loading={loading} /> : null}
      </div>
      <div class="flex justify-between gap-3">
        <button class="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-mint-400/40 hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-mint-400" type="button" disabled={data.page <= 1} onClick={() => updateFilters({ page: Math.max(1, data.page - 1) })}><ChevronLeft class="h-4 w-4" aria-hidden="true" />{copy.feed.previous}</button>
        <button class="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-mint-400/40 hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-mint-400" type="button" disabled={data.page >= data.totalPages} onClick={() => updateFilters({ page: data.page + 1 })}>{copy.feed.next}<ChevronRight class="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </section>
  );
}

function VirtualizedMemoryList({ items, expandedId, onToggle, onUpdate }: { items: ViewerMemory[]; expandedId: string | null; onToggle: (memoryId: string) => void; onUpdate: (id: string, patch: { status?: ViewerMemoryStatus; classification?: ViewerMemoryClassification }) => Promise<void> }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const rowHeights = useMemo(() => items.map((memory) => measuredHeights[memory.id] ?? estimatedRowHeight(memory.id === expandedId)), [items, expandedId, measuredHeights]);
  const offsets = useMemo(() => cumulativeOffsets(rowHeights), [rowHeights]);
  const lastOffset = offsets[offsets.length - 1] ?? 0;
  const lastHeight = rowHeights[rowHeights.length - 1] ?? 0;
  const totalHeight = offsets.length > 0 ? lastOffset + lastHeight : 0;
  const visibleRange = visibleIndexRange(offsets, rowHeights, scrollTop, VIRTUAL_VIEWPORT_HEIGHT);
  const visibleItems = items.slice(visibleRange.start, visibleRange.end + 1);

  function handleMeasure(memoryId: string, height: number): void {
    setMeasuredHeights((current) => {
      const previous = current[memoryId];
      if (previous !== undefined && Math.abs(previous - height) < 1) return current;
      return { ...current, [memoryId]: height };
    });
  }

  if (items.length === 0) return null;

  return (
    <div class="rounded-3xl border border-white/10 bg-slate-950/30 p-2 shadow-inner shadow-black/20">
      <div class="mb-2 flex items-center justify-between px-2 text-xs text-slate-500">
        <span>虚拟列表 · 渲染 {formatNumber(visibleItems.length)} / {formatNumber(items.length)} 条</span>
        <span>滚动时保持轻量</span>
      </div>
      <div class="max-h-[70vh] overflow-y-auto pr-1" style={{ height: `${Math.min(VIRTUAL_VIEWPORT_HEIGHT, totalHeight)}px` }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div class="relative" style={{ height: `${totalHeight}px` }}>
          {visibleItems.map((memory, index) => {
            const itemIndex = visibleRange.start + index;
            return (
              <div key={memory.id} class="absolute left-0 right-0 px-1 pb-3" style={{ transform: `translateY(${offsets[itemIndex] ?? 0}px)` }}>
                <MeasuredMemoryRow memory={memory} expanded={expandedId === memory.id} onToggle={() => onToggle(memory.id)} onUpdate={onUpdate} onMeasure={handleMeasure} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MeasuredMemoryRow({ memory, expanded, onToggle, onUpdate, onMeasure }: { memory: ViewerMemory; expanded: boolean; onToggle: () => void; onUpdate: (id: string, patch: { status?: ViewerMemoryStatus; classification?: ViewerMemoryClassification }) => Promise<void>; onMeasure: (memoryId: string, height: number) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const measure = () => onMeasure(memory.id, element.offsetHeight + 12);
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [memory.id, expanded]);

  return <div ref={rowRef}><MemoryRow memory={memory} expanded={expanded} onToggle={onToggle} onUpdate={onUpdate} /></div>;
}

function FilterSelect({ label, name, value, options, onChange }: { label: string; name: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label class="text-sm text-slate-300">
      {label}
      <select class="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white transition focus-visible:border-mint-400 focus-visible:ring-2 focus-visible:ring-mint-400/40" name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </label>
  );
}

function MemoryRow({ memory, expanded, onToggle, onUpdate }: { memory: ViewerMemory; expanded: boolean; onToggle: () => void; onUpdate: (id: string, patch: { status?: ViewerMemoryStatus; classification?: ViewerMemoryClassification }) => Promise<void> }) {
  const deleted = memory.status === 'deleted';

  return (
    <article class={`group overflow-hidden rounded-3xl border bg-gradient-to-br p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow ${deleted ? 'border-accent-rose/20 from-accent-rose/10 via-dark-950 to-dark-950 opacity-80' : 'border-white/10 from-dark-900 via-dark-950 to-slate-950 hover:border-mint-400/30'}`}>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <button type="button" class="min-w-0 flex-1 text-left focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-mint-400" onClick={onToggle} aria-expanded={expanded}>
          <div class="flex items-start gap-3">
            <span class="mt-1 rounded-2xl bg-mint-400/10 p-2 text-mint-300 transition group-hover:scale-105 group-hover:bg-mint-400/15"><Archive class="h-4 w-4" aria-hidden="true" /></span>
            <span class="min-w-0 flex-1">
              <span class="block break-words text-sm leading-6 text-slate-100">{memory.summary}</span>
              <span class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <MetaPill icon={<Tag class="h-3.5 w-3.5" aria-hidden="true" />} text={classificationLabels[memory.classification]} tone="purple" />
                <MetaPill icon={<Archive class="h-3.5 w-3.5" aria-hidden="true" />} text={storeLabels[memory.store]} tone="blue" />
                <MetaPill icon={<Zap class="h-3.5 w-3.5" aria-hidden="true" />} text={`${copy.feed.strengthLabel} ${formatNumber(memory.strength)}`} tone="amber" />
                <MetaPill icon={<Clock class="h-3.5 w-3.5" aria-hidden="true" />} text={`更新 ${formatDateTime(memory.updatedAt)}`} tone="slate" />
              </span>
            </span>
          </div>
        </button>
        <div class="flex flex-wrap items-center gap-2 lg:justify-end">
          <StatusBadge status={memory.status} />
          <label class="text-xs text-slate-300">
            {copy.feed.reclassify}
            <select class="ml-2 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-slate-100 transition focus-visible:border-mint-400 focus-visible:ring-2 focus-visible:ring-mint-400/40" value={memory.classification} onChange={(event) => void onUpdate(memory.id, { classification: classificationOnlyValue(event.currentTarget.value) })}>
              {classificationOptions().filter(([value]) => value !== 'all').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button class={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs transition focus-visible:ring-2 focus-visible:ring-mint-400 ${deleted ? 'border-mint-400/30 text-mint-200 hover:bg-mint-400/10' : 'border-white/10 text-slate-200 hover:border-accent-rose/40 hover:bg-accent-rose/10 hover:text-rose-100'}`} type="button" onClick={() => { if (deleted || window.confirm(copy.feed.deleteConfirm)) void onUpdate(memory.id, { status: deleted ? 'active' : 'deleted' }); }}>
            {deleted ? <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" /> : <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />}
            {deleted ? copy.feed.restore : copy.feed.delete}
          </button>
        </div>
      </div>
      {expanded ? (
        <dl aria-label={copy.feed.detail} class="mt-4 grid gap-3 border-t border-white/10 pt-4 text-sm text-slate-300 md:grid-cols-3 xl:grid-cols-4 animate-fade-in">
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
  return <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><dt class="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd class="mt-1 break-words text-slate-200">{value}</dd></div>;
}

function MetaPill({ icon, text, tone }: { icon: preact.ComponentChildren; text: string; tone: 'purple' | 'blue' | 'amber' | 'slate' }) {
  const toneClass = {
    purple: 'border-accent-purple/20 bg-accent-purple/10 text-purple-200',
    blue: 'border-accent-blue/20 bg-accent-blue/10 text-blue-200',
    amber: 'border-accent-amber/20 bg-accent-amber/10 text-amber-200',
    slate: 'border-white/10 bg-white/[0.04] text-slate-300',
  }[tone];

  return <span class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${toneClass}`}>{icon}{text}</span>;
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div class="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-400/10 text-mint-300">
        {loading ? <Loader2 class="h-5 w-5 animate-spin" aria-hidden="true" /> : <Search class="h-5 w-5" aria-hidden="true" />}
      </div>
      <p class="mt-3 text-sm font-semibold text-white">{loading ? '正在加载记忆' : '没有匹配的记忆'}</p>
      <p class="mt-1 text-xs text-slate-500">调整筛选条件或等待新的 agent 对话写入记忆。</p>
    </div>
  );
}

function activeFilterSummary(filters: MemoryFilters): string {
  const entries = [
    filters.search ? `搜索“${filters.search}”` : '',
    filters.store && filters.store !== 'all' ? storeLabels[filters.store] : '',
    filters.classification && filters.classification !== 'all' ? classificationLabels[filters.classification] : '',
    filters.status && filters.status !== 'all' ? statusLabels[filters.status] : '',
    filters.project ? `项目 ${filters.project}` : '',
    filters.minStrength !== undefined ? `强度 ≥ ${formatNumber(filters.minStrength)}` : '',
  ].filter((item) => item.length > 0);

  return entries.length > 0 ? entries.join(' / ') : '全部记忆 · 默认展示活跃状态';
}

function cumulativeOffsets(heights: number[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const height of heights) {
    offsets.push(cursor);
    cursor += height;
  }
  return offsets;
}

function visibleIndexRange(offsets: number[], heights: number[], scrollTop: number, viewportHeight: number): { start: number; end: number } {
  if (offsets.length === 0) return { start: 0, end: -1 };

  const lowerBound = Math.max(0, scrollTop - viewportHeight * 0.35);
  const upperBound = scrollTop + viewportHeight * 1.35;
  const rawStart = offsets.findIndex((offset, index) => offset + (heights[index] ?? 0) >= lowerBound);
  const start = Math.max(0, (rawStart === -1 ? offsets.length - 1 : rawStart) - VIRTUAL_OVERSCAN);
  const rawEnd = offsets.findIndex((offset) => offset > upperBound);
  const end = Math.min(offsets.length - 1, (rawEnd === -1 ? offsets.length - 1 : rawEnd) + VIRTUAL_OVERSCAN);

  return { start, end };
}

function estimatedRowHeight(expanded: boolean): number {
  return expanded ? EXPANDED_ROW_ESTIMATED_HEIGHT : COLLAPSED_ROW_HEIGHT;
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
  return value === 'constraint' || value === 'preference' || value === 'learning' || value === 'procedural' || value === 'decision' || value === 'semantic' || value === 'episodic' || value === 'pattern' ? value : 'all';
}

function classificationOnlyValue(value: string): ViewerMemoryClassification {
  const parsed = classificationValue(value);
  return parsed === 'all' ? 'semantic' : parsed;
}

function statusValue(value: string): ViewerMemoryStatus | 'all' {
  return value === 'active' || value === 'decayed' || value === 'deleted' || value === 'established' || value === 'noise' ? value : 'all';
}

function parseOptionalStrength(value: string): number | undefined {
  if (value.trim().length === 0) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : undefined;
}
