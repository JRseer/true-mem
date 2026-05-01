import { afterEach, describe, expect, it } from 'vitest';

import { generateConfigWithComments, loadConfig } from '../../src/config/config.js';
import { DEFAULT_USER_CONFIG } from '../../src/types/config.js';

const ORIGINAL_WRITE_ENV = process.env.TRUE_MEM_INGEST_WRITE;
const ORIGINAL_SHADOW_ENV = process.env.TRUE_MEM_INGEST_SHADOW;

afterEach(() => {
  if (ORIGINAL_WRITE_ENV === undefined) {
    delete process.env.TRUE_MEM_INGEST_WRITE;
  } else {
    process.env.TRUE_MEM_INGEST_WRITE = ORIGINAL_WRITE_ENV;
  }

  if (ORIGINAL_SHADOW_ENV === undefined) {
    delete process.env.TRUE_MEM_INGEST_SHADOW;
  } else {
    process.env.TRUE_MEM_INGEST_SHADOW = ORIGINAL_SHADOW_ENV;
  }
});

describe('golden: ingest write cutover config flag', () => {
  it('defaults ingest write cutover to disabled for safe rollout', () => {
    delete process.env.TRUE_MEM_INGEST_WRITE;

    expect(DEFAULT_USER_CONFIG.ingestWriteEnabled).toBe(0);
  });

  it('allows TRUE_MEM_INGEST_WRITE to enable pipeline writes without enabling shadow mode', () => {
    process.env.TRUE_MEM_INGEST_WRITE = '1';
    delete process.env.TRUE_MEM_INGEST_SHADOW;

    const config = loadConfig();

    expect(config.ingestWriteEnabled).toBe(1);
    expect(config.shadowIngestEnabled).toBe(0);
  });

  it('keeps shadow mode independent from the main write cutover flag', () => {
    process.env.TRUE_MEM_INGEST_SHADOW = '1';
    delete process.env.TRUE_MEM_INGEST_WRITE;

    const config = loadConfig();

    expect(config.shadowIngestEnabled).toBe(1);
    expect(config.ingestWriteEnabled).toBe(0);
  });

  it('falls back to disabled when TRUE_MEM_INGEST_WRITE is invalid', () => {
    process.env.TRUE_MEM_INGEST_WRITE = 'yes';

    expect(loadConfig().ingestWriteEnabled).toBe(0);
  });

  it('documents ingestWriteEnabled in generated JSONC config', () => {
    const generated = generateConfigWithComments({
      ...DEFAULT_USER_CONFIG,
      ingestWriteEnabled: 1,
    });

    expect(generated).toContain('Ingest write cutover');
    expect(generated).toContain('"ingestWriteEnabled": 1');
  });
});
