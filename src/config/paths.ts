/**
 * Centralized Storage Path Resolution
 * 
 * Provides unified access to true-mem storage directories.
 * Supports two storage locations:
 * - "legacy" = ~/.true-mem/ (default, backwards compatible)
 * - "opencode" = ~/.config/opencode/true-mem/ (new standard)
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import type { StorageLocation } from '../types/config.js';

const LEGACY_DIR = '.true-mem';
const OPENCOD_E_DIR = '.config/opencode/true-mem';

/**
 * Get storage directory path based on storage location setting
 */
export function getStorageDir(location: StorageLocation): string {
  return location === 'opencode'
    ? join(homedir(), OPENCOD_E_DIR)
    : join(homedir(), LEGACY_DIR);
}

/**
 * Ensure storage directory exists (creates recursively if needed)
 */
export function ensureStorageDir(location: StorageLocation): void {
  const dir = getStorageDir(location);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get database path for a given storage location
 */
export function getDatabasePath(location: StorageLocation): string {
  return join(getStorageDir(location), 'memory.db');
}

/**
 * Get log file path for a given storage location
 */
export function getLogFilePath(location: StorageLocation): string {
  return join(getStorageDir(location), 'plugin-debug.log');
}
