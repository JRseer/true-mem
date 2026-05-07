/**
 * OpenCode Anti-Corruption Layer.
 *
 * M1 keeps this seam behavior-preserving: OpenCode plugin initialization still
 * delegates to the existing adapter, while future pipeline/scope/storage
 * changes can attach here without leaking infrastructure choices into
 * `src/index.ts`.
 */

import type { Hooks, PluginInput, PsychMemConfig } from '../types.js';
import { createTrueMemoryPlugin } from '../adapters/opencode/index.js';

export async function createOpenCodeHooks(
  ctx: PluginInput,
  configOverrides: Partial<PsychMemConfig> = {}
): Promise<Hooks> {
  return createTrueMemoryPlugin(ctx, configOverrides);
}
