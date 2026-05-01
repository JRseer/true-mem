import type { UpgradeStatus } from './state-machine.js';

export interface UpgradeLockStorage {
  acquire(): Promise<boolean>;
  release(): Promise<void>;
  readStatus(): Promise<UpgradeStatus | null>;
  writeStatus(status: UpgradeStatus): Promise<void>;
}
