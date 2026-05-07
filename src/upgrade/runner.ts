import { transition, type UpgradeEvent, type UpgradeStatus } from './state-machine.js';
import type { UpgradeLockStorage } from './lock.js';

export interface UpgradeSteps {
  backup(): Promise<void>;
  migrate(): Promise<void>;
  rebuild(): Promise<void>;
  verify(): Promise<void>;
}

export class UpgradeRunner {
  constructor(
    private readonly lockStorage: UpgradeLockStorage,
    private readonly steps: UpgradeSteps,
    private readonly getNow: () => Date = () => new Date()
  ) {}

  async run(initialStatus: UpgradeStatus): Promise<UpgradeStatus> {
    const acquired = await this.lockStorage.acquire();
    if (!acquired) {
      throw new Error('Upgrade lock is already held by another process.');
    }

    try {
      let currentStatus = initialStatus;
      await this.lockStorage.writeStatus(currentStatus);

      if (currentStatus.state === 'ready') {
        currentStatus = await this.performTransition(currentStatus, { type: 'START' });
      }

      if (currentStatus.state === 'backing_up') {
        currentStatus = await this.performStep(currentStatus, () => this.steps.backup(), { type: 'BACKUP_SUCCESS' });
      }

      if (currentStatus.state === 'migrating') {
        currentStatus = await this.performStep(currentStatus, () => this.steps.migrate(), { type: 'MIGRATE_SUCCESS' });
      }

      if (currentStatus.state === 'rebuilding') {
        currentStatus = await this.performStep(currentStatus, () => this.steps.rebuild(), { type: 'REBUILD_SUCCESS' });
      }

      if (currentStatus.state === 'verifying') {
        currentStatus = await this.performStep(currentStatus, () => this.steps.verify(), { type: 'VERIFY_SUCCESS' });
      }

      return currentStatus;
    } finally {
      await this.lockStorage.release();
    }
  }

  private async performTransition(status: UpgradeStatus, event: UpgradeEvent): Promise<UpgradeStatus> {
    const nextStatus = transition(status, event, this.getNow());
    await this.lockStorage.writeStatus(nextStatus);
    return nextStatus;
  }

  private async performStep(
    status: UpgradeStatus,
    action: () => Promise<void>,
    successEvent: UpgradeEvent
  ): Promise<UpgradeStatus> {
    try {
      await action();
      return await this.performTransition(status, successEvent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.performTransition(status, { type: 'FAIL', error: errorMessage });
      throw error;
    }
  }
}
