const DEFAULT_TASK_MEMORY_TTL_HOURS = 24;

const TEMPORARY_TASK_KEYWORDS = [
  'temporary task memory',
  'temporary cross-project context',
  'short-lived task memory',
  'for this task only',
  'discard after this task',
  'task context only',
  '临时任务记忆',
  '临时跨项目记忆',
  '跨项目临时上下文',
  '临时上下文',
  '当前任务链路',
  '只在本任务期间',
  '只用于当前任务链路',
  '任务结束后丢弃',
  '任务结束后放弃',
  '任務結束後丟棄',
  '任務結束後放棄',
  '臨時任務記憶',
  '臨時跨專案記憶',
  '跨專案臨時上下文',
  '臨時上下文',
  '當前任務鏈路',
  '只在本任務期間',
  '只用於當前任務鏈路',
];

const END_TASK_MEMORY_COMMANDS = [
  'end task memory',
  'end current task memory',
  'clear task memory',
  'clear current task memory',
  'finish task memory',
  '结束当前任务记忆',
  '结束任务记忆',
  '清理当前任务记忆',
  '清除当前任务记忆',
  '删除当前任务记忆',
  '结束当前任务链路',
  '結束當前任務記憶',
  '結束任務記憶',
  '清理當前任務記憶',
  '清除當前任務記憶',
  '刪除當前任務記憶',
  '結束當前任務鏈路',
];

export function hasTemporaryTaskMemoryKeyword(text: string): boolean {
  const lowerText = text.toLowerCase();
  return TEMPORARY_TASK_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

export function isEndTaskMemoryRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return getTaskScopeFromEndRequest(normalized) !== undefined;
}

export function getTaskScopeFromEndRequest(text: string): string | null | undefined {
  const normalized = text.trim();
  const lowerText = normalized.toLowerCase();
  const exactMatch = END_TASK_MEMORY_COMMANDS.some(command => lowerText === command.toLowerCase());
  if (exactMatch) {
    return getActiveTaskScope();
  }

  const scopedPatterns = [
    /^end task memory\s*[:：]\s*(.+)$/i,
    /^end current task memory\s*[:：]\s*(.+)$/i,
    /^clear task memory\s*[:：]\s*(.+)$/i,
    /^结束任务记忆\s*[:：]\s*(.+)$/i,
    /^结束当前任务记忆\s*[:：]\s*(.+)$/i,
    /^清理任务记忆\s*[:：]\s*(.+)$/i,
    /^清除任务记忆\s*[:：]\s*(.+)$/i,
    /^結束任務記憶\s*[:：]\s*(.+)$/i,
    /^結束當前任務記憶\s*[:：]\s*(.+)$/i,
    /^清理任務記憶\s*[:：]\s*(.+)$/i,
    /^清除任務記憶\s*[:：]\s*(.+)$/i,
  ];

  for (const pattern of scopedPatterns) {
    const match = normalized.match(pattern);
    const taskScope = match?.[1]?.trim();
    if (taskScope) {
      return taskScope;
    }
  }

  return undefined;
}

export function getActiveTaskScope(): string | null {
  const value = process.env.TRUE_MEM_TASK_SCOPE?.trim();
  return value && value.length > 0 ? value : null;
}

export function getTaskMemoryTtlHours(): number {
  const value = process.env.TRUE_MEM_TASK_MEMORY_TTL_HOURS;
  if (!value) return DEFAULT_TASK_MEMORY_TTL_HOURS;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TASK_MEMORY_TTL_HOURS;
  }

  return parsed;
}

export function getTaskMemoryExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + getTaskMemoryTtlHours() * 60 * 60 * 1000);
}

export function resolveTemporaryTaskMemory(text: string): { taskScope: string; expiresAt: Date } | null {
  if (!hasTemporaryTaskMemoryKeyword(text)) {
    return null;
  }

  const taskScope = getActiveTaskScope();
  if (!taskScope) {
    return null;
  }

  return {
    taskScope,
    expiresAt: getTaskMemoryExpiresAt(),
  };
}
