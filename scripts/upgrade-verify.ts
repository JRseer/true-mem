/**
 * Destructive upgrade runbook dry-run.
 * Run: bun run scripts/upgrade-verify.ts
 */
import { homedir } from 'os';
import { join } from 'path';
import { MemoryDatabase } from '../src/storage/database.js';
import { V1ToV2UpgradeSteps } from '../src/upgrade/v1-to-v2-steps.js';
import { UpgradeRunner } from '../src/upgrade/runner.js';
import type { UpgradeLockStorage } from '../src/upgrade/lock.js';
import type { UpgradeStatus } from '../src/upgrade/state-machine.js';
import { createLanceDBProviderOrUnavailable } from '../src/storage/lancedb-provider.js';

const DATA_DIR = join(homedir(), '.true-mem');
const BACKUP_DIR = join(homedir(), '.true-mem', 'upgrade-backups');

class MemoryLockStorage implements UpgradeLockStorage {
  private locked = false;
  async acquire(): Promise<boolean> {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }
  async release(): Promise<void> { this.locked = false; }
  async readStatus(): Promise<UpgradeStatus | null> { return null; }
  async writeStatus(_status: UpgradeStatus): Promise<void> {}
}

async function main() {
  console.log('=== trueMem v2 Upgrade Dry-Run ===');
  console.log(`Data dir:   ${DATA_DIR}`);
  console.log(`Backup dir: ${BACKUP_DIR}\n`);

  console.log('[0/4] Initializing database...');
  const db = new MemoryDatabase();
  await db.init();
  const activeMemories = db.getMemoriesByScope(undefined, 1000);
  console.log(`  Active memories: ${activeMemories.length}`);

  let vectorProvider;
  try {
    vectorProvider = await createLanceDBProviderOrUnavailable({
      dbPath: join(DATA_DIR, 'lancedb'),
      tableName: 'memory_vectors',
      model: 'all-MiniLM-L6-v2',
      dimension: 384,
    });
    console.log(`  LanceDB: ${vectorProvider.capabilities.providerId}`);
  } catch {
    console.log('  LanceDB: unavailable — rebuild will skip');
  }

  const steps = new V1ToV2UpgradeSteps({
    dataDir: DATA_DIR,
    backupDir: BACKUP_DIR,
    db,
    vectorProvider,
  });

  const runner = new UpgradeRunner(new MemoryLockStorage(), steps);
  const initialStatus: UpgradeStatus = { state: 'ready', updatedAt: new Date() };

  try {
    const finalStatus = await runner.run(initialStatus);
    console.log(`\n=== Upgrade Complete ===`);
    console.log(`Final state: ${finalStatus.state}`);
    if (finalStatus.error) console.log(`Error: ${finalStatus.error}`);
    console.log(`Backup: ${join(BACKUP_DIR, 'memory.db.v1.bak')}`);
    console.log(`\nTo restore: cp ${join(BACKUP_DIR, 'memory.db.v1.bak')} ${join(DATA_DIR, 'memory.db')}`);
  } catch (error) {
    console.error(`\n=== Upgrade FAILED ===`);
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nOriginal database unchanged.');
    console.error(`Backup: ${join(BACKUP_DIR, 'memory.db.v1.bak')}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error('Fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
