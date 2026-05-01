import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { V1ToV2UpgradeSteps, type V1ToV2UpgradeConfig } from '../../src/upgrade/v1-to-v2-steps.js';

describe('golden: v1 to v2 upgrade steps shell', () => {
  const testDir = path.join(process.cwd(), '.test-tmp', 'v1-to-v2-steps');
  const dataDir = path.join(testDir, 'data');
  const backupDir = path.join(testDir, 'backup');

  const config: V1ToV2UpgradeConfig = {
    dataDir,
    backupDir,
  };

  beforeEach(async () => {
    await fs.mkdir(dataDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('backs up the database if it exists', async () => {
    const steps = new V1ToV2UpgradeSteps(config);
    const dbPath = path.join(dataDir, 'memory.db');
    await fs.writeFile(dbPath, 'dummy db content');

    await steps.backup();

    const backupPath = path.join(backupDir, 'memory.db.v1.bak');
    const content = await fs.readFile(backupPath, 'utf8');
    expect(content).toBe('dummy db content');
  });

  it('ignores backup if the database does not exist', async () => {
    const steps = new V1ToV2UpgradeSteps(config);

    // Should not throw
    await expect(steps.backup()).resolves.toBeUndefined();
  });

  it('provides shell methods for migrate, rebuild, and verify', async () => {
    const steps = new V1ToV2UpgradeSteps(config);

    await expect(steps.migrate()).resolves.toBeUndefined();
    await expect(steps.rebuild()).resolves.toBeUndefined();
    await expect(steps.verify()).resolves.toBeUndefined();
  });
});
