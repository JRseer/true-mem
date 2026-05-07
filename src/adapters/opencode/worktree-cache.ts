import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { StorageLocation } from '../../types.js';
import { getStorageDir } from '../../config/paths.js';

/**
 * Get worktree cache file path based on storage location.
 * Note: Worktree cache is hardcoded to legacy location for backward compatibility
 * with existing users. The worktree cache persists across plugin restarts and
 * contains OpenCode worktree information that should survive storage location changes.
 */
function getWorktreeCacheFile(storageLocation: StorageLocation = 'legacy'): string {
  return join(getStorageDir(storageLocation), '.worktree-cache');
}

export function getPersistedWorktree(): string | null {
  // Use legacy location for backward compatibility
  const worktreeCacheFile = getWorktreeCacheFile('legacy');
  try {
    if (existsSync(worktreeCacheFile)) {
      const cached = readFileSync(worktreeCacheFile, 'utf-8').trim();
      if (cached && cached !== '/' && cached !== '\\' && cached.length > 0) {
        return cached;
      }
    }
  } catch (err) {
    // Silently ignore - will use ctx values instead
  }
  return null;
}

export function setPersistedWorktree(worktree: string): void {
  // Use legacy location for backward compatibility
  const worktreeCacheFile = getWorktreeCacheFile('legacy');
  try {
    writeFileSync(worktreeCacheFile, worktree, 'utf-8');
  } catch (err) {
    // Silently ignore - non-critical feature
  }
}
