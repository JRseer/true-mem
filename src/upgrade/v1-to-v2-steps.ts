import fs from 'node:fs/promises';
import path from 'node:path';
import type { UpgradeSteps } from './runner.js';

export interface V1ToV2UpgradeConfig {
  readonly dataDir: string;
  readonly backupDir: string;
}

export class V1ToV2UpgradeSteps implements UpgradeSteps {
  constructor(private readonly config: V1ToV2UpgradeConfig) {}

  async backup(): Promise<void> {
    const dbPath = path.join(this.config.dataDir, 'memory.db');
    const backupPath = path.join(this.config.backupDir, 'memory.db.v1.bak');
    
    try {
      await fs.mkdir(this.config.backupDir, { recursive: true });
      await fs.copyFile(dbPath, backupPath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw new Error(`Failed to backup database: ${e.message}`);
      }
      // If ENOENT, there's no database to backup (likely fresh install or no memories yet)
    }
  }

  async migrate(): Promise<void> {
    // Shell implementation: the actual SQLite schema migration will be called here
    return Promise.resolve();
  }

  async rebuild(): Promise<void> {
    // Shell implementation: the actual derived index (LanceDB) rebuild will be called here
    return Promise.resolve();
  }

  async verify(): Promise<void> {
    // Shell implementation: run golden smoke tests and scope isolation smoke tests
    return Promise.resolve();
  }
}
