import { useEffect, useState } from 'preact/hooks';
import type { TrueMemUserConfig } from '../../../../types/config.js';
import type { SettingsResponse } from '../../../shared/types.js';
import { copy, settingOptionLabels } from '../../i18n/zh-CN.js';
import { fetchSettings, resetSettings, saveSettings } from '../../lib/api/client.js';

export function SettingsTab() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      setSettings(await fetchSettings());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.settings.loadError);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist(config: TrueMemUserConfig): Promise<void> {
    try {
      setSettings(await saveSettings(config));
      setMessage(copy.settings.saved);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.settings.saveError);
    }
  }

  async function resetToDefaults(): Promise<void> {
    if (!window.confirm(copy.settings.resetConfirm)) return;
    try {
      setSettings(await resetSettings());
      setMessage(copy.settings.saved);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.settings.saveError);
    }
  }

  if (!settings) return <p aria-live="polite" class="text-slate-400">{error || copy.settings.loading}</p>;
  const config = settings.config;

  return (
    <section aria-labelledby="settings-title" class="space-y-4">
      <div>
        <h2 id="settings-title" class="text-xl font-semibold text-white">{copy.settings.title}</h2>
        <p class="mt-1 text-sm text-slate-400">{copy.settings.description}</p>
      </div>
      <p aria-live="polite" class={`text-sm ${error ? 'text-red-200' : 'text-slate-400'}`}>{error || message || copy.settings.path(settings.configPath)}</p>
      <form class="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void persist(config); }}>
        <SelectField label={copy.settings.storageLocation} hint={copy.settings.storageHint} name="storageLocation" value={config.storageLocation} options={storageOptions()} onChange={(value) => setSettings({ ...settings, config: { ...config, storageLocation: value === 'opencode' ? 'opencode' : 'legacy' } })} />
        <SelectField label={copy.settings.injectionMode} hint={copy.settings.injectionHint} name="injectionMode" value={String(config.injectionMode)} options={modeOptions('injectionMode')} onChange={(value) => setSettings({ ...settings, config: { ...config, injectionMode: value === '0' ? 0 : 1 } })} />
        <SelectField label={copy.settings.subagentMode} hint={copy.settings.subagentHint} name="subagentMode" value={String(config.subagentMode)} options={modeOptions('subagentMode')} onChange={(value) => setSettings({ ...settings, config: { ...config, subagentMode: value === '0' ? 0 : 1 } })} />
        <SelectField label={copy.settings.embeddings} hint={copy.settings.embeddingsHint} name="embeddingsEnabled" value={String(config.embeddingsEnabled)} options={modeOptions('embeddingsEnabled')} onChange={(value) => setSettings({ ...settings, config: { ...config, embeddingsEnabled: value === '0' ? 0 : 1 } })} />
        <label class="text-sm text-slate-300">
          {copy.settings.maxMemories}
          <input class="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus-visible:ring-2 focus-visible:ring-mint-400" name="maxMemories" type="number" min="1" max="50" value={config.maxMemories} onInput={(event) => setSettings({ ...settings, config: { ...config, maxMemories: clampMaxMemories(event.currentTarget.value) } })} aria-describedby="max-memories-hint" />
          <span id="max-memories-hint" class="mt-1 block text-xs text-slate-500">{copy.settings.maxMemoriesHint}</span>
        </label>
        <div class="flex items-end gap-3">
          <button class="rounded-xl bg-mint-400 px-4 py-2 font-semibold text-slate-950 focus-visible:ring-2 focus-visible:ring-white" type="submit">{copy.settings.save}</button>
          <button class="rounded-xl border border-red-300/30 px-4 py-2 text-red-200 focus-visible:ring-2 focus-visible:ring-red-300" type="button" onClick={() => void resetToDefaults()}>{copy.settings.reset}</button>
        </div>
      </form>
      <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <h3 class="text-sm font-semibold text-slate-200">{copy.settings.rawJson}</h3>
        <p class="mt-1 text-xs text-slate-500">{copy.settings.rawJsonHint}</p>
        <pre class="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs text-slate-300">{settings.rawJson || copy.settings.emptyConfig}</pre>
      </section>
    </section>
  );
}

function SelectField({ label, hint, name, value, options, onChange }: { label: string; hint: string; name: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label class="text-sm text-slate-300">
      {label}
      <select class="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus-visible:ring-2 focus-visible:ring-mint-400" name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
      <span class="mt-1 block text-xs text-slate-500">{hint}</span>
    </label>
  );
}

function modeOptions(field: 'injectionMode' | 'subagentMode' | 'embeddingsEnabled'): Array<[string, string]> {
  return [['0', optionLabel(`0:${field}`)], ['1', optionLabel(`1:${field}`)]];
}

function storageOptions(): Array<[string, string]> {
  return [['legacy', optionLabel('legacy')], ['opencode', optionLabel('opencode')]];
}

function optionLabel(key: string): string {
  return settingOptionLabels[key] ?? key;
}

function clampMaxMemories(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, parsed));
}
