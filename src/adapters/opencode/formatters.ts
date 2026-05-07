import type { MemoryUnit } from '../../types.js';

export function formatMemoriesForInjection(memories: MemoryUnit[], currentProject?: string): string {
  const lines: string[] = ['## Relevant Memories from Previous Sessions', ''];
  
  const userLevelClassifications = ['constraint', 'preference', 'learning', 'procedural'];
  const userLevel = memories.filter(m => userLevelClassifications.includes(m.classification));
  const projectLevel = memories.filter(m => !userLevelClassifications.includes(m.classification));
  
  if (userLevel.length > 0) {
    lines.push('### User Preferences & Constraints');
    lines.push('_These apply across all projects_');
    lines.push('');
    for (const mem of userLevel) {
      const storeLabel = mem.store === 'ltm' ? '[LTM]' : '[STM]';
      lines.push(`- ${storeLabel} [${mem.classification}] ${mem.summary}`);
    }
    lines.push('');
  }
  
  if (projectLevel.length > 0) {
    const projectName = currentProject ? currentProject.split(/[/\\]/).pop() : 'Current Project';
    lines.push(`### ${projectName} Context`);
    lines.push('');
    for (const mem of projectLevel) {
      const storeLabel = mem.store === 'ltm' ? '[LTM]' : '[STM]';
      lines.push(`- ${storeLabel} [${mem.classification}] ${mem.summary}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

export function buildCompactionPrompt(memoriesMarkdown: string | null): string {
  const sections: string[] = [];
  
  if (memoriesMarkdown) {
    sections.push(memoriesMarkdown);
  }
  
  sections.push(`## Compaction Instructions

You are compacting a conversation. Preserve:

### MUST PRESERVE
- Current task/goal
- User constraints, preferences, requirements
- Decisions and rationale
- Errors and solutions
- Files modified and why
- Current state of in-progress work

### CAN DISCARD
- Verbose tool outputs (summarize)
- Intermediate reasoning
- Exploratory discussions
- Repetitive information

### OUTPUT FORMAT
Write a structured summary: task, accomplishments, remaining work, critical context.`);
  
  return sections.join('\n\n');
}

/**
 * Format memories for response to user
 * Groups by scope (Global/Project) then by store (LTM/STM)
 */
export function formatMemoryListForResponse(memories: MemoryUnit[]): string {
  const lines: string[] = [];

  // Separate by scope
  const globalMemories = memories.filter(m => !m.projectScope);
  const projectMemories = memories.filter(m => m.projectScope);

  // Global scope section
  if (globalMemories.length > 0) {
    lines.push('**GLOBAL SCOPE:**');
    
    const ltm = globalMemories.filter(m => m.store === 'ltm');
    const stm = globalMemories.filter(m => m.store === 'stm');

    if (ltm.length > 0) {
      lines.push('**LTM:**');
      for (const mem of ltm) {
        lines.push(`• [${mem.classification}] ${mem.summary}`);
      }
    }

    if (stm.length > 0) {
      lines.push('**STM:**');
      for (const mem of stm) {
        lines.push(`• [${mem.classification}] ${mem.summary}`);
      }
    }
    lines.push('');
  }

  // Project scope section
  if (projectMemories.length > 0) {
    lines.push('**PROJECT SCOPE:**');
    
    const ltm = projectMemories.filter(m => m.store === 'ltm');
    const stm = projectMemories.filter(m => m.store === 'stm');

    if (ltm.length > 0) {
      lines.push('**LTM:**');
      for (const mem of ltm) {
        lines.push(`• [${mem.classification}] ${mem.summary}`);
      }
    }

    if (stm.length > 0) {
      lines.push('**STM:**');
      for (const mem of stm) {
        lines.push(`• [${mem.classification}] ${mem.summary}`);
      }
    }
  }

  return lines.join('\n');
}
