import type { PluginInput } from '../../types.js';
import { log } from '../../logger.js';

// Cache for context extraction (avoid repeated API calls)
const contextCache = new Map<string, { context: string; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

/**
 * Extract query context from conversation messages with caching
 * Used for semantic memory retrieval when embeddings are enabled
 */
export async function extractQueryContextFromInput(
  client: PluginInput['client'],
  sessionId: string | undefined
): Promise<string> {
  if (!sessionId) return '';
  
  // Check cache
  const cached = contextCache.get(sessionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log('Using cached context');
    return cached.context;
  }
  
  try {
    // Use the same API as processSessionIdle
    const response = await client.session.messages({ path: { id: sessionId } });
    if (response.error || !response.data) return '';
    
    const messages = response.data;
    const recentMessages = messages.slice(-5); // Last 5 messages
    
    const contextParts: string[] = [];
    for (const msg of recentMessages) {
      for (const part of msg.parts) {
        if (part.type === 'text' && 'text' in part) {
          contextParts.push((part as { text: string }).text);
        }
      }
    }
    
    const fullContext = contextParts.join(' | ');
    const truncatedContext = fullContext.slice(-500); // Truncate to 500 chars
    
    // Update cache
    contextCache.set(sessionId, { context: truncatedContext, timestamp: Date.now() });
    
    return truncatedContext;
  } catch (error) {
    log('Failed to extract query context:', error);
    return '';
  }
}
