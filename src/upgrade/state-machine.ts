export type UpgradeState =
  | 'ready'
  | 'backing_up'
  | 'migrating'
  | 'rebuilding'
  | 'verifying'
  | 'completed'
  | 'failed';

export type UpgradeEvent =
  | { type: 'START' }
  | { type: 'BACKUP_SUCCESS' }
  | { type: 'MIGRATE_SUCCESS' }
  | { type: 'REBUILD_SUCCESS' }
  | { type: 'VERIFY_SUCCESS' }
  | { type: 'FAIL'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESTORE' };

export interface UpgradeStatus {
  readonly state: UpgradeState;
  readonly error?: string;
  readonly updatedAt: Date;
}

export class InvalidTransitionError extends Error {
  constructor(public readonly from: UpgradeState, public readonly event: UpgradeEvent['type']) {
    super(`Invalid transition from ${from} using event ${event}`);
    this.name = 'InvalidTransitionError';
  }
}

export function transition(current: UpgradeStatus, event: UpgradeEvent, now: Date): UpgradeStatus {
  switch (current.state) {
    case 'ready':
      if (event.type === 'START') {
        return { state: 'backing_up', updatedAt: now };
      }
      break;
    
    case 'backing_up':
      if (event.type === 'BACKUP_SUCCESS') {
        return { state: 'migrating', updatedAt: now };
      }
      if (event.type === 'FAIL') {
        return { state: 'failed', error: event.error, updatedAt: now };
      }
      break;

    case 'migrating':
      if (event.type === 'MIGRATE_SUCCESS') {
        return { state: 'rebuilding', updatedAt: now };
      }
      if (event.type === 'FAIL') {
        return { state: 'failed', error: event.error, updatedAt: now };
      }
      break;

    case 'rebuilding':
      if (event.type === 'REBUILD_SUCCESS') {
        return { state: 'verifying', updatedAt: now };
      }
      if (event.type === 'FAIL') {
        return { state: 'failed', error: event.error, updatedAt: now };
      }
      break;

    case 'verifying':
      if (event.type === 'VERIFY_SUCCESS') {
        return { state: 'completed', updatedAt: now };
      }
      if (event.type === 'FAIL') {
        return { state: 'failed', error: event.error, updatedAt: now };
      }
      break;

    case 'failed':
      if (event.type === 'RETRY') {
        // Simple retry semantics: we could store the previous state, 
        // but for safety, a general retry might start from backing_up or rebuilding.
        // For the state machine, let's say RETRY goes to backing_up to ensure clean slate.
        return { state: 'backing_up', updatedAt: now };
      }
      if (event.type === 'RESTORE') {
        return { state: 'ready', updatedAt: now };
      }
      break;

    case 'completed':
      // Terminal state
      break;
  }

  throw new InvalidTransitionError(current.state, event.type);
}

export function createInitialStatus(now: Date): UpgradeStatus {
  return { state: 'ready', updatedAt: now };
}

export function isTerminal(status: UpgradeStatus): boolean {
  return status.state === 'completed' || status.state === 'failed';
}

export function canResume(status: UpgradeStatus): boolean {
  return status.state === 'failed';
}
