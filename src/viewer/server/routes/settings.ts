import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Hono } from 'hono';
import { loadConfig, saveConfig } from '../../../config/config.js';
import { getStorageDir } from '../../../config/paths.js';
import { DEFAULT_USER_CONFIG, type TrueMemUserConfig } from '../../../types/config.js';

export const settingsRoute = new Hono();

settingsRoute.get('/', (c) => c.json(readSettings()));

settingsRoute.put('/', async (c) => {
  const body: unknown = await c.req.json();
  if (!isConfigPatch(body)) return c.json({ error: 'Invalid settings payload' }, 400);
  if (!saveConfig(body)) return c.json({ error: 'Failed to save settings' }, 500);
  return c.json(readSettings());
});

settingsRoute.post('/reset', (c) => {
  if (!saveConfig(DEFAULT_USER_CONFIG)) return c.json({ error: 'Failed to reset settings' }, 500);
  return c.json(readSettings());
});

function readSettings() {
  const config = loadConfig();
  const configPath = join(getStorageDir(config.storageLocation), 'config.jsonc');
  return {
    config,
    defaults: DEFAULT_USER_CONFIG,
    rawJson: existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '',
    configPath,
  };
}

function isConfigPatch(value: unknown): value is Partial<TrueMemUserConfig> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof TrueMemUserConfig, unknown>>;
  return optionalEnum(candidate.injectionMode, [0, 1])
    && optionalEnum(candidate.subagentMode, [0, 1])
    && optionalEnum(candidate.embeddingsEnabled, [0, 1])
    && optionalEnum(candidate.storageLocation, ['legacy', 'opencode'])
    && (candidate.maxMemories === undefined
      || (typeof candidate.maxMemories === 'number' && Number.isInteger(candidate.maxMemories) && candidate.maxMemories >= 1 && candidate.maxMemories <= 50));
}

function optionalEnum<T extends string | number>(value: unknown, allowed: readonly T[]): boolean {
  return value === undefined || allowed.includes(value as T);
}
