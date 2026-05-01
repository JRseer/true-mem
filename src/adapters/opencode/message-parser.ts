import type { Message, Part } from '../../types.js';
import type { MessageRole, RoleAwareLine } from '../../types.js';

// Message container type matching SDK response
export interface MessageContainer {
  info: Message;
  parts: Part[];
}

export function extractCleanSummary(conversationText: string, maxLength: number = 500): string {
  // Remove role prefixes
  let cleaned = conversationText
    .replace(/^(Human|Assistant):\s*/gm, '')
    .replace(/\n+/g, ' ')
    .trim();

  // Remove any remaining injection markers (second line of defense)
  const injectionMarkers = [
    /## Relevant Memories from Previous Sessions/gi,
    /### User Preferences & Constraints/gi,
    /### .* Context/gi,
    /## Compaction Instructions/gi,
    /\[LTM\]/gi,
    /\[STM\]/gi,
    /\[TRUE-MEM\]/gi,  // Filter out memory list responses to prevent auto-reference loop
    // XML tag removal
    /<true_memory_context[^>]*>/gi,
    /<\/true_memory_context>/gi,
    /<memories[^>]*>/gi,
    /<\/memories>/gi,
  ];

  for (const marker of injectionMarkers) {
    cleaned = cleaned.replace(marker, '');
  }

  // Normalize whitespace after marker removal
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Truncate if necessary, try to break at word boundaries
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  // Find last complete word within limit
  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

export function extractConversationText(messages: MessageContainer[]): string {
  const lines: string[] = [];

  // Regex patterns that indicate injected content (case-insensitive, should be filtered out)
  const injectionMarkers = [
    /## Relevant Memories from Previous Sessions/i,
    /### User Preferences & Constraints/i,
    /### .* Context/i,  // Matches "### ProjectName Context" pattern
    /## Compaction Instructions/i,
    /\[LTM\]/i,
    /\[STM\]/i,
    /\[TRUE-MEM\]/i,  // Filter out memory list responses to prevent auto-reference loop
    // XML tag removal
    /<true_memory_context[^>]*>/gi,
    /<\/true_memory_context>/gi,
    /<memories[^>]*>/gi,
    /<\/memories>/gi,
  ];

  // Regex patterns that indicate tool execution or results (should be filtered out)
  const toolMarkers = [
    /\[Tool:\s*\w+\]/i,
    /^Tool Result:/i,
    /^Tool Error:/i,
    /<tool_use>[\s\S]*?<\/tool_use>/gi,  // Strip <tool_use> blocks
    /<tool_result>[\s\S]*?<\/tool_result>/gi,  // Strip <tool_result> blocks
    /```json[\s\S]*?"tool"[\s\S]*?```/gi,  // Strip JSON blobs with tool
  ];

  for (const msg of messages) {
    const role = msg.info.role === 'user' ? 'Human' : 'Assistant';

    for (const part of msg.parts) {
      if (part.type === 'text' && 'text' in part) {
        const text = (part as { text: string }).text;

        // Skip parts that contain any injection marker (prevents re-extracting injected content)
        const hasInjectionMarker = injectionMarkers.some(marker => marker.test(text));
        if (hasInjectionMarker) {
          continue; // Skip this part entirely
        }

        // Skip parts that look like tool execution or results
        const hasToolMarker = toolMarkers.some(marker => marker.test(text));
        if (hasToolMarker) {
          continue; // Skip this part entirely
        }

        lines.push(`${role}: ${text}`);
      } else if (part.type === 'tool') {
        const toolPart = part as { tool?: string; state?: { status?: string; output?: string; error?: string } };
        if (toolPart.state?.status === 'completed' || toolPart.state?.status === 'error') {
          lines.push(`Assistant: [Tool: ${toolPart.tool}]`);
          if (toolPart.state.output) lines.push(`Tool Result: ${toolPart.state.output.slice(0, 2000)}`);
          if (toolPart.state.error) lines.push(`Tool Error: ${toolPart.state.error}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Extract conversation text with role information
 * Returns both the text and role-aware line information
 */
export function extractConversationTextWithRoles(messages: MessageContainer[]): {
  text: string;
  lines: RoleAwareLine[];
} {
  const textLines: string[] = [];
  const roleLines: RoleAwareLine[] = [];

  // Regex patterns that indicate injected content (case-insensitive, should be filtered out)
  const injectionMarkers = [
    /## Relevant Memories from Previous Sessions/i,
    /### User Preferences & Constraints/i,
    /### .* Context/i,  // Matches "### ProjectName Context" pattern
    /## Compaction Instructions/i,
    /\[LTM\]/i,
    /\[STM\]/i,
    /\[TRUE-MEM\]/i,  // Filter out memory list responses to prevent auto-reference loop
    // XML tag removal
    /<true_memory_context[^>]*>/gi,
    /<\/true_memory_context>/gi,
    /<memories[^>]*>/gi,
    /<\/memories>/gi,
  ];

  // Regex patterns that indicate tool execution or results (should be filtered out)
  const toolMarkers = [
    /\[Tool:\s*\w+\]/i,
    /^Tool Result:/i,
    /^Tool Error:/i,
    /<tool_use>[\s\S]*?<\/tool_use>/gi,  // Strip <tool_use> blocks
    /<tool_result>[\s\S]*?<\/tool_result>/gi,  // Strip <tool_result> blocks
    /```json[\s\S]*?"tool"[\s\S]*?```/gi,  // Strip JSON blobs with tool
  ];

  for (const msg of messages) {
    const role: MessageRole = msg.info.role === 'user' ? 'user' : 'assistant';
    const roleLabel = role === 'user' ? 'Human' : 'Assistant';

    for (const part of msg.parts) {
      if (part.type === 'text' && 'text' in part) {
        const text = (part as { text: string }).text;

        // Skip parts that contain any injection marker (prevents re-extracting injected content)
        const hasInjectionMarker = injectionMarkers.some(marker => marker.test(text));
        if (hasInjectionMarker) {
          continue; // Skip this part entirely
        }

        // Skip parts that look like tool execution or results
        const hasToolMarker = toolMarkers.some(marker => marker.test(text));
        if (hasToolMarker) {
          continue; // Skip this part entirely
        }

        textLines.push(`${roleLabel}: ${text}`);
        roleLines.push({
          text,
          role,
          lineNumber: textLines.length - 1,
        });
      } else if (part.type === 'tool') {
        const toolPart = part as { tool?: string; state?: { status?: string; output?: string; error?: string } };
        if (toolPart.state?.status === 'completed' || toolPart.state?.status === 'error') {
          const toolText = `Assistant: [Tool: ${toolPart.tool}]`;
          textLines.push(toolText);
          roleLines.push({
            text: toolText,
            role: 'assistant',
            lineNumber: textLines.length - 1,
          });

          if (toolPart.state.output) {
            const outputText = `Tool Result: ${toolPart.state.output.slice(0, 2000)}`;
            textLines.push(outputText);
            roleLines.push({
              text: outputText,
              role: 'assistant',
              lineNumber: textLines.length - 1,
            });
          }
          if (toolPart.state.error) {
            const errorText = `Tool Error: ${toolPart.state.error}`;
            textLines.push(errorText);
            roleLines.push({
              text: errorText,
              role: 'assistant',
              lineNumber: textLines.length - 1,
            });
          }
        }
      }
    }
  }

  return {
    text: textLines.join('\n'),
    lines: roleLines,
  };
}
