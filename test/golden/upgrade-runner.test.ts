import { describe, expect, it, vi } from 'vitest';
import { UpgradeRunner, type UpgradeSteps } from '../../src/upgrade/runner.js';
import type { UpgradeLockStorage } from '../../src/upgrade/lock.js';
import type { UpgradeStatus } from '../../src/upgrade/state-machine.js';
import { createInitialStatus } from '../../src/upgrade/state-machine.js';

class InMemoryLockStorage implements UpgradeLockStorage {
  private locked = false;
  private status: UpgradeStatus | null = null;

  async acquire(): Promise<boolean> {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  async release(): Promise<void> {
    this.locked = false;
  }

  async readStatus(): Promise<UpgradeStatus | null> {
    return this.status;
  }

  async writeStatus(status: UpgradeStatus): Promise<void> {
    this.status = status;
  }
}

describe('golden: upgrade runner shell', () => {
  it('executes full upgrade pipeline successfully', async () => {
    const lockStorage = new InMemoryLockStorage();
    const steps: UpgradeSteps = {
      backup: vi.fn().mockResolvedValue(undefined),
      migrate: vi.fn().mockResolvedValue(undefined),
      rebuild: vi.fn().mockResolvedValue(undefined),
      verify: vi.fn().mockResolvedValue(undefined),
    };
    
    let time = 1000;
    const runner = new UpgradeRunner(lockStorage, steps, () => new Date(time++));
    
    const initialStatus = createInitialStatus(new Date(999));
    const finalStatus = await runner.run(initialStatus);

    expect(finalStatus.state).toBe('completed');
    expect(steps.backup).toHaveBeenCalled();
    expect(steps.migrate).toHaveBeenCalled();
    expect(steps.rebuild).toHaveBeenCalled();
    expect(steps.verify).toHaveBeenCalled();

    const storedStatus = await lockStorage.readStatus();
    expect(storedStatus?.state).toBe('completed');
  });

  it('fails safely and persists failure state when a step throws', async () => {
    const lockStorage = new InMemoryLockStorage();
    const steps: UpgradeSteps = {
      backup: vi.fn().mockResolvedValue(undefined),
      migrate: vi.fn().mockRejectedValue(new Error('Migration DB schema locked')),
      rebuild: vi.fn().mockResolvedValue(undefined),
      verify: vi.fn().mockResolvedValue(undefined),
    };
    
    let time = 1000;
    const runner = new UpgradeRunner(lockStorage, steps, () => new Date(time++));
    
    const initialStatus = createInitialStatus(new Date(999));
    
    await expect(runner.run(initialStatus)).rejects.toThrow('Migration DB schema locked');

    expect(steps.backup).toHaveBeenCalled();
    expect(steps.migrate).toHaveBeenCalled();
    expect(steps.rebuild).not.toHaveBeenCalled();
    expect(steps.verify).not.toHaveBeenCalled();

    const storedStatus = await lockStorage.readStatus();
    expect(storedStatus?.state).toBe('failed');
    expect(storedStatus?.error).toBe('Migration DB schema locked');
  });

  it('throws if lock is already held', async () => {
    const lockStorage = new InMemoryLockStorage();
    await lockStorage.acquire(); // simulate locked by another process

    const steps: UpgradeSteps = {
      backup: vi.fn().mockResolvedValue(undefined),
      migrate: vi.fn().mockResolvedValue(undefined),
      rebuild: vi.fn().mockResolvedValue(undefined),
      verify: vi.fn().mockResolvedValue(undefined),
    };
    
    const runner = new UpgradeRunner(lockStorage, steps, () => new Date());
    const initialStatus = createInitialStatus(new Date());
    
    await expect(runner.run(initialStatus)).rejects.toThrow('Upgrade lock is already held by another process.');
  });
});
