/**
 * Configuration Migration
 * 
 * Simplified migration for v1.3.0:
 * 1. Delete old config.json if exists (cleanup from v1.2)
 * 2. Create state.json if missing (runtime state)
 * 3. Create config.jsonc if missing (user config with comments)
 */

import { writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { log } from '../logger.js';
import { DEFAULT_USER_CONFIG, DEFAULT_STATE } from '../types/config.js';
import { generateConfigWithComments } from './config.js';
import { getStorageDir } from './paths.js';
import type { StorageLocation } from '../types/config.js';

/**
 * Run migration if needed
 * 
 * Simple and dumb - no value preservation, just ensure files exist.
 * State is throwaway, so no need to migrate values.
 */
export function migrateIfNeeded(): void {
  // Get storage location from config or default to legacy
  let storageLocation: StorageLocation = 'legacy';
  try {
    const { loadConfig } = require('./config.js');
    storageLocation = loadConfig().storageLocation;
  } catch {
    // Config not loaded yet, use legacy
  }
  
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
}

/**
 * Force migration (for testing/recovery)
 * Deletes all config files and recreates with defaults
 */
export function forceMigration(): void {
  // Get storage location from config or default to legacy
  let storageLocation: StorageLocation = 'legacy';
  try {
    const { loadConfig } = require('./config.js');
    storageLocation = loadConfig().storageLocation;
  } catch {
    // Config not loaded yet, use legacy
  }
  
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
