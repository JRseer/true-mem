/**
 * Configuration Migration
 * 
 * Simplified migration for v1.3.0:
 * 1. Delete old config.json if exists (cleanup from v1.2)
 * 2. Create state.json if missing (runtime state)
 * 3. Create config.jsonc if missing (user config with comments)
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { log } from '../logger.js';
import { DEFAULT_USER_CONFIG, DEFAULT_STATE, type TrueMemUserConfig } from '../types/config.js';
import { parseJsonc } from '../utils/jsonc.js';
import { generateConfigWithComments } from './config.js';
import { getStorageDir } from './paths.js';
import type { StorageLocation } from '../types/config.js';
import { getStorageLocation } from './storage-location.js';

/**
 * Run migration if needed
 * 
 * Simple and dumb - no value preservation, just ensure files exist.
 * State is throwaway, so no need to migrate values.
 */
export function migrateIfNeeded(): void {
  const storageLocation = getStorageLocation();
  const configDir = getStorageDir(storageLocation);
  const oldConfigFile = join(configDir, 'config.json'); // old format
  const stateFile = join(configDir, 'state.json');
  const newConfigFile = join(configDir, 'config.jsonc');
  
  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // 1. Delete old config.json if exists (cleanup from v1.2)
  if (existsSync(oldConfigFile)) {
    unlinkSync(oldConfigFile);
    log('Migration: deleted old config.json');
  }
  
  // 2. Create state.json if missing
  if (!existsSync(stateFile)) {
    writeFileSync(stateFile, JSON.stringify(DEFAULT_STATE, null, 2));
    log('Migration: created state.json');
  }
  
  // 3. Create config.jsonc if missing (WITH COMMENTS)
  if (!existsSync(newConfigFile)) {
    writeFileSync(newConfigFile, generateConfigWithComments(DEFAULT_USER_CONFIG));
    log('Migration: created config.jsonc');
  }

  // 4. Update existing config.jsonc with new fields if needed
  if (existsSync(newConfigFile)) {
    try {
      const existing = parseJsonc<TrueMemUserConfig>(readFileSync(newConfigFile, 'utf-8'));
      
      // Check if config needs updating (missing fields)
      const needsUpdate = Object.keys(DEFAULT_USER_CONFIG).some(
        key => !(key in existing)
      );
      
      if (needsUpdate) {
        const merged = { ...DEFAULT_USER_CONFIG, ...existing };
        writeFileSync(newConfigFile, generateConfigWithComments(merged));
        log('Migration: updated config.jsonc with new fields');
      }
    } catch (err) {
      log(`Migration: error updating config.jsonc: ${err}`);
    }
  }
}

/**
 * Force migration (for testing/recovery)
 * Deletes all config files and recreates with defaults
 */
export function forceMigration(): void {
  const storageLocation = getStorageLocation();
  const configDir = getStorageDir(storageLocation);
  const oldConfigFile = join(configDir, 'config.json');
  const stateFile = join(configDir, 'state.json');
  const newConfigFile = join(configDir, 'config.jsonc');
  
  if (existsSync(oldConfigFile)) {
    unlinkSync(oldConfigFile);
  }
  if (existsSync(stateFile)) {
    unlinkSync(stateFile);
  }
  if (existsSync(newConfigFile)) {
    unlinkSync(newConfigFile);
  }
  migrateIfNeeded();
}
