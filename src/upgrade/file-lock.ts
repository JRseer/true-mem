import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { UpgradeStatus } from './state-machine.js';
import type { UpgradeLockStorage } from './lock.js';

export class UpgradeFileLockStorage implements UpgradeLockStorage {
  private readonly lockFilePath: string;
  private readonly statusFilePath: string;

  constructor(baseDir: string) {
    this.lockFilePath = path.join(baseDir, 'upgrade.lock');
    this.statusFilePath = path.join(baseDir, 'upgrade.state.json');
  }

  async acquire(): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(this.lockFilePath), { recursive: true });
      await fs.writeFile(this.lockFilePath, String(process.pid), { flag: 'wx' });
      return true;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        return false;
      }
      throw err;
    }
  }

  async release(): Promise<void> {
    try {
      await fs.unlink(this.lockFilePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async readStatus(): Promise<UpgradeStatus | null> {
    try {
      const content = await fs.readFile(this.statusFilePath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && typeof parsed.updatedAt === 'string') {
        parsed.updatedAt = new Date(parsed.updatedAt);
      }
      return parsed as UpgradeStatus;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async writeStatus(status: UpgradeStatus): Promise<void> {
    await fs.mkdir(path.dirname(this.statusFilePath), { recursive: true });
    const tempFile = `${this.statusFilePath}.tmp.${randomUUID()}`;
    await fs.writeFile(tempFile, JSON.stringify(status, null, 2), 'utf8');
    await fs.rename(tempFile, this.statusFilePath);
  }
}
