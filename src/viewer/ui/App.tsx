import { useState } from 'preact/hooks';
import { FeedTab } from './components/tabs/FeedTab.js';
import { MonitorTab } from './components/tabs/MonitorTab.js';
import { SettingsTab } from './components/tabs/SettingsTab.js';
import { StatsTab } from './components/tabs/StatsTab.js';
import { copy } from './i18n/zh-CN.js';
import { setTab, state, type ViewerTab } from './state.js';

const TABS: Array<{ id: ViewerTab; label: string; hint: string }> = [
  { id: 'feed', label: copy.app.tabs.feed, hint: copy.app.tabHints.feed },
  { id: 'stats', label: copy.app.tabs.stats, hint: copy.app.tabHints.stats },
  { id: 'monitor', label: copy.app.tabs.monitor, hint: copy.app.tabHints.monitor },
  { id: 'settings', label: copy.app.tabs.settings, hint: copy.app.tabHints.settings },
];

export function App() {
  const [activeTab, setActiveTab] = useState<ViewerTab>(state.tab);

  function activate(tab: ViewerTab): void {
    setTab(tab);
    setActiveTab(tab);
  }

  return (
    <main class="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-7xl space-y-6">
        <header class="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-soft md:flex-row md:items-end md:justify-between">
          <div>
            <p class="text-sm font-medium text-mint-300">{copy.app.product}</p>
            <h1 class="mt-2 text-3xl font-bold tracking-tight text-white">{copy.app.title}</h1>
            <p class="mt-2 max-w-2xl text-sm text-slate-400">{copy.app.description}</p>
          </div>
          <nav aria-label={copy.app.tabsAria} class="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" title={tab.hint} class={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-mint-400 ${activeTab === tab.id ? 'bg-mint-400 text-slate-950' : 'border border-white/10 text-slate-300'}`} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => activate(tab.id)}>
                {tab.label}
              </button>
            ))}
          </nav>
        </header>
        {activeTab === 'feed' ? <FeedTab /> : null}
        {activeTab === 'stats' ? <StatsTab /> : null}
        {activeTab === 'monitor' ? <MonitorTab /> : null}
        {activeTab === 'settings' ? <SettingsTab /> : null}
      </div>
    </main>
  );
}
