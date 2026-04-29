import { useEffect, useState } from 'preact/hooks';
import type { ChartConfiguration } from 'chart.js';
import type { DistributionItem, StatsOverview } from '../../../shared/types.js';
import { classificationLabels, copy, statusLabels, storeLabels } from '../../i18n/zh-CN.js';
import { fetchStats } from '../../lib/api/client.js';
import { formatDateTime, formatNumber } from '../../lib/format.js';
import { ChartCard } from '../shared/ChartCard.js';
import { MetricCard } from '../shared/MetricCard.js';

export function StatsTab() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      setStats(await fetchStats());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.stats.loadError);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!stats) return <p aria-live="polite" class="text-slate-400">{error || copy.stats.loading}</p>;

  const storeItems = localizeDistribution(stats.storeDistribution, storeLabels);
  const classificationItems = localizeDistribution(stats.classificationDistribution, classificationLabels);
  const statusItems = localizeDistribution(stats.statusDistribution, statusLabels);
  const strengthItems: DistributionItem[] = [
    { label: '平均强度', count: stats.strength.average },
    { label: '最低强度', count: stats.strength.min },
    { label: '最高强度', count: stats.strength.max },
    { label: '活跃平均强度', count: stats.strength.activeAverage },
  ];

  return (
    <section aria-labelledby="stats-title" class="space-y-4">
      <div>
        <h2 id="stats-title" class="text-xl font-semibold text-white">{copy.stats.title}</h2>
        <p class="mt-1 text-sm text-slate-400">{copy.stats.description}</p>
      </div>
      <p aria-live="polite" class="text-sm text-slate-400">{error || copy.stats.updated(formatDateTime(stats.generatedAt))}</p>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={copy.stats.totalMemories} value={formatNumber(stats.totals.memories)} />
        <MetricCard label={copy.stats.activeMemories} value={formatNumber(stats.totals.active)} />
        <MetricCard label={copy.stats.sessions} value={formatNumber(stats.totals.sessions)} />
        <MetricCard label={copy.stats.averageStrength} value={formatNumber(stats.strength.average)} />
      </div>
      <div class="grid gap-4 xl:grid-cols-2">
        <ChartCard title={copy.stats.storeDistribution} config={pieConfig(storeItems)} fallbackItems={storeItems} />
        <ChartCard title={copy.stats.classificationDistribution} config={pieConfig(classificationItems)} fallbackItems={classificationItems} />
        <ChartCard title={copy.stats.creationTrend} config={lineConfig(stats.creationTrend.map((item) => item.date), stats.creationTrend.map((item) => item.count))} fallbackItems={stats.creationTrend.map((item) => ({ label: item.date, count: item.count }))} />
        <ChartCard title={copy.stats.statusDistribution} config={barConfig(statusItems)} fallbackItems={statusItems} />
        <ChartCard title={copy.stats.projectDistribution} config={barConfig(stats.projectDistribution)} fallbackItems={stats.projectDistribution} />
        <ChartCard title={copy.stats.strengthMetrics} config={barConfig(strengthItems)} fallbackItems={strengthItems} />
      </div>
    </section>
  );
}

function pieConfig(items: DistributionItem[]): ChartConfiguration<'pie'> {
  return {
    type: 'pie',
    data: { labels: labels(items), datasets: [{ data: values(items), backgroundColor: palette(items.length) }] },
    options: chartOptions(),
  };
}

function barConfig(items: DistributionItem[]): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: { labels: labels(items), datasets: [{ data: values(items), backgroundColor: '#6ee7b7', label: copy.stats.count }] },
    options: chartOptions(),
  };
}

function lineConfig(chartLabels: string[], data: number[]): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: { labels: chartLabels, datasets: [{ data, borderColor: '#6ee7b7', backgroundColor: 'rgba(110, 231, 183, 0.2)', label: copy.stats.created, tension: 0.35 }] },
    options: chartOptions(),
  };
}

function labels(items: DistributionItem[]): string[] {
  return items.map((item) => item.label);
}

function values(items: DistributionItem[]): number[] {
  return items.map((item) => item.count);
}

function palette(length: number): string[] {
  const colors = ['#6ee7b7', '#38bdf8', '#a78bfa', '#fbbf24', '#fb7185', '#94a3b8'];
  return Array.from({ length }, (_, index) => colors[index % colors.length] ?? '#6ee7b7');
}

function chartOptions() {
  return {
    responsive: true,
    plugins: { legend: { labels: { color: '#cbd5e1' } } },
    scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } },
  };
}

function localizeDistribution<T extends string>(items: DistributionItem[], labelsByKey: Record<T | 'all', string>): DistributionItem[] {
  return items.map((item) => ({ ...item, label: labelsByKey[item.label as T] ?? item.label }));
}
