import { useEffect, useState } from 'preact/hooks';
import { ChevronDown, ChevronRight, Clock, Zap, Tag, Archive, Loader2 } from 'lucide-preact';
import type { PaginatedSessionsResponse, ViewerSession } from '../../../shared/types.js';
import { copy } from '../../i18n/zh-CN.js';
import { fetchSessions, fetchSessionInjections } from '../../lib/api/client.js';
import { formatDateTime } from '../../lib/format.js';

const EMPTY_RESULT: PaginatedSessionsResponse = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };

export function SessionsTab() {
  const [data, setData] = useState(EMPTY_RESULT);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  async function load(): Promise<void> {
    try {
      setData(await fetchSessions(page, 20));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    }
  }

  useEffect(() => {
    void load();
  }, [page]);

  return (
    <section aria-labelledby="sessions-title" class="space-y-4">
      <div>
        <h2 id="sessions-title" class="text-xl font-semibold text-white">会话列表</h2>
        <p class="mt-1 text-sm text-slate-400">查看所有会话及其记忆注入历史</p>
      </div>

      {error && <p class="text-sm text-red-400">{error}</p>}

      <div class="space-y-3">
        {data.items.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            isExpanded={selectedSession === session.id}
            onToggle={() => setSelectedSession(selectedSession === session.id ? null : session.id)}
          />
        ))}
      </div>

      <div class="flex justify-between items-center">
        <button
          class="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition-all hover:bg-dark-800 hover:border-mint-400/30 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-mint-400"
          type="button"
          disabled={data.page <= 1}
          onClick={() => setPage(Math.max(1, page - 1))}
        >
          <ChevronRight size={16} class="rotate-180" />
          上一页
        </button>
        <span class="text-sm text-slate-400">
          第 {data.page} / {data.totalPages} 页 (共 {data.total} 个会话)
        </span>
        <button
          class="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition-all hover:bg-dark-800 hover:border-mint-400/30 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-mint-400"
          type="button"
          disabled={data.page >= data.totalPages}
          onClick={() => setPage(page + 1)}
        >
          下一页
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}

function SessionRow({
  session,
  isExpanded,
  onToggle,
}: {
  session: ViewerSession;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [injections, setInjections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isExpanded && injections.length === 0) {
      setLoading(true);
      fetchSessionInjections(session.id)
        .then((data) => setInjections(data.injections))
        .catch(() => setInjections([]))
        .finally(() => setLoading(false));
    }
  }, [isExpanded]);

  return (
    <article class="group rounded-2xl border border-white/10 bg-gradient-to-br from-dark-900 to-dark-950 p-4 shadow-soft hover:border-accent-purple/30 transition-all duration-200">
      <button
        type="button"
        class="w-full text-left focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-accent-purple"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="font-mono text-sm text-slate-300">{session.id}</p>
            <p class="mt-1 text-xs text-slate-500">{session.project}</p>
            <div class="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
              <span class="flex items-center gap-1">
                <Clock size={12} />
                {formatDateTime(session.startedAt)}
              </span>
              <span>状态: {session.status}</span>
              <span class="flex items-center gap-1 text-accent-blue">
                <Archive size={12} />
                记忆: {session.memoryCount}
              </span>
              <span class="flex items-center gap-1 text-accent-purple">
                <Zap size={12} />
                注入: {session.injectionCount}
              </span>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown size={20} class="text-accent-purple transition-transform" />
          ) : (
            <ChevronRight size={20} class="text-slate-400 transition-transform" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div class="mt-4 border-t border-white/10 pt-4 animate-fade-in">
          {loading && (
            <div class="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={16} class="animate-spin" />
              加载中...
            </div>
          )}
          {!loading && injections.length === 0 && <p class="text-sm text-slate-400">此会话无记忆注入记录</p>}
          {!loading && injections.length > 0 && (
            <div class="space-y-2">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-white">
                <Zap size={16} class="text-accent-purple" />
                记忆注入时间线 ({injections.length})
              </h3>
              <div class="relative pl-6 space-y-3">
                <div class="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-accent-purple to-transparent"></div>
                {injections.map((inj, i) => (
                  <div key={inj.id} class="relative">
                    <div class="absolute left-[-1.25rem] top-2 w-2 h-2 rounded-full bg-accent-purple ring-4 ring-dark-950"></div>
                    <div class="rounded-lg border border-white/5 bg-dark-900/50 p-3 hover:border-accent-purple/30 transition-all duration-200">
                      <p class="text-sm text-slate-200">{inj.memorySummary}</p>
                      <div class="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span class="flex items-center gap-1">
                          <Tag size={12} />
                          {inj.classification}
                        </span>
                        <span class="flex items-center gap-1">
                          <Archive size={12} />
                          {inj.store}
                        </span>
                        <span class="flex items-center gap-1 text-accent-amber">
                          <Zap size={12} />
                          {inj.relevanceScore?.toFixed(2) ?? 'N/A'}
                        </span>
                        <span class="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDateTime(inj.injectedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
