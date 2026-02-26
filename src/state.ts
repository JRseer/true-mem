/**
 * Global state for True-Mem plugin
 * Separated to avoid circular imports
 */
import type { MemoryUnit } from './types.js';

// Track last injected memories for "list memories" feature
let lastInjectedMemories: MemoryUnit[] = [];

export function setLastInjectedMemories(memories: MemoryUnit[]): void {
  lastInjectedMemories = memories;
}

export function getLastInjectedMemories(): MemoryUnit[] {
  return lastInjectedMemories;
}
