import { afterEach, describe, expect, it } from 'vitest';

import { generateConfigWithComments, loadConfig } from '../../src/config/config.js';
import { DEFAULT_USER_CONFIG } from '../../src/types/config.js';

const ORIGINAL_RETRIEVE_ENV = process.env.TRUE_MEM_RETRIEVE_PIPELINE;
const ORIGINAL_SHADOW_ENV = process.env.TRUE_MEM_INGEST_SHADOW;
const ORIGINAL_WRITE_ENV = process.env.TRUE_MEM_INGEST_WRITE;

afterEach(() => {
  restoreEnv('TRUE_MEM_RETRIEVE_PIPELINE', ORIGINAL_RETRIEVE_ENV);
  restoreEnv('TRUE_MEM_INGEST_SHADOW', ORIGINAL_SHADOW_ENV);
  restoreEnv('TRUE_MEM_INGEST_WRITE', ORIGINAL_WRITE_ENV);
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

describe('golden: retrieve pipeline config flag', () => {
  it('defaults retrieve pipeline routing to disabled for safe rollout', () => {
    delete process.env.TRUE_MEM_RETRIEVE_PIPELINE;

    expect(DEFAULT_USER_CONFIG.retrievePipelineEnabled).toBe(0);
  });

  it('allows TRUE_MEM_RETRIEVE_PIPELINE to enable scope-only retrieve routing independently', () => {
    process.env.TRUE_MEM_RETRIEVE_PIPELINE = '1';
    delete process.env.TRUE_MEM_INGEST_SHADOW;
    delete process.env.TRUE_MEM_INGEST_WRITE;

    const config = loadConfig();

    expect(config.retrievePipelineEnabled).toBe(1);
    expect(config.shadowIngestEnabled).toBe(0);
    expect(config.ingestWriteEnabled).toBe(0);
  });

  it('keeps ingest rollout flags independent from retrieve routing', () => {
    process.env.TRUE_MEM_INGEST_SHADOW = '1';
    process.env.TRUE_MEM_INGEST_WRITE = '1';
    delete process.env.TRUE_MEM_RETRIEVE_PIPELINE;

    const config = loadConfig();

    expect(config.shadowIngestEnabled).toBe(1);
    expect(config.ingestWriteEnabled).toBe(1);
    expect(config.retrievePipelineEnabled).toBe(0);
  });

  it('falls back to disabled when TRUE_MEM_RETRIEVE_PIPELINE is invalid', () => {
    process.env.TRUE_MEM_RETRIEVE_PIPELINE = 'yes';

    expect(loadConfig().retrievePipelineEnabled).toBe(0);
  });

  it('documents retrievePipelineEnabled in generated JSONC config', () => {
    const generated = generateConfigWithComments({
      ...DEFAULT_USER_CONFIG,
      retrievePipelineEnabled: 1,
    });

    expect(generated).toContain('Retrieve pipeline');
    expect(generated).toContain('"retrievePipelineEnabled": 1');
  });
});
