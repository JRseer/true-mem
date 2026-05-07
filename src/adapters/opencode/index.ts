/**
 * True-Mem OpenCode Adapter
 */
const BUILD_TIME = "2026-02-23T09:45:00.000Z";

import type { PluginInput, Hooks, Event, Message, Part } from '../../types.js';
import type { PsychMemConfig, MemoryUnit, RoleAwareContext, RoleAwareLine, MessageRole } from '../../types.js';
import { DEFAULT_CONFIG } from '../../config.js';
import { migrateIfNeeded } from '../../config/migration.js';
import { MemoryDatabase, createMemoryDatabase } from '../../storage/database.js';
import { log } from '../../logger.js';
import {
  shouldStoreMemory,
  classifyWithExplicitIntent,
  classifyWithRoleAwareness,
  calculateRoleWeightedScore,
} from '../../memory/classifier.js';
import { matchAllPatterns, hasGlobalScopeKeyword, isMemoryListRequest, detectProjectSignals, extractProjectTerms, shouldBeProjectScope } from '../../memory/patterns.js';
import { setLastInjectedMemories, getLastInjectedMemories } from '../../state.js';
import { getExtractionQueue } from '../../extraction/queue.js';
import { registerShutdownHandler } from '../../shutdown.js';
import { parseConversationLines } from '../../memory/role-patterns.js';
import { getAtomicMemories, wrapMemories, selectMemoriesForInjection, wrapProactiveContext, type InjectionState } from './injection.js';
import { getVersion } from '../../utils/version.js';
import { loadConfig } from '../../config.js';
import { EmbeddingService } from '../../memory/embeddings-nlp.js';
import { PipelineManager, observeMemoryIngestPipeline, SuggestionQueue } from '../../pipeline/index.js';
import {
  detectFeedbackFromResponse,
  applyFeedbackToQueue,
  applyPatternUtilityUpdates,
} from './suggestion-feedback.js';
import { 
  markSessionCreated, 
  hasInjected, 
  markInjected, 
  ensureSessionTracked,
  shouldInjectResumedSession 
} from './injection-tracker.js';

import { buildCompactionPrompt, formatMemoryListForResponse, formatMemoriesForInjection } from './formatters.js';
import { getRelevantMemories, injectContext } from './memory-retrieval.js';
import { getPersistedWorktree, setPersistedWorktree } from './worktree-cache.js';
import { extractQueryContextFromInput } from './query-context.js';
import { type MessageContainer } from './message-parser.js';
import { processSessionIdle, getSessionIdFromEvent, isSubAgentSession, canExtract } from './process-session.js';
import { handleSessionCreated, handleSessionEnd, handleMessageUpdated, handlePostToolUse, queueExtractionJob } from './session-lifecycle.js';

// Debounce state for message.updated events
let messageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessageEvent: { properties: unknown } | null = null;

// Queue helper for session idle processing
function debounceMessageUpdate(
  state: TrueMemoryAdapterState,
  eventProps: unknown,
  handler: (state: TrueMemoryAdapterState, props: Record<string, unknown> | undefined) => Promise<void>
) {
  pendingMessageEvent = { properties: eventProps };

  if (messageDebounceTimer) {
    clearTimeout(messageDebounceTimer);
  }

  messageDebounceTimer = setTimeout(() => {
    if (pendingMessageEvent) {
      handler(state, pendingMessageEvent.properties as Record<string, unknown> | undefined)
        .catch(err => log(`Message processing error: ${err}`));
    }
    pendingMessageEvent = null;
    messageDebounceTimer = null;
  }, 500); // 500ms debounce
}

// Adapter state
export interface TrueMemoryAdapterState {
  db: MemoryDatabase;
  config: PsychMemConfig;
  currentSessionId: string | null;
  worktree: string;
  client: PluginInput['client'];
  pipelineManager: PipelineManager;
  suggestionQueue: SuggestionQueue;
}

/**
 * Create OpenCode plugin hooks
 */
export async function createTrueMemoryPlugin(
  ctx: PluginInput,
  configOverrides: Partial<PsychMemConfig> = {}
): Promise<Hooks> {
  log('createTrueMemoryPlugin called');
  
  // Run migration if needed (idempotent)
  migrateIfNeeded();
  
  const config: PsychMemConfig = {
    ...DEFAULT_CONFIG,
    ...configOverrides,
  };
  
  // Initialize database
  const db = await createMemoryDatabase(config);
  log('Database initialized');

  // Register shutdown handler for database
  registerShutdownHandler('database', () => db.close());

  // Register shutdown handler for embeddings
  registerShutdownHandler('embeddings', () => {
    const embeddingService = EmbeddingService.getInstance();
    embeddingService.cleanup();
  });

  // Resolve project root with explicit validation
  // P3-1: Prevent falling back to "/" which matches all memories
  const isValidPath = (path: string | undefined): boolean => {
    return !!(path && path !== '/' && path !== '\\' && path.trim().length > 0);
  };

  // FIX #1: Invert cache priority - ctx > directory > cache (fallback)
  // This ensures switching projects works correctly
  // Previous logic gave priority to cache, causing project-scoped memories to leak
  let worktree: string;

  if (isValidPath(ctx.worktree)) {
    worktree = ctx.worktree;
    setPersistedWorktree(worktree);
    log(`Worktree from context: ${worktree}`);
  } else if (isValidPath(ctx.directory)) {
    worktree = ctx.directory;
    setPersistedWorktree(worktree);
    log(`Worktree from directory: ${worktree}`);
  } else {
    const persistedWorktree = getPersistedWorktree();
    if (persistedWorktree && isValidPath(persistedWorktree)) {
      worktree = persistedWorktree;
      log(`Worktree from cache (fallback): ${worktree}`);
    } else {
      worktree = `unknown-project-${Date.now()}`;
      log(`WARNING: Could not determine worktree, using fallback`);
    }
  }

  // FIX #3: Cache invalidation logging - detect project changes for debugging
  const previousWorktree = getPersistedWorktree();
  if (previousWorktree && previousWorktree !== worktree && !worktree.startsWith('unknown-project')) {
    log(`Project changed: ${previousWorktree} -> ${worktree}`);
  }
  
  const state: TrueMemoryAdapterState = {
    db,
    config,
    currentSessionId: null,
    worktree,
    client: ctx.client,
    pipelineManager: new PipelineManager(),
    suggestionQueue: new SuggestionQueue(),
  };

  log(`True-Mem initialized — worktree=${worktree}, maxMemories=${config.maxMemories}`);

  // Extract project name and create professional startup message
  const projectName = worktree.split(/[/\\]/).pop() || 'Unknown';
  const version = getVersion();
  const startupMessage = `🧠 True-Mem: Plugin loaded successfully | v${version} [${BUILD_TIME}] | Mode: Jaccard Similarity | Project: ${projectName}`;

  // Log to file-based logger only (to avoid overwriting OpenCode TUI during lazy initialization)
  log(startupMessage);

  return {
    event: async ({ event }) => {
      // Skip noisy events
      const silentEvents = new Set(['message.part.delta', 'message.part.updated', 'session.diff']);
      if (silentEvents.has(event.type)) return;

      log(`Event: ${event.type}`);
      const sessionId = getSessionIdFromEvent(event.properties);

      switch (event.type) {
        case 'session.created':
          await handleSessionCreated(state, sessionId);
          // Track session for injection mode 1
          if (sessionId) {
            markSessionCreated(sessionId);
          }
          break;
        case 'session.idle':
          // Add extraction job to queue for sequential processing
          queueExtractionJob(state, sessionId);
          break;
        case 'session.deleted':
        case 'session.error':
          await handleSessionEnd(state, event.type, sessionId);
          break;
        case 'message.updated':
          if (state.config.opencode.extractOnMessage) {
            // Debounce message updates to avoid blocking UI
            debounceMessageUpdate(state, event.properties, handleMessageUpdated);
          }
          break;
        case 'server.instance.disposed':
          // OpenCode is disposing the server instance - persist worktree to file for next init
          if (state.worktree && !state.worktree.startsWith('unknown-project')) {
            setPersistedWorktree(state.worktree);
          }
          log('Server instance disposed - worktree preserved for next init');
          break;
      }
    },

    "chat.message": async (input, output) => {
      // Extract user text from parts
      const textParts: string[] = [];
      for (const part of output.parts) {
        if (part.type === 'text' && 'text' in part) {
          textParts.push((part as { text: string }).text);
        }
      }
      const userText = textParts.join(' ');

      if (!userText) return;

      // Check if this is a memory list request
      if (isMemoryListRequest(userText)) {
        const memories = getLastInjectedMemories();

        if (memories.length > 0) {
          const memoryList = formatMemoryListForResponse(memories);

          const firstTextPartIndex = output.parts.findIndex(part => part.type === 'text' && 'text' in part);
          if (firstTextPartIndex !== -1) {
            const originalPart = output.parts[firstTextPartIndex]!;
            if ('text' in originalPart) {
              (output.parts[firstTextPartIndex] as any) = {
                ...originalPart,
                text: `${originalPart.text}\n\n[TRUE-MEM] Ecco le memorie iniettate in questo prompt:\n${memoryList}`
              };
            }
          }

          log(`Memory list request detected: injected ${memories.length} memories`);
        } else {
          const firstTextPartIndex = output.parts.findIndex(part => part.type === 'text' && 'text' in part);
          if (firstTextPartIndex !== -1) {
            const originalPart = output.parts[firstTextPartIndex]!;
            if ('text' in originalPart) {
              (output.parts[firstTextPartIndex] as any) = {
                ...originalPart,
                text: `${originalPart.text}\n\n[TRUE-MEM] Nessuna memoria iniettata in questo prompt.`
              };
            }
          }
        }
      }

      // v3.0: Detect suggestion feedback in user response
      if (state.suggestionQueue.all.filter(s => s.status === 'injected').length > 0) {
        try {
          const feedback = detectFeedbackFromResponse(
            state.suggestionQueue.all,
            userText
          );
          const patternDeltas = applyFeedbackToQueue(state.suggestionQueue, feedback);
          if (patternDeltas.length > 0) {
            // Apply pattern utility updates (strength as proxy)
            for (const { patternId, delta } of patternDeltas) {
              try {
                const memory = state.db.getMemory(patternId);
                if (memory) {
                  const newStrength = Math.max(0, Math.min(1, memory.strength + delta));
                  state.db.updateMemoryStrength(patternId, newStrength);

                  // Auto-transition status based on strength
                  if (newStrength > 0.7 && memory.status === 'active') {
                    state.db.updateMemoryStatus(patternId, 'established');
                  } else if (newStrength < 0.3 && memory.status !== 'noise') {
                    state.db.updateMemoryStatus(patternId, 'noise');
                  }
                }
              } catch {
                // Pattern may have been deleted
              }
            }
            log(`Feedback detected: ${feedback.actedOn.length} acted_on, ${feedback.ignored.length} ignored`);
          }
        } catch (err) {
          log(`Feedback detection error (non-fatal): ${err}`);
        }
      }
    },

    'tool.execute.before': async (input, output) => {
      const toolInput = input as { tool: string; sessionID: string; callID: string };
      const toolName = toolInput.tool;
      log(`tool.execute.before: ${toolName}`);

      // Only inject for task and background_task tools
      if (toolName !== 'task' && toolName !== 'background_task') {
        return;
      }

      // NEW: Check sub-agent mode config
      const subAgentMode = state.config.opencode.injection?.subAgentMode ?? 1;
      if (subAgentMode === 0) {
        log('Sub-agent injection disabled by config');
        return;
      }

      // Extract prompt from output args
      const outputWithArgs = output as { args: { prompt?: string } };
      const originalPrompt = outputWithArgs.args?.prompt;
      if (!originalPrompt) {
        return;
      }

      // Retrieve relevant memories using atomic injection
      try {
        const injectionState: InjectionState = {
          db: state.db,
          worktree: state.worktree,
        };

        const memories = await getAtomicMemories(injectionState, originalPrompt, 10);

        if (memories.length > 0) {
          const wrappedContext = wrapMemories(memories, state.worktree, 'project');

          // Update the prompt in output args
          outputWithArgs.args.prompt = `${wrappedContext}\n\n${originalPrompt}`;

          log(`Atomic injection: ${memories.length} memories injected for ${toolName}`);
        }
      } catch (error) {
        log(`Atomic injection failed for ${toolName}: ${error}`);
        // Continue without injection on error
      }
    },

    'tool.execute.after': async (input, output) => {
      log(`tool.execute.after: ${input.tool}`);

      if (!state.currentSessionId && input.sessionID) {
        state.currentSessionId = input.sessionID;
      }

      if (!state.currentSessionId) return;

      await handlePostToolUse(state, input, output);
    },

    'experimental.chat.system.transform': async (input, output) => {
      const sessionId = input.sessionID ?? state.currentSessionId ?? undefined;
      const injectionMode = state.config.opencode.injection?.mode ?? 0;

      // FIX #4: Runtime worktree validation - update if ctx changed mid-session
      // This handles the case where user switches projects within the same session
      // Note: ctx is from the outer plugin scope, not the input object
      if (isValidPath(ctx.worktree) && ctx.worktree !== state.worktree) {
        log(`Worktree changed mid-session: ${state.worktree} -> ${ctx.worktree}`);
        state.worktree = ctx.worktree;
        setPersistedWorktree(ctx.worktree);
      }
      
      // Ensure session is tracked
      if (sessionId) {
        ensureSessionTracked(sessionId);
      }

      // Mode 0: SESSION_START - Inject only once per session (default)
      if (injectionMode === 0 && sessionId) {
        if (hasInjected(sessionId)) {
          log(`Skipping injection: already injected for session ${sessionId.slice(0, 8)}...`);
          return;
        }
        
        // Check if this is a resumed session that already has memory context
        const shouldInject = await shouldInjectResumedSession(state.client, sessionId);
        if (!shouldInject) {
          markInjected(sessionId); // Mark immediately to prevent race condition
          log(`Skipping injection: resumed session already has memory context`);
          return;
        }
      }
      
      // Mode 1: ALWAYS - Continue with injection (legacy behavior)
      log(`Injecting memories (mode=${injectionMode})`);

      try {
        // Extract context from conversation (convert null to undefined for type safety)
        const sessionId = input.sessionID ?? state.currentSessionId ?? undefined;
        const queryContext = await extractQueryContextFromInput(
          state.client,
          sessionId
        );
        
        // Check if embeddings are enabled
        const embeddingsEnabled = process.env.TRUE_MEM_EMBEDDINGS === '1';
        
        // Use smart selection instead of getMemoriesByScope
        const allMemories = await selectMemoriesForInjection(
          state.db,
          state.worktree,
          queryContext,
          embeddingsEnabled,
          state.config.maxMemories,
          state.config.maxTokensForMemories
        );

        // Save to global state for "list memories" feature
        setLastInjectedMemories(allMemories);

        if (allMemories.length > 0) {
          const wrappedContext = wrapMemories(allMemories, state.worktree, 'global');

          // Handle system as string[] - append to the last element
          const systemArray = Array.isArray(output.system) ? output.system : [output.system];
          const lastElement = systemArray[systemArray.length - 1] || '';
          systemArray[systemArray.length - 1] = `${lastElement}\n\n${wrappedContext}`;

          output.system = systemArray;

          // v3.0: Inject proactive suggestions after memories
          const userConfig = loadConfig();
          if (userConfig.proactiveEnabled !== 0) {
            const proactiveXml = wrapProactiveContext(
              state.suggestionQueue.getActive(),
              userConfig.maxSuggestionsPerPrompt
            );
            if (proactiveXml) {
              systemArray[systemArray.length - 1] = `${systemArray[systemArray.length - 1]}\n\n${proactiveXml}`;
              output.system = systemArray;
              log(`Proactive context injected: ${state.suggestionQueue.pendingCount} pending suggestions`);
            }
          }

          // Mark as injected after successful injection (mode 0 = session-start)
          if (injectionMode === 0 && sessionId) {
            markInjected(sessionId);
          }
          
          log(`Global injection: ${allMemories.length} memories injected into system prompt [embeddings=${embeddingsEnabled}]`);
        }
      } catch (error) {
        log(`Global injection failed: ${error}`);
        // Continue without injection on error
      }
    },

    'experimental.session.compacting': async (input, output) => {
      log('Compaction hook triggered');

      const sessionId = input.sessionID ?? state.currentSessionId;

      if (state.config.opencode.injectOnCompaction) {
        const memories = await getRelevantMemories(state, state.config.opencode.maxCompactionMemories);

        if (memories.length > 0) {
          const memoryContext = formatMemoriesForInjection(memories, state.worktree);
          output.prompt = buildCompactionPrompt(memoryContext);
          log(`Injected ${memories.length} memories into compaction`);
        } else {
          output.prompt = buildCompactionPrompt(null);
        }
      }
    },
  };
}

export default createTrueMemoryPlugin;
