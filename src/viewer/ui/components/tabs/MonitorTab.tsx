import { useEffect, useState } from 'preact/hooks';
import type { MonitorStatus } from '../../../shared/types.js';
import { copy } from '../../i18n/zh-CN.js';
import { fetchMonitorStatus } from '../../lib/api/client.js';
import { formatDateTime, formatNumber, formatPercent } from '../../lib/format.js';
import { MetricCard } from '../shared/MetricCard.js';

export function MonitorTab() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      setStatus(await fetchMonitorStatus());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.monitor.loadError);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!status) return <p aria-live="polite" class="text-slate-400">{error || copy.monitor.loading}</p>;

  return (
    <section aria-labelledby="monitor-title" class="space-y-4">
      <div>
        <h2 id="monitor-title" class="text-xl font-semibold text-white">{copy.monitor.title}</h2>
        <p class="mt-1 text-sm text-slate-400">{copy.monitor.description}</p>
      </div>
      <p aria-live="polite" class="text-sm text-slate-400">{error || copy.monitor.inferred(formatDateTime(status.generatedAt))}</p>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={copy.monitor.eventsPerHour} value={formatNumber(status.activityRatePerHour)} />
        <MetricCard label={copy.monitor.errorsPerHour} value={formatNumber(status.errorRatePerHour)} />
        <MetricCard label={copy.monitor.activeSessions} value={formatNumber(status.activeSessions)} />
        <MetricCard label={copy.monitor.activeMemoryRatio} value={formatPercent(status.memoryHealth.activeRatio)} />
      </div>
      <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
        <h3 class="text-sm font-semibold text-slate-200">{copy.monitor.recentEvents}</h3>
        <ol class="mt-4 space-y-3">
          {status.recentEvents.map((event) => (
            <li key={event.id} class="rounded-xl bg-slate-950/70 p-3">
              <p class="text-sm text-slate-100">{event.summary}</p>
              <p class="mt-1 text-xs text-slate-500">{event.hookType} · {formatDateTime(event.timestamp)} · {event.toolName ?? copy.common.noTool}</p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
