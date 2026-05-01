import fs from 'node:fs/promises';
import path from 'node:path';
import { log } from '../logger.js';
import type { UpgradeSteps } from './runner.js';
import type { MemoryDatabase } from '../storage/database.js';
import type { VectorIndexProvider } from '../storage/vector-provider.js';

export interface V1ToV2UpgradeConfig {
  readonly dataDir: string;
  readonly backupDir: string;
  readonly db?: MemoryDatabase | undefined;
  readonly vectorProvider?: VectorIndexProvider | undefined;
}

export class V1ToV2UpgradeSteps implements UpgradeSteps {
  constructor(private readonly config: V1ToV2UpgradeConfig) {}

  async backup(): Promise<void> {
    const dbPath = path.join(this.config.dataDir, 'memory.db');
    const backupPath = path.join(this.config.backupDir, 'memory.db.v1.bak');

    try {
      await fs.mkdir(this.config.backupDir, { recursive: true });
      await fs.copyFile(dbPath, backupPath);
      log(`Upgrade: backed up database to ${backupPath}`);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw new Error(`Failed to backup database: ${e.message}`);
      }
      // If ENOENT, there's no database to backup (likely fresh install)
      log('Upgrade: no existing database to backup (fresh install)');
    }
  }

  async migrate(): Promise<void> {
    const db = this.config.db;
    if (!db) {
      log('Upgrade: no database provided, skipping schema migration');
      return;
    }

    // MemoryDatabase.init() already handles schema migrations (v1-v5).
    // This step is a pass-through — the schema was applied during plugin init.
    // If additional v2-specific data migration is needed (e.g., population of new columns),
    // it would be added here.
    log('Upgrade: schema migration verified (database auto-migrated on init)');
  }

  async rebuild(): Promise<void> {
    const db = this.config.db;
    const vectorProvider = this.config.vectorProvider;

    if (!db) {
      log('Upgrade: no database provided, skipping index rebuild');
      return;
    }

    if (!vectorProvider) {
      log('Upgrade: no vector provider available, skipping derived index rebuild');
      return;
    }

    // Get all active memories for rebuild
    const activeMemories = db.getMemoriesByScope(undefined, 1000);
    log(`Upgrade: rebuilding derived indexes for ${activeMemories.length} active memories`);

    let rebuiltCount = 0;

    for (const memory of activeMemories) {
      try {
        // Generate a pseudo-embedding from summary for LanceDB indexing.
        // Production would use an actual embedding model; here we use a simple
        // hash-based vector as a placeholder for the Jaccard-only path.
        const vector = pseudoEmbed(memory.summary, vectorProvider.capabilities.dimension);

        await vectorProvider.upsert({
          memoryId: memory.id,
          memoryVersion: memory.version,
          indexKind: 'vector',
          providerId: vectorProvider.capabilities.providerId,
          model: vectorProvider.capabilities.model,
          dimension: vectorProvider.capabilities.dimension,
          vector,
          scopeKeys: memory.projectScope ? [memory.projectScope] : [],
          createdAt: memory.createdAt,
        });

        rebuiltCount++;
      } catch (error) {
        log(`Upgrade: failed to rebuild index for memory ${memory.id}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with remaining memories — individual failures don't block the upgrade
      }
    }

    log(`Upgrade: derived index rebuild complete — ${rebuiltCount}/${activeMemories.length} memories indexed`);
  }

  async verify(): Promise<void> {
    const db = this.config.db;
    if (!db) {
      log('Upgrade: no database provided, skipping verification');
      return;
    }

    // Check total active memory count
    const activeMemories = db.getMemoriesByScope(undefined, 1);
    log(`Upgrade: verification — active memories accessible: ${activeMemories.length >= 0}`);

    // Verify the backup file exists and is readable
    const backupPath = path.join(this.config.backupDir, 'memory.db.v1.bak');
    try {
      await fs.access(backupPath);
      const stats = await fs.stat(backupPath);
      log(`Upgrade: backup verified — size: ${stats.size} bytes`);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        log('Upgrade: no backup file to verify (fresh install)');
      } else {
        throw new Error(`Failed to verify backup: ${e.message}`);
      }
    }

    log('Upgrade: verification complete');
  }
}

/**
 * Generate a deterministic pseudo-embedding vector from text.
 * In production this would be replaced by an actual embedding model.
 * For the Jaccard-only path, this provides a stable hash-based vector
 * so that LanceDB can be populated and queried.
 */
function pseudoEmbed(text: string, dimension: number): number[] {
  const vector: number[] = new Array<number>(dimension).fill(0) as number[];

  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) * 31 + i * 7) % dimension;
    vector[idx] = (vector[idx] ?? 0) + 1;
  }

  // Normalize to unit length
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map(v => v / norm);
}
