import { describe, expect, it, vi } from 'vitest';
import type { Hooks, PluginInput } from '@opencode-ai/plugin';

const adapterMock = vi.hoisted(() => ({
  createTrueMemoryPlugin: vi.fn(),
}));

vi.mock('../../src/adapters/opencode/index.js', () => ({
  createTrueMemoryPlugin: adapterMock.createTrueMemoryPlugin,
}));

import { createOpenCodeHooks } from '../../src/acl/opencode.js';

describe('golden: OpenCode ACL seam', () => {
  it('passes plugin context through to the existing adapter without wrapping hooks', async () => {
    const hooks: Hooks = {};
    const ctx = { app: { path: { cwd: 'D:\\Program Files\\trueMem' } } } as unknown as PluginInput;
    const configOverrides = { maxMemories: 7 };

    adapterMock.createTrueMemoryPlugin.mockResolvedValue(hooks);

    const result = await createOpenCodeHooks(ctx, configOverrides);

    expect(adapterMock.createTrueMemoryPlugin).toHaveBeenCalledTimes(1);
    expect(adapterMock.createTrueMemoryPlugin).toHaveBeenCalledWith(ctx, configOverrides);
    expect(result).toBe(hooks);
  });
});
