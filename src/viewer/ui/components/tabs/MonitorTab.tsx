import { useEffect, useState } from 'preact/hooks';
import type { EmbeddingStatus, HealthResponse, MonitorStatus, UpgradeStateValue } from '../../../shared/types.js';
import { copy } from '../../i18n/zh-CN.js';
import { fetchEmbeddingStatus, fetchHealth, fetchMonitorStatus } from '../../lib/api/client.js';
import { formatDateTime, formatNumber, formatPercent } from '../../lib/format.js';
import { MetricCard } from '../shared/MetricCard.js';

const upgradeStateLabels: Record<UpgradeStateValue, string> = {
  ready: copy.monitor.upgradeReady,
  backing_up: copy.monitor.upgradeBackingUp,
  migrating: copy.monitor.upgradeMigrating,
  rebuilding: copy.monitor.upgradeRebuilding,
  verifying: copy.monitor.upgradeVerifying,
  completed: copy.monitor.upgradeCompleted,
  failed: copy.monitor.upgradeFailed,
};

export function MonitorTab() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbeddingStatus | null>(null);
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const [m, h, e] = await Promise.all([
        fetchMonitorStatus(),
        fetchHealth().catch((): null => null),
        fetchEmbeddingStatus().catch((): null => null),
      ]);
      setStatus(m);
      setHealth(h);
      setEmbedStatus(e);
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

      {/* System info */}
      <SystemInfoCard health={health} />

      {/* Embedding worker (conditional) */}
      {embedStatus?.enabled && <EmbeddingWorkerCard embedStatus={embedStatus} />}

      {/* Metrics */}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={copy.monitor.eventsPerHour} value={formatNumber(status.activityRatePerHour)} />
        <MetricCard label={copy.monitor.errorsPerHour} value={formatNumber(status.errorRatePerHour)} />
        <MetricCard label={copy.monitor.activeSessions} value={formatNumber(status.activeSessions)} />
        <MetricCard label={copy.monitor.activeMemoryRatio} value={formatPercent(status.memoryHealth.activeRatio)} />
      </div>

      {/* Upgrade state */}
      <UpgradeCard upgrade={status.upgrade} />

      {/* Derived index */}
      {status.derivedIndex.total > 0 && <DerivedIndexCard derivedIndex={status.derivedIndex} />}

      {/* Recent events */}
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

function SystemInfoCard({ health }: { health: HealthResponse | null }) {
  return (
    <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
      <h3 class="text-sm font-semibold text-slate-200">{copy.monitor.systemInfo}</h3>
      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <span class="text-slate-400">{copy.monitor.pluginVersion}：</span>
          <span class="text-white">{health?.pluginVersion ?? copy.monitor.unknown}</span>
        </div>
        <div>
          <span class="text-slate-400">{copy.monitor.schemaVersion}：</span>
          <span class="text-white">{health?.schemaVersion ?? copy.monitor.unknown}</span>
        </div>
        <div>
          <span class="text-slate-400">{copy.monitor.storageLocation}：</span>
          <span class="text-white text-xs font-mono">{health?.storageLocation ?? copy.monitor.unknown}</span>
        </div>
      </div>
    </section>
  );
}

function EmbeddingWorkerCard({ embedStatus }: { embedStatus: EmbeddingStatus }) {
  const ready = embedStatus.ready;
  const isDegraded = embedStatus.circuitBreakerActive;

  let statusText: string;
  let statusClass: string;
  if (isDegraded) {
    statusText = copy.monitor.workerDegraded;
    statusClass = 'text-amber-400';
  } else if (!ready) {
    statusText = copy.monitor.workerInitializing;
    statusClass = 'text-amber-400';
  } else {
    statusText = copy.monitor.workerRunning;
    statusClass = 'text-emerald-400';
  }

  return (
    <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
      <h3 class="text-sm font-semibold text-slate-200">{copy.monitor.embeddingWorker}</h3>
      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <span class="text-slate-400">{copy.monitor.workerStatus}：</span>
          <span class={statusClass}>{statusText}</span>
        </div>
        <div>
          <span class="text-slate-400">{ready ? copy.monitor.workerReady : copy.monitor.workerNotReady}：</span>
          <span class={ready ? 'text-emerald-400' : 'text-slate-500'}>{ready ? '✓' : '✗'}</span>
        </div>
        <div>
          <span class="text-slate-400">{copy.monitor.workerFailures}：</span>
          <span class={embedStatus.failureCount > 0 ? 'text-red-400' : 'text-white'}>
            {embedStatus.failureCount}
            {isDegraded ? ` (${copy.monitor.workerCircuitBreaker})` : ''}
          </span>
        </div>
      </div>
    </section>
  );
}

function UpgradeCard({ upgrade }: { upgrade: MonitorStatus['upgrade'] }) {
  if (!upgrade || !upgrade.state) {
    return (
      <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
        <h3 class="text-sm font-semibold text-slate-200">{copy.monitor.upgradeState}</h3>
        <p class="mt-2 text-sm text-slate-500">{copy.monitor.upgradeNone}</p>
      </section>
    );
  }

  const isCompleted = upgrade.state === 'completed';
  const isFailed = upgrade.state === 'failed';
  const stateClass = isCompleted ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-amber-400';

  return (
    <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
      <h3 class="text-sm font-semibold text-slate-200">{copy.monitor.upgradeState}</h3>
      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <span class="text-slate-400">{copy.monitor.workerStatus}：</span>
          <span class={stateClass}>{upgradeStateLabels[upgrade.state] ?? upgrade.state}</span>
        </div>
        <div>
          <span class="text-slate-400">{formatDateTime(upgrade.updatedAt)}</span>
          {upgrade.error ? <span class="ml-1 text-red-400">({upgrade.error})</span> : null}
        </div>
      </div>
    </section>
  );
}

function DerivedIndexCard({ derivedIndex }: { derivedIndex: MonitorStatus['derivedIndex'] }) {
  return (
    <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
      <h3 class="text-sm font-semibold text-slate-200">{copy.monitor.derivedIndex}</h3>
      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <span class="text-slate-400">{copy.monitor.derivedTotal}：</span>
          <span class="text-white">{formatNumber(derivedIndex.total)}</span>
        </div>
        <div>
          <span class="text-slate-400">{copy.monitor.derivedIndexed}：</span>
          <span class="text-emerald-400">{formatNumber(derivedIndex.indexed)}</span>
        </div>
        <div>
          <span class="text-slate-400">{copy.monitor.derivedFailed}：</span>
          <span class={derivedIndex.failed > 0 ? 'text-red-400' : 'text-white'}>{formatNumber(derivedIndex.failed)}</span>
        </div>
        <div>
          <span class="text-slate-400">{copy.monitor.derivedStale}：</span>
          <span class={derivedIndex.stale > 0 ? 'text-amber-400' : 'text-white'}>{formatNumber(derivedIndex.stale)}</span>
        </div>
      </div>
    </section>
  );
}
