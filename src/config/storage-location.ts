/**
 * Storage Location Resolution
 *
 * Provides a dependency-free way to resolve storage location.
 * This module has NO imports from other true-mem modules to avoid circular dependencies.
 *
 * Priority:
 * 1. TRUE_MEM_STORAGE_LOCATION env var
 * 2. Default: 'legacy'
 */

import type { StorageLocation } from '../types/config.js';

export function getStorageLocation(): StorageLocation {
  const envValue = process.env.TRUE_MEM_STORAGE_LOCATION;
  if (envValue === 'legacy' || envValue === 'opencode') {
    return envValue;
  }
  return 'legacy';
}
