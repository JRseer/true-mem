/**
 * User Configuration Manager
 * 
 * Loads and manages user configuration from config.json with env var override.
 * 
 * Priority (highest to lowest):
 * 1. Environment variables (TRUE_MEM_STORAGE_LOCATION, TRUE_MEM_INJECTION_MODE, TRUE_MEM_SUBAGENT_MODE, TRUE_MEM_MAX_MEMORIES, TRUE_MEM_EMBEDDINGS, TRUE_MEM_INGEST_SHADOW, TRUE_MEM_INGEST_WRITE)
 * 2. config.json file
 * 3. Default values
 * 
 * Storage location: ~/.true-mem/ (legacy) or ~/.config/opencode/true-mem/ (opencode)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { log } from '../logger.js';
import type { TrueMemUserConfig, InjectionMode, SubAgentMode, ShadowIngestMode, IngestWriteMode, StorageLocation } from '../types/config.js';
import { DEFAULT_USER_CONFIG } from '../types/config.js';
import { parseJsonc } from '../utils/jsonc.js';
import { getStorageDir } from './paths.js';

/**
 * Parse injection mode from env or return default
 */
function parseInjectionMode(envValue: string | undefined): InjectionMode {
  if (!envValue) return DEFAULT_USER_CONFIG.injectionMode;
  
  const parsed = parseInt(envValue, 10);
  
  if (![0, 1].includes(parsed)) {
    log(`Config: Invalid TRUE_MEM_INJECTION_MODE: ${envValue}, using default (${DEFAULT_USER_CONFIG.injectionMode})`);
    return DEFAULT_USER_CONFIG.injectionMode;
  }
  
  return parsed as InjectionMode;
}

/**
 * Parse sub-agent mode from env or return default
 */
function parseSubAgentMode(envValue: string | undefined): SubAgentMode {
  if (!envValue) return DEFAULT_USER_CONFIG.subagentMode;
  
  const parsed = parseInt(envValue, 10);
  
  if (![0, 1].includes(parsed)) {
    log(`Config: Invalid TRUE_MEM_SUBAGENT_MODE: ${envValue}, using default (${DEFAULT_USER_CONFIG.subagentMode})`);
    return DEFAULT_USER_CONFIG.subagentMode;
  }
  
  return parsed as SubAgentMode;
}

/**
 * Parse max memories from env or return default
 */
function parseMaxMemories(envValue: string | undefined): number {
  if (!envValue) return DEFAULT_USER_CONFIG.maxMemories;
  
  const parsed = parseInt(envValue, 10);
  
  if (isNaN(parsed) || parsed < 1) {
    log(`Config: Invalid TRUE_MEM_MAX_MEMORIES: ${envValue}, using default (${DEFAULT_USER_CONFIG.maxMemories})`);
    return DEFAULT_USER_CONFIG.maxMemories;
  }
  
  if (parsed < 10) {
    log(`Config: Warning TRUE_MEM_MAX_MEMORIES=${parsed} may reduce context quality`);
  }
  if (parsed > 50) {
    log(`Config: Warning TRUE_MEM_MAX_MEMORIES=${parsed} may cause token bloat`);
  }
  
  return parsed;
}

/**
 * Validate embeddings enabled from file config
 * Returns 0 or 1, or default if invalid
 */
function validateEmbeddingsEnabled(value: unknown): number {
  if (value === 0 || value === 1) return value;
  log(`Config: Invalid embeddingsEnabled in file: ${value}, using default`);
  return DEFAULT_USER_CONFIG.embeddingsEnabled;
}

/**
 * Validate shadow ingest from file config.
 * Returns 0 or 1, or default if invalid.
 */
function validateShadowIngestEnabled(value: unknown): ShadowIngestMode {
  if (value === 0 || value === 1) return value;
  log(`Config: Invalid shadowIngestEnabled in file: ${value}, using default`);
  return DEFAULT_USER_CONFIG.shadowIngestEnabled;
}

/**
 * Validate main ingest write cutover from file config.
 * Returns 0 or 1, or default if invalid.
 */
function validateIngestWriteEnabled(value: unknown): IngestWriteMode {
  if (value === 0 || value === 1) return value;
  log(`Config: Invalid ingestWriteEnabled in file: ${value}, using default`);
  return DEFAULT_USER_CONFIG.ingestWriteEnabled;
}

/**
 * Parse embeddings enabled from env or return default
 * Returns 0 or 1 (number for JSONC config compatibility)
 */
function parseEmbeddingsEnabled(envValue: string | undefined): number {
  if (!envValue) return DEFAULT_USER_CONFIG.embeddingsEnabled;
  
  // Validate input is '0' or '1'
  if (envValue !== '0' && envValue !== '1') {
    log(`Config: Invalid TRUE_MEM_EMBEDDINGS: ${envValue}, using default (${DEFAULT_USER_CONFIG.embeddingsEnabled})`);
    return DEFAULT_USER_CONFIG.embeddingsEnabled;
  }
  
  return parseInt(envValue, 10);
}

/**
 * Parse shadow ingest from env or return default.
 * Returns 0 or 1 (number for JSONC config compatibility)
 */
function parseShadowIngestEnabled(envValue: string | undefined): ShadowIngestMode {
  if (!envValue) return DEFAULT_USER_CONFIG.shadowIngestEnabled;

  if (envValue !== '0' && envValue !== '1') {
    log(`Config: Invalid TRUE_MEM_INGEST_SHADOW: ${envValue}, using default (${DEFAULT_USER_CONFIG.shadowIngestEnabled})`);
    return DEFAULT_USER_CONFIG.shadowIngestEnabled;
  }

  return parseInt(envValue, 10) as ShadowIngestMode;
}

/**
 * Parse main ingest write cutover from env or return default.
 * Returns 0 or 1 (number for JSONC config compatibility)
 */
function parseIngestWriteEnabled(envValue: string | undefined): IngestWriteMode {
  if (!envValue) return DEFAULT_USER_CONFIG.ingestWriteEnabled;

  if (envValue !== '0' && envValue !== '1') {
    log(`Config: Invalid TRUE_MEM_INGEST_WRITE: ${envValue}, using default (${DEFAULT_USER_CONFIG.ingestWriteEnabled})`);
    return DEFAULT_USER_CONFIG.ingestWriteEnabled;
  }

  return parseInt(envValue, 10) as IngestWriteMode;
}

/**
 * Parse storage location from env or return default
 */
function parseStorageLocation(envValue: string | undefined): StorageLocation {
  if (envValue === 'legacy' || envValue === 'opencode') {
    return envValue;
  }
  if (envValue !== undefined) {
    log(`Config: Invalid TRUE_MEM_STORAGE_LOCATION: ${envValue}, using default (legacy)`);
  }
  return 'legacy';
}

/**
 * Validate storage location from file config
 * Returns 'legacy' or 'opencode', or default if invalid/missing
 */
function validateStorageLocation(value: unknown): StorageLocation {
  if (value === 'legacy' || value === 'opencode') return value;
  return DEFAULT_USER_CONFIG.storageLocation;
}

// Note: LEGACY_DIR and OPENCODE_DIR constants removed - using getStorageDir() from paths.ts instead

/**
 * Get config directory path based on storage location
 * Delegates to getStorageDir() which provides the same functionality
 */
function getConfigDir(storageLocation: StorageLocation): string {
  return getStorageDir(storageLocation);
}

/**
 * Get config file path based on storage location
 */
function getConfigFile(storageLocation: StorageLocation): string {
  return join(getConfigDir(storageLocation), 'config.jsonc');
}

/**
 * Load user configuration
 * 
 * Flow:
 * 1. Determine storage location (env var first, then file, then default)
 * 2. Load config from that location if exists
 * 3. Override with environment variables (highest priority)
 * 
 * @returns User configuration object
 */
export function loadConfig(): TrueMemUserConfig {
  // Step 1: Determine storage location
  // Priority: ENV > file (if exists) > default 'legacy'
  const envStorageLocation = process.env.TRUE_MEM_STORAGE_LOCATION;
  const parsedStorageLocation = parseStorageLocation(envStorageLocation);
  
  // Try to load from the determined location
  const configFilePath = getConfigFile(parsedStorageLocation);
  let fileConfig: Partial<TrueMemUserConfig> = {};
  
  // Step 2: Load from config.json if exists at the determined location
  if (existsSync(configFilePath)) {
    try {
      const configJson = readFileSync(configFilePath, 'utf-8');
      fileConfig = parseJsonc<Partial<TrueMemUserConfig>>(configJson);
      log(`Config: Loaded from ${configFilePath}`);
    } catch (err) {
      log(`Config: Error reading config.jsonc, using defaults: ${err}`);
    }
  }
  
  // Step 3: Override with environment variables (highest priority)
  const envInjectionMode = process.env.TRUE_MEM_INJECTION_MODE;
  const envSubagentMode = process.env.TRUE_MEM_SUBAGENT_MODE;
  const envMaxMemories = process.env.TRUE_MEM_MAX_MEMORIES;
  const envEmbeddingsEnabled = process.env.TRUE_MEM_EMBEDDINGS;
  const envShadowIngestEnabled = process.env.TRUE_MEM_INGEST_SHADOW;
  const envIngestWriteEnabled = process.env.TRUE_MEM_INGEST_WRITE;
  // envStorageLocation already parsed above

  const config: TrueMemUserConfig = {
    storageLocation: envStorageLocation !== undefined
      ? parseStorageLocation(envStorageLocation)
      : validateStorageLocation(fileConfig.storageLocation),
    injectionMode: envInjectionMode !== undefined
      ? parseInjectionMode(envInjectionMode)
      : (fileConfig.injectionMode ?? DEFAULT_USER_CONFIG.injectionMode),
    subagentMode: envSubagentMode !== undefined
      ? parseSubAgentMode(envSubagentMode)
      : (fileConfig.subagentMode ?? DEFAULT_USER_CONFIG.subagentMode),
    maxMemories: envMaxMemories !== undefined
      ? parseMaxMemories(envMaxMemories)
      : (fileConfig.maxMemories ?? DEFAULT_USER_CONFIG.maxMemories),
    embeddingsEnabled: envEmbeddingsEnabled !== undefined
      ? parseEmbeddingsEnabled(envEmbeddingsEnabled)
      : validateEmbeddingsEnabled(fileConfig.embeddingsEnabled),
    shadowIngestEnabled: envShadowIngestEnabled !== undefined
      ? parseShadowIngestEnabled(envShadowIngestEnabled)
      : validateShadowIngestEnabled(fileConfig.shadowIngestEnabled),
    ingestWriteEnabled: envIngestWriteEnabled !== undefined
      ? parseIngestWriteEnabled(envIngestWriteEnabled)
      : validateIngestWriteEnabled(fileConfig.ingestWriteEnabled),
  };
  
  // Log the final config
  log(`Config: storageLocation=${config.storageLocation}, injectionMode=${config.injectionMode}, subagentMode=${config.subagentMode}, maxMemories=${config.maxMemories}, embeddingsEnabled=${config.embeddingsEnabled}, shadowIngestEnabled=${config.shadowIngestEnabled}, ingestWriteEnabled=${config.ingestWriteEnabled}`);
  
  return config;
}

/**
 * Generate config JSON with comments preserved
 */
export function generateConfigWithComments(config: TrueMemUserConfig): string {
  return `{
  // Storage location: "legacy" = ~/.true-mem/ (default), "opencode" = ~/.config/opencode/true-mem/
  "storageLocation": "${config.storageLocation}",
  
  // Injection mode: 0 = session start only (recommended), 1 = every prompt
  "injectionMode": ${config.injectionMode},
  
  // Sub-agent mode: 0 = disabled, 1 = enabled (default)
  "subagentMode": ${config.subagentMode},
  
  // Embeddings: 0 = Jaccard similarity only, 1 = hybrid (Jaccard + embeddings)
  "embeddingsEnabled": ${config.embeddingsEnabled},
  
  // Ingest shadow-run: 0 = disabled (default), 1 = run new ingest pipeline beside legacy extraction without changing writes
  "shadowIngestEnabled": ${config.shadowIngestEnabled},
  
  // Ingest write cutover: 0 = disabled (default), 1 = route real writes through the new ingest pipeline persist step
  "ingestWriteEnabled": ${config.ingestWriteEnabled},
  
  // Maximum memories to inject per prompt (10-50 recommended)
  "maxMemories": ${config.maxMemories}
}`;
}

/**
 * Save user configuration to disk
 */
export function saveConfig(config: Partial<TrueMemUserConfig>): boolean {
  try {
    const currentConfig = loadConfig();
    const newConfig: TrueMemUserConfig = { ...currentConfig, ...config };
    const storageLocation = newConfig.storageLocation;
    const configDir = getConfigDir(storageLocation);
    const configFile = getConfigFile(storageLocation);
    
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    writeFileSync(configFile, generateConfigWithComments(newConfig));
    log(`Config: Saved to ${configFile}`);
    return true;
  } catch (err) {
    log(`Config: Error saving: ${err}`);
    return false;
  }
}

/**
 * Get injection mode (convenience function)
 */
export function getInjectionMode(): InjectionMode {
  return loadConfig().injectionMode;
}

/**
 * Get sub-agent mode (convenience function)
 */
export function getSubAgentMode(): SubAgentMode {
  return loadConfig().subagentMode;
}

/**
 * Get max memories (convenience function)
 */
export function getMaxMemories(): number {
  return loadConfig().maxMemories;
}

/**
 * Get embeddings enabled from config (convenience function)
 * Returns 0 or 1 (number for JSONC config compatibility)
 */
export function getEmbeddingsEnabledFromConfig(): number {
  return loadConfig().embeddingsEnabled;
}

/**
 * Get ingest shadow-run enabled from config (convenience function).
 */
export function getShadowIngestEnabledFromConfig(): ShadowIngestMode {
  return loadConfig().shadowIngestEnabled;
}

/**
 * Get main ingest write cutover enabled from config (convenience function).
 */
export function getIngestWriteEnabledFromConfig(): IngestWriteMode {
  return loadConfig().ingestWriteEnabled;
}
