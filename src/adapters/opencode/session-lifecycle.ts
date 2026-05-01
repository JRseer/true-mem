import type { Part } from '../../types.js';
import type { TrueMemoryAdapterState } from './index.js';
import { log } from '../../logger.js';
import { getExtractionQueue } from '../../extraction/queue.js';
import { processSessionIdle } from './process-session.js';

// Queue helper for session idle processing
export function queueExtractionJob(
  state: TrueMemoryAdapterState,
  sessionId?: string
): void {
  const queue = getExtractionQueue();

  queue.add({
    description: `session:${sessionId ?? state.currentSessionId}`,
    execute: async () => {
      await processSessionIdle(state, sessionId);
    },
  });
}

// Session handlers
export async function handleSessionCreated(
  state: TrueMemoryAdapterState,
  sessionId?: string
): Promise<void> {
  if (!sessionId) return;

  state.currentSessionId = sessionId;
  log(`Session created: ${sessionId}`);

  // ✅ Sola creazione sessione - nessun maintenance bloccante
  state.db.createSession(sessionId, state.worktree, { agentType: 'opencode' });
}

export async function handleSessionEnd(
  state: TrueMemoryAdapterState,
  eventType: string,
  sessionId?: string
): Promise<void> {
  const effectiveSessionId = sessionId ?? state.currentSessionId;
  if (!effectiveSessionId) return;

  // ✅ ESEGUI maintenance alla fine della sessione (non blocca startup)
  try {
    const decayed = state.db.applyDecay();
    const promoted = state.db.runConsolidation();
    if (decayed > 0 || promoted > 0) {
      log(`Maintenance: decayed ${decayed} memories, promoted ${promoted} to LTM`);
    }
  } catch (err) {
    log(`Maintenance error: ${err}`);
  }

  const reason = eventType === 'session.error' ? 'abandoned' : 'normal';
  state.db.endSession(effectiveSessionId, reason === 'abandoned' ? 'abandoned' : 'completed');
  state.currentSessionId = null;
  log(`Session ended: ${effectiveSessionId} (${reason})`);
}

export async function handleMessageUpdated(
  state: TrueMemoryAdapterState,
  eventProps: Record<string, unknown> | undefined
): Promise<void> {
  const info = eventProps?.info as { sessionID?: string; role?: string; parts?: Part[] } | undefined;
  const sessionId = info?.sessionID ?? (eventProps?.sessionID as string | undefined) ?? state.currentSessionId;
  if (!sessionId) return;

  if (!state.currentSessionId && sessionId) {
    state.currentSessionId = sessionId;
  }

  // Lazy injection disabled - using atomic injection via tool.execute.before and experimental.chat.system.transform
  // This avoids duplicate injections and provides more context-aware memory retrieval
  // const role = info?.role ?? (eventProps?.role as string | undefined);
  // if (role === 'user' && !state.injectedSessions.has(sessionId)) {
  //   state.injectedSessions.add(sessionId);
  //   log(`Lazy injection for session ${sessionId}`);
  //
  //   // Extract user's message content for contextual retrieval
  //   let userQuery: string | undefined;
  //   const parts = info?.parts ?? (eventProps?.parts as Part[] | undefined);
  //   if (parts && parts.length > 0) {
  //     for (const part of parts) {
  //       if (part.type === 'text' && 'text' in part) {
  //         userQuery = (part as { text: string }).text;
  //         break;
  //       }
  //     }
  //   }
  //
  //   const memories = await getRelevantMemories(state, state.config.opencode.maxSessionStartMemories, userQuery);
  //   if (memories.length > 0) {
  //     const memoryContext = formatMemoriesForInjection(memories, state.worktree);
  //     await injectContext(state, sessionId, memoryContext);
  //     log(`Lazy injection: ${memories.length} memories`);
  //   }
  // }
}

export async function handlePostToolUse(
  state: TrueMemoryAdapterState,
  input: { tool: string; sessionID: string; callID: string; args: unknown },
  output: { title: string; output: string; metadata: unknown }
): Promise<void> {
  const sessionId = state.currentSessionId;
  if (!sessionId) return;
  
  const toolOutput = output.output && output.output.length > 2000
    ? output.output.slice(0, 2000) + '...[truncated]'
    : (output.output ?? '');
  
  state.db.createEvent(sessionId, 'PostToolUse', '', {
    toolName: input.tool,
    toolInput: JSON.stringify(input.args),
    toolOutput,
  });
}
