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

const CONFIG_DIR = join(homedir(), '.true-mem');
const OLD_CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const STATE_FILE = join(CONFIG_DIR, 'state.json');
const NEW_CONFIG_FILE = join(CONFIG_DIR, 'config.jsonc');

/**
 * Run migration if needed
 * 
 * Simple and dumb - no value preservation, just ensure files exist.
 * State is throwaway, so no need to migrate values.
 */
export function migrateIfNeeded(): void {
  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // 1. Delete old config.json if exists (cleanup from v1.2)
  if (existsSync(OLD_CONFIG_FILE)) {
    unlinkSync(OLD_CONFIG_FILE);
    log('Migration: deleted old config.json');
  }

  // 2. Create state.json if missing
  if (!existsSync(STATE_FILE)) {
    writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
    log('Migration: created state.json');
  }

  // 3. Create config.jsonc if missing (WITH COMMENTS)
  if (!existsSync(NEW_CONFIG_FILE)) {
    writeFileSync(NEW_CONFIG_FILE, generateConfigWithComments(DEFAULT_USER_CONFIG));
    log('Migration: created config.jsonc');
  }
}

/**
 * Force migration (for testing/recovery)
 * Deletes all config files and recreates with defaults
 */
export function forceMigration(): void {
  if (existsSync(OLD_CONFIG_FILE)) {
    unlinkSync(OLD_CONFIG_FILE);
  }
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
  if (existsSync(NEW_CONFIG_FILE)) {
    unlinkSync(NEW_CONFIG_FILE);
  }
  migrateIfNeeded();
}
