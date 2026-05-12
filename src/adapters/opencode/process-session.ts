import { log } from '../../logger.js';
import { getIngestWriteEnabledFromConfig, getShadowIngestEnabledFromConfig } from '../../config/config.js';
import { matchAllPatterns } from '../../memory/patterns.js';
import { 
  classifyWithRoleAwareness, 
  shouldStoreMemory, 
  calculateRoleWeightedScore 
} from '../../memory/classifier.js';
import { 
  hasGlobalScopeKeyword, 
  extractProjectTerms, 
  shouldBeProjectScope 
} from '../../memory/patterns.js';
import { resolveTemporaryTaskMemory } from '../../memory/task-memory.js';
import {
  compareMemoryIngestShadowDecision,
  observeMemoryIngestPipeline,
  observeMemoryIngestShadowPipeline,
  writeMemoryIngestPipeline,
  type MemoryIngestExpectedDecision,
} from '../../pipeline/index.js';
import { 
  extractConversationTextWithRoles, 
  extractCleanSummary, 
  type MessageContainer 
} from './message-parser.js';
import type { TrueMemoryAdapterState } from './index.js';
import type { MemoryClassification } from '../../types.js';
import type { RoleAwareContext } from '../../types.js';
import type { RoleAwareLine } from '../../types.js';

// Global extraction debounce to prevent rapid-fire duplicate extractions
let lastExtractionTime = 0;
const MIN_EXTRACTION_INTERVAL = 2000; // 2 seconds minimum between extractions

const SUPPORTED_PROCESS_CLASSIFICATIONS: readonly MemoryClassification[] = [
  'episodic',
  'semantic',
  'procedural',
  'learning',
  'preference',
  'decision',
  'constraint',
];

function isMemoryClassification(value: string | null): value is MemoryClassification {
  return value !== null && SUPPORTED_PROCESS_CLASSIFICATIONS.includes(value as MemoryClassification);
}

/**
 * Check if enough time has passed since last extraction
 * Prevents race conditions when multiple triggers fire in quick succession
 */
export function canExtract(): boolean {
  const now = Date.now();
  if (now - lastExtractionTime < MIN_EXTRACTION_INTERVAL) {
    log(`Skipping extraction: too soon after last extraction (${now - lastExtractionTime}ms < ${MIN_EXTRACTION_INTERVAL}ms)`);
    return false;
  }
  return true;
}

// Session ID extraction helper
export function getSessionIdFromEvent(properties?: Record<string, unknown>): string | undefined {
  if (!properties) return undefined;
  const info = properties.info as Record<string, unknown> | undefined;
  if (info && typeof info.id === 'string') return info.id;
  if (typeof properties.sessionID === 'string') return properties.sessionID;
  if (typeof properties.id === 'string') return properties.id;
  return undefined;
}

// Sub-agent detection helper
export function isSubAgentSession(sessionId: string): boolean {
  // Heuristic: sub-agent sessions typically contain "-task-" in the ID
  return sessionId.includes('-task-');
}

async function observeShadowIngestForV1Decision(
  state: TrueMemoryAdapterState,
  effectiveSessionId: string,
  humanMsg: RoleAwareLine,
  roleLines: readonly RoleAwareLine[],
  conversationText: string,
  watermark: number,
  messageCount: number,
  expected: MemoryIngestExpectedDecision
): Promise<void> {
  if (getShadowIngestEnabledFromConfig() !== 1) {
    return;
  }

  const recentMessages = roleLines.slice(-20).map(line => line.text);
  const hasAssistantContext = roleLines.some(line => line.role === 'assistant');

  try {
    const shadowContext = await observeMemoryIngestShadowPipeline({
      sessionId: effectiveSessionId,
      worktree: state.worktree,
      trigger: 'session.idle.shadow',
      watermark,
      messageCount,
      manager: state.pipelineManager,
      rawText: humanMsg.text,
      role: humanMsg.role,
      fullConversation: conversationText,
      recentMessages,
      hasAssistantContext,
    });

    const comparison = compareMemoryIngestShadowDecision(expected, shadowContext);

    if (comparison.status === 'matched') {
      log(`Shadow ingest comparison matched for ${expected.classification ?? 'unclassified'} memory`);
      return;
    }

    log(`Shadow ingest comparison ${comparison.status}`, comparison);
  } catch (error) {
    log(`Shadow ingest comparison failed and was isolated: ${error}`);
  }
}

async function writeMemoryThroughIngestPipeline(
  state: TrueMemoryAdapterState,
  effectiveSessionId: string,
  watermark: number,
  messageCount: number,
  expected: MemoryIngestExpectedDecision,
  confidence: number
): Promise<boolean> {
  if (getIngestWriteEnabledFromConfig() !== 1) {
    return false;
  }

  try {
    const writeContext = await writeMemoryIngestPipeline({
      sessionId: effectiveSessionId,
      worktree: state.worktree,
      trigger: 'session.idle.write',
      watermark,
      messageCount,
      manager: state.pipelineManager,
      storage: state.db,
      decision: expected,
      confidence,
    });

    if (!writeContext) {
      log('Pipeline ingest write unavailable; falling back to legacy write path');
      return false;
    }

    log(`Pipeline ingest write completed: ${writeContext.traces.length} run(s) observed for ${writeContext.runId}`);
    return true;
  } catch (error) {
    log(`Pipeline ingest write failed; falling back to legacy write path: ${error}`);
    return false;
  }
}

export async function processSessionIdle(
  state: TrueMemoryAdapterState,
  sessionId?: string
): Promise<void> {
  const effectiveSessionId = sessionId ?? state.currentSessionId;
  if (!effectiveSessionId) return;

  if (sessionId && !state.currentSessionId) {
    state.currentSessionId = sessionId;
  }

  // Skip extraction for sub-agent sessions to avoid duplicate extraction
  if (isSubAgentSession(effectiveSessionId)) {
    log(`Skipping extraction: sub-agent session detected (${effectiveSessionId})`);
    return;
  }

  // Global debounce: prevent rapid-fire extractions from multiple triggers
  if (!canExtract()) {
    return;
  }

  const watermark = state.db.getMessageWatermark(effectiveSessionId);

  let messages: MessageContainer[];
  try {
    const response = await state.client.session.messages({ path: { id: effectiveSessionId } });
    if (response.error) {
      log(`Failed to fetch messages: ${response.error}`);
      return;
    }
    messages = (response.data as unknown as MessageContainer[]) ?? [];
  } catch (error) {
    log(`Failed to fetch messages: ${error}`);
    return;
  }

  try {
    const ingestContext = await observeMemoryIngestPipeline({
      sessionId: effectiveSessionId,
      worktree: state.worktree,
      trigger: 'session.idle',
      watermark,
      messageCount: messages.length,
      manager: state.pipelineManager,
    });

    if (ingestContext) {
      log(`Pipeline trace: ${ingestContext.traces.length} run(s) observed for ${ingestContext.runId}`);
    }
  } catch (error) {
    log(`Pipeline observation failed: ${error}`);
  }

  if (!messages || messages.length <= watermark) return;

  const newMessages = messages.slice(watermark);
  const { text: conversationText, lines: roleLines } = extractConversationTextWithRoles(newMessages);

  log('Debug: Clean conversation text (start):', conversationText.slice(0, 200));
  log('Debug: Role-aware lines extracted:', roleLines.length);

  if (!conversationText.trim()) {
    state.db.updateMessageWatermark(effectiveSessionId, messages.length);
    return;
  }

  // Check for injection markers as a final safety net before processing
  const injectionMarkers = [
    /## Relevant Memories from Previous Sessions/i,
    /### User Preferences & Constraints/i,
    /### .* Context/i,
    /## Compaction Instructions/i,
    /\[LTM\]/i,
    /\[STM\]/i,
    // XML tag removal
    /<true_memory_context[^>]*>/gi,
    /<\/true_memory_context>/gi,
    /<memories[^>]*>/gi,
    /<\/memories>/gi,
  ];

  const hasInjectedContent = injectionMarkers.some(marker => marker.test(conversationText));
  if (hasInjectedContent) {
    log(`WARNING: Conversation contains injection markers (safety check), extractConversationText should have filtered them out`);
    // Don't skip extraction - let the filtered conversationText be processed
  }

  // Extract memories using role-aware classifier
  log(`Processing ${newMessages.length} new messages, ${roleLines.length} lines with role info`);

  // Get signals from patterns (applied to full conversation)
  const signals = matchAllPatterns(conversationText);
  log('Debug: Detected signals:', JSON.stringify(signals));

  let messagesProcessed = 0; // Track successfully processed messages

  if (signals.length > 0) {
    try {
      // Process each Human message with role-aware classification
      const humanMessages = roleLines.filter(line => line.role === 'user');
      log(`Debug: Processing ${humanMessages.length} Human messages for memory extraction`);

      for (const humanMsg of humanMessages) {
        const { text, role } = humanMsg;

        // Get signals specific to this message
        const msgSignals = matchAllPatterns(text);
        if (msgSignals.length === 0) {
          continue; // No signals in this message, skip
        }

        log(`Debug: Processing Human message (${msgSignals.length} signals):`, text.slice(0, 100));

        // Calculate base signal score (average weight of matched signals)
        const baseSignalScore = msgSignals.reduce((sum, s) => sum + s.weight, 0) / msgSignals.length;

        // Apply role weighting (10x for Human messages)
        const roleWeightedScore = calculateRoleWeightedScore(baseSignalScore, role, text);
        log(`Debug: Role-weighted score: ${roleWeightedScore.toFixed(2)} (base: ${baseSignalScore.toFixed(2)})`);

        // Build role-aware context
        const roleAwareContext: RoleAwareContext = {
          primaryRole: role,
          roleWeightedScore,
          hasAssistantContext: roleLines.some(line => line.role === 'assistant'),
          fullConversation: conversationText,
        };

        // Classify with role-awareness
        const { classification, confidence, isolatedContent, roleValidated, validationReason } = classifyWithRoleAwareness(
          text,
          msgSignals,
          roleAwareContext
        );

        // Pre-filter: Skip memories with overly long URLs (>150 chars) or excessive content (>500 chars)
        if (/https?:\/\/[^\s]{150,}/.test(isolatedContent)) {
          log(`Skipped memory: URL too long`);
          continue;
        }

        if (isolatedContent.length > 500) {
          log(`Skipped memory: content too long (${isolatedContent.length} chars)`);
          continue;
        }

        log(`Debug: Classification result: ${classification}, confidence: ${confidence.toFixed(2)}, roleValidated: ${roleValidated}, reason: ${validationReason}`);

        if (isMemoryClassification(classification) && roleValidated) {
          const taskMemory = resolveTemporaryTaskMemory(text);
          const effectiveClassification: MemoryClassification = taskMemory ? 'episodic' : classification;

          // Apply three-layer defense
          const result = shouldStoreMemory(isolatedContent, effectiveClassification, baseSignalScore);
          const cleanSummary = extractCleanSummary(isolatedContent);

          const userLevelClassifications = ['constraint', 'preference', 'learning', 'procedural'];
          const isExplicitIntent = confidence >= 0.85;
          const hasGlobalKeyword = hasGlobalScopeKeyword(text);
          const isUserLevel = userLevelClassifications.includes(effectiveClassification);
          let scope: string | null;

          if (taskMemory) {
            scope = null;
            log(`Debug: Temporary task memory detected for task_scope=${taskMemory.taskScope}, expiresAt=${taskMemory.expiresAt.toISOString()}`);
          } else if (isUserLevel) {
            const recentMessages = roleLines
              .slice(-20)
              .map(line => line.text);

            const context = {
              recentMessages,
              worktree: state.worktree,
              projectTerms: extractProjectTerms(state.worktree),
            };

            const scopeDecision = shouldBeProjectScope(text, context, hasGlobalKeyword);
            scope = scopeDecision.isProjectScope ? state.worktree : null;

            log(`Debug: Contextual scope detection: ${scopeDecision.isProjectScope ? 'PROJECT' : 'GLOBAL'} (confidence: ${scopeDecision.confidence.toFixed(2)}, reason: ${scopeDecision.reason})`);
          } else {
            scope = state.worktree;
          }

          const autoPromoteClassifications = ['learning', 'decision'];
          const shouldPromoteToLtm = effectiveClassification !== 'episodic' &&
            (isExplicitIntent || autoPromoteClassifications.includes(effectiveClassification));
          const store = taskMemory ? 'stm' : (shouldPromoteToLtm ? 'ltm' : 'stm');
          const taskTags = taskMemory
            ? ['temporary-task', 'cross-project', `task:${taskMemory.taskScope}`]
            : undefined;

          await observeShadowIngestForV1Decision(
            state,
            effectiveSessionId,
            humanMsg,
            roleLines,
            conversationText,
            watermark,
            messages.length,
            {
              store: result.store,
              reason: result.reason,
              classification: effectiveClassification,
              cleanSummary,
              storeTarget: store,
              projectScope: scope,
              taskScope: taskMemory?.taskScope,
              expiresAt: taskMemory?.expiresAt,
              tags: taskTags,
            }
          );

          if (result.store) {
            const wroteThroughPipeline = await writeMemoryThroughIngestPipeline(
              state,
              effectiveSessionId,
              watermark,
              messages.length,
              {
                store: result.store,
                reason: result.reason,
                classification: effectiveClassification,
                cleanSummary,
                storeTarget: store,
                projectScope: scope,
                taskScope: taskMemory?.taskScope,
                expiresAt: taskMemory?.expiresAt,
                tags: taskTags,
              },
              confidence
            );

            if (!wroteThroughPipeline) {
              await state.db.createMemory(
                store,
                effectiveClassification,
                cleanSummary,
                [],
                {
                  sessionId: effectiveSessionId,
                  projectScope: scope,
                  taskScope: taskMemory?.taskScope,
                  expiresAt: taskMemory?.expiresAt,
                  importance: confidence,
                  confidence: confidence,
                  tags: taskTags,
                }
              );
            }

            log(`Stored ${effectiveClassification} memory in ${store.toUpperCase()} (confidence: ${confidence.toFixed(2)}, role: ${role}, reason: ${result.reason})`);
            messagesProcessed++;
          } else {
            log(`Skipped ${classification} memory: ${result.reason}`);
          }
        } else if (isMemoryClassification(classification) && !roleValidated) {
          await observeShadowIngestForV1Decision(
            state,
            effectiveSessionId,
            humanMsg,
            roleLines,
            conversationText,
            watermark,
            messages.length,
            {
              store: false,
              reason: validationReason,
              classification,
              cleanSummary: extractCleanSummary(isolatedContent),
            }
          );
          log(`Skipped ${classification} memory: ${validationReason}`);
        }
      }
    } catch (error) {
      log(`Extraction failed with critical error: ${error}`);
      state.db.updateMessageWatermark(effectiveSessionId, messages.length);
      return;
    }
  }

  state.db.updateMessageWatermark(effectiveSessionId, messages.length);
  lastExtractionTime = Date.now();
}
