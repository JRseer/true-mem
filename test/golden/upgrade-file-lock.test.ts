import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { UpgradeFileLockStorage } from '../../src/upgrade/file-lock.js';
import type { UpgradeStatus } from '../../src/upgrade/state-machine.js';

describe('golden: upgrade file lock storage', () => {
  const baseDir = path.join(process.cwd(), '.test-tmp', 'upgrade-file-lock');

  beforeEach(async () => {
    await fs.mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('acquires and releases the lock exclusively', async () => {
    const storage1 = new UpgradeFileLockStorage(baseDir);
    const storage2 = new UpgradeFileLockStorage(baseDir);

    const acquired1 = await storage1.acquire();
    expect(acquired1).toBe(true);

    const acquired2 = await storage2.acquire();
    expect(acquired2).toBe(false);

    await storage1.release();

    const acquired3 = await storage2.acquire();
    expect(acquired3).toBe(true);

    const storage = new UpgradeFileLockStorage(baseDir);
    
    let status = await storage.readStatus();
    expect(status).toBeNull();

    const newStatus: UpgradeStatus = {
      state: 'backing_up',
      updatedAt: new Date('2026-04-30T12:00:00.000Z'),
    };

    await storage.writeStatus(newStatus);

    status = await storage.readStatus();
    expect(status).not.toBeNull();
    expect(status?.state).toBe('backing_up');
    expect(status?.updatedAt).toBeInstanceOf(Date);
    expect(status?.updatedAt.getTime()).toBe(new Date('2026-04-30T12:00:00.000Z').getTime());
    
    await storage2.release();
  });

  it('re-throws non-ENOENT errors when reading status', async () => {
    const storage = new UpgradeFileLockStorage(baseDir);
    const statusFilePath = path.join(baseDir, 'upgrade.state.json');
    await fs.mkdir(statusFilePath, { recursive: true }); // Make it a directory to cause read error

    await expect(storage.readStatus()).rejects.toThrow();
  });
});
