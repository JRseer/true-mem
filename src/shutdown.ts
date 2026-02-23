/**
 * True-Memory Shutdown Manager
 * Robust shutdown mechanism to prevent Bun crashes and resource leaks
 */

import { log } from './logger.js';

// =============================================================================
// Shutdown Handler Definition
// =============================================================================

export interface ShutdownHandler {
  name: string;
  handler: () => void | Promise<void>;
}

// =============================================================================
// Shutdown Manager Singleton
// =============================================================================

class ShutdownManager {
  private static instance: ShutdownManager;
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;

  private constructor() {
    this.registerProcessListeners();
  }

  public static getInstance(): ShutdownManager {
    if (!ShutdownManager.instance) {
      ShutdownManager.instance = new ShutdownManager();
    }
    return ShutdownManager.instance;
  }

  /**
   * Register process listeners for various shutdown signals
   */
  private registerProcessListeners(): void {
    process.on('beforeExit', () => {
      if (!this.isShuttingDown) {
        log('Shutdown triggered: beforeExit');
        this.executeShutdown('beforeExit').catch(err => {
          log(`Shutdown error: ${err}`);
        });
      }
    });

    process.on('SIGINT', () => {
      if (!this.isShuttingDown) {
        log('Shutdown triggered: SIGINT');
        this.executeShutdown('SIGINT').catch(err => {
          log(`Shutdown error: ${err}`);
        });
      }
    });

    process.on('SIGTERM', () => {
      if (!this.isShuttingDown) {
        log('Shutdown triggered: SIGTERM');
        this.executeShutdown('SIGTERM').catch(err => {
          log(`Shutdown error: ${err}`);
        });
      }
    });

    process.on('SIGHUP', () => {
      if (!this.isShuttingDown) {
        log('Shutdown triggered: SIGHUP');
        this.executeShutdown('SIGHUP').catch(err => {
          log(`Shutdown error: ${err}`);
        });
      }
    });

    log('Shutdown manager: Process listeners registered');
  }

  /**
   * Register a shutdown handler
   * Handlers are executed in reverse registration order (LIFO)
   */
  public registerHandler(name: string, handler: () => void | Promise<void>): void {
    if (this.isShuttingDown) {
      log(`Shutdown warning: Cannot register handler "${name}" during shutdown`);
      return;
    }

    const shutdownHandler: ShutdownHandler = { name, handler };
    this.handlers.push(shutdownHandler);
    log(`Shutdown handler registered: ${name} (total: ${this.handlers.length})`);
  }

  /**
   * Execute all registered shutdown handlers
   * Handlers are executed in reverse registration order (LIFO)
   */
  public async executeShutdown(reason: string): Promise<void> {
    if (this.isShuttingDown && this.shutdownPromise) {
      log(`Shutdown already in progress (${reason}), waiting...`);
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    log(`Starting shutdown sequence: ${reason}`);

    // Create shutdown promise for coordination
    this.shutdownPromise = (async () => {
      // Execute handlers in reverse order (LIFO)
      const reversedHandlers = [...this.handlers].reverse();

      for (const { name, handler } of reversedHandlers) {
        try {
          log(`Executing shutdown handler: ${name}`);
          const startTime = Date.now();
          await Promise.race([
            handler(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Handler timeout after 3 seconds')), 3000)
            ),
          ]);
          const duration = Date.now() - startTime;
          log(`Shutdown handler completed: ${name} (${duration}ms)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log(`Shutdown handler error: ${name} - ${errorMessage}`);
          // Continue with other handlers even if one fails
        }
      }

      log('Shutdown sequence completed');
    })();

    try {
      await this.shutdownPromise;
    } finally {
      this.isShuttingDown = false;
      this.shutdownPromise = null;
    }
  }

  /**
   * Get the list of registered handlers (for debugging)
   */
  public getHandlers(): ReadonlyArray<ShutdownHandler> {
    return [...this.handlers];
  }

  /**
   * Check if shutdown is in progress
   */
  public isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Register a shutdown handler
 * @param name - Handler name for logging
 * @param handler - Async or sync cleanup function
 */
export function registerShutdownHandler(name: string, handler: () => void | Promise<void>): void {
  const manager = ShutdownManager.getInstance();
  manager.registerHandler(name, handler);
}

/**
 * Execute shutdown sequence manually
 * @param reason - Reason for shutdown (for logging)
 */
export async function executeShutdown(reason: string): Promise<void> {
  const manager = ShutdownManager.getInstance();
  await manager.executeShutdown(reason);
}

/**
 * Get registered shutdown handlers (for debugging)
 */
export function getShutdownHandlers(): ReadonlyArray<ShutdownHandler> {
  const manager = ShutdownManager.getInstance();
  return manager.getHandlers();
}

/**
 * Check if shutdown is in progress
 */
export function isShutdownInProgress(): boolean {
  const manager = ShutdownManager.getInstance();
  return manager.isShutdownInProgress();
}

// Initialize shutdown manager on module load
ShutdownManager.getInstance();
