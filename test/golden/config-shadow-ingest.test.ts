import { afterEach, describe, expect, it } from 'vitest';

import { generateConfigWithComments, loadConfig } from '../../src/config/config.js';
import { DEFAULT_USER_CONFIG } from '../../src/types/config.js';

const ORIGINAL_SHADOW_ENV = process.env.TRUE_MEM_INGEST_SHADOW;

afterEach(() => {
  if (ORIGINAL_SHADOW_ENV === undefined) {
    delete process.env.TRUE_MEM_INGEST_SHADOW;
  } else {
    process.env.TRUE_MEM_INGEST_SHADOW = ORIGINAL_SHADOW_ENV;
  }
});

describe('golden: shadow ingest config flag', () => {
  it('defaults shadow ingest to disabled for safe rollout', () => {
    delete process.env.TRUE_MEM_INGEST_SHADOW;

    expect(DEFAULT_USER_CONFIG.shadowIngestEnabled).toBe(0);
  });

  it('allows TRUE_MEM_INGEST_SHADOW to enable shadow-run without changing other config', () => {
    process.env.TRUE_MEM_INGEST_SHADOW = '1';

    expect(loadConfig().shadowIngestEnabled).toBe(1);
  });

  it('falls back to disabled when TRUE_MEM_INGEST_SHADOW is invalid', () => {
    process.env.TRUE_MEM_INGEST_SHADOW = 'yes';

    expect(loadConfig().shadowIngestEnabled).toBe(0);
  });

  it('documents shadowIngestEnabled in generated JSONC config', () => {
    const generated = generateConfigWithComments({
      ...DEFAULT_USER_CONFIG,
      shadowIngestEnabled: 1,
    });

    expect(generated).toContain('Ingest shadow-run');
    expect(generated).toContain('"shadowIngestEnabled": 1');
  });
});
