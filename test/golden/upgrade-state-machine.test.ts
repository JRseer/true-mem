import { describe, expect, it } from 'vitest';

import {
  createInitialStatus,
  transition,
  isTerminal,
  canResume,
  InvalidTransitionError
} from '../../src/upgrade/state-machine.js';

describe('golden: upgrade state machine', () => {
  const now = new Date('2026-04-30T10:00:00Z');
  const later = new Date('2026-04-30T10:01:00Z');

  it('navigates the happy path from ready to completed', () => {
    let status = createInitialStatus(now);
    expect(status.state).toBe('ready');
    expect(isTerminal(status)).toBe(false);

    status = transition(status, { type: 'START' }, later);
    expect(status.state).toBe('backing_up');
    expect(status.updatedAt).toBe(later);

    status = transition(status, { type: 'BACKUP_SUCCESS' }, later);
    expect(status.state).toBe('migrating');

    status = transition(status, { type: 'MIGRATE_SUCCESS' }, later);
    expect(status.state).toBe('rebuilding');

    status = transition(status, { type: 'REBUILD_SUCCESS' }, later);
    expect(status.state).toBe('verifying');

    status = transition(status, { type: 'VERIFY_SUCCESS' }, later);
    expect(status.state).toBe('completed');
    expect(isTerminal(status)).toBe(true);
    expect(canResume(status)).toBe(false);
  });

  it('fails safely and permits retry or restore', () => {
    let status = createInitialStatus(now);
    status = transition(status, { type: 'START' }, later);
    status = transition(status, { type: 'BACKUP_SUCCESS' }, later);
    
    // Fail during migration
    status = transition(status, { type: 'FAIL', error: 'Disk full' }, later);
    expect(status.state).toBe('failed');
    expect(status.error).toBe('Disk full');
    expect(isTerminal(status)).toBe(true);
    expect(canResume(status)).toBe(true);

    // Cannot advance normally from failed
    expect(() => transition(status, { type: 'MIGRATE_SUCCESS' }, later)).toThrow(InvalidTransitionError);

    // Can RESTORE to ready
    const restored = transition(status, { type: 'RESTORE' }, later);
    expect(restored.state).toBe('ready');
    expect(restored.error).toBeUndefined();

    // Can RETRY to backing_up
    const retried = transition(status, { type: 'RETRY' }, later);
    expect(retried.state).toBe('backing_up');
    expect(retried.error).toBeUndefined();
  });

  it('prevents invalid transitions', () => {
    const status = createInitialStatus(now);
    
    expect(() => transition(status, { type: 'BACKUP_SUCCESS' }, later)).toThrow(InvalidTransitionError);
    expect(() => transition(status, { type: 'VERIFY_SUCCESS' }, later)).toThrow(InvalidTransitionError);
    expect(() => transition(status, { type: 'FAIL', error: 'x' }, later)).toThrow(InvalidTransitionError);
    
    const backingUp = transition(status, { type: 'START' }, later);
    expect(() => transition(backingUp, { type: 'START' }, later)).toThrow(InvalidTransitionError);
    expect(() => transition(backingUp, { type: 'MIGRATE_SUCCESS' }, later)).toThrow(InvalidTransitionError);
    
    const completed = { state: 'completed', updatedAt: now } as const;
    expect(() => transition(completed, { type: 'START' }, later)).toThrow(InvalidTransitionError);
    expect(() => transition(completed, { type: 'FAIL', error: 'x' }, later)).toThrow(InvalidTransitionError);
  });
});
