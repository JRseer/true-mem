/**
 * Role-Aware Pattern Detection
 *
 * Heuristics for distinguishing Human vs Assistant message patterns
 * to improve memory extraction accuracy.
 */

import type { MessageRole } from '../types.js';

// =============================================================================
// Human-Primary Patterns
// =============================================================================

/**
 * Patterns that strongly indicate Human intent
 * These are first-person expressions of preferences, decisions, or constraints
 */
const HUMAN_INTENT_PATTERNS = [
  // Explicit remember/remember me
  /\b(?:remember|ricorda|keep in mind|tieni a mente|note that|nota che)\s*(?:this|questo)?\s*(?:for me|per me)?\b/gi,
  /(?:记住|記住|请记住|請記住|别忘了|別忘了|不要忘记|不要忘記|记一下|記一下|记着|記著)/gi,

  // First-person preference statements
  /\b(?:i prefer|i like|i want|i'd rather|preferisco|mi piace|voglio|prediligo)\b/gi,
  /(?:我更喜欢|我更喜歡|我喜欢|我喜歡|我想要|我偏好|我宁愿|我寧願)/gi,

  // First-person learning statements
  /\b(?:i learned|i discovered|i realized|i figured out|imparato|scoperto|capito)\b/gi,
  /(?:我学到|我學到|我发现|我發現|我意识到|我意識到|我搞明白了|我明白了)/gi,

  // First-person constraint statements
  /\b(?:i can't|i cannot|i must never|i will never|non posso|non devo)\b/gi,
  /(?:我不能|我不可以|我绝不能|我絕不能|我不会|我不會)/gi,

  // First-person decision statements
  /\b(?:i decided|i chose|i picked|i went with|deciso|scelto|selezionato)\b/gi,
  /(?:我决定了|我決定了|我决定|我決定|我选择了|我選擇了|我们决定|我們決定)/gi,

  // Direct imperatives and commands (Human → Assistant)
  /\b(?:never|always|don't|make sure|ensure|mai|sempre|non)\s+(?:use|do|try|avoid|usa|fare|prova|evita)\b/gi,
  /(?:一定要|务必|務必|不要|別|记得|記得).{0,4}(?:用|做|试|試|避免|提交|保留|检查|檢查)/gi,
];

/**
 * Patterns that indicate Assistant acknowledgment or restatement
 * These are rephrasings of user intent and should not be primary sources
 */
const ASSISTANT_ACKNOWLEDGMENT_PATTERNS = [
  // Third-person restatements
  /\b(?:you prefer|you like|you want|you decided|you chose|you learned)\b/gi,
  /(?:你更喜欢|你更喜歡|你喜欢|你喜歡|你想要|你决定了|你決定了|你学到|你學到)/gi,

  // Neutral reporting
  /\b(?:the user prefers|the user decided|the user learned|the user wants)\b/gi,
  /(?:用户更喜欢|使用者更喜歡|用户决定了|使用者決定了|用户希望|使用者希望)/gi,

  // Acknowledgment markers
  /\b(?:understood|noted|acknowledged|got it|ok|alright|capito|notato)\b/gi,
  /(?:我记住了|我記住了|我记下了|我記下了|已记住|已記住|明白了|收到|了解了)/gi,

  // Passive restatements
  /\b(?:it was decided|it was chosen|it was learned)\b/gi,
  /(?:已经决定|已經決定|已经选择|已經選擇|已经学到|已經學到)/gi,
];

// =============================================================================
// Pattern Scoring
// =============================================================================

/**
 * Score a message for Human intent signals
 * Returns 0-1 score, higher = more likely Human intent
 */
export function scoreHumanIntent(text: string): number {
  const textLower = text.toLowerCase();
  let score = 0;

  for (const pattern of HUMAN_INTENT_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = textLower.match(pattern);
    if (matches) {
      score += matches.length * 0.3;
    }
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

/**
 * Score a message for Assistant acknowledgment patterns
 * Returns 0-1 score, higher = more likely Assistant restatement
 */
export function scoreAssistantAcknowledgment(text: string): number {
  const textLower = text.toLowerCase();
  let score = 0;

  for (const pattern of ASSISTANT_ACKNOWLEDGMENT_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = textLower.match(pattern);
    if (matches) {
      score += matches.length * 0.25;
    }
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

/**
 * Infer the likely role from text patterns
 * Returns the inferred role or null if unclear
 */
export function inferRoleFromText(text: string): MessageRole | null {
  const humanScore = scoreHumanIntent(text);
  const assistantScore = scoreAssistantAcknowledgment(text);

  if (humanScore > 0.6 && humanScore > assistantScore * 1.5) {
    return 'user';
  }

  if (assistantScore > 0.6 && assistantScore > humanScore * 1.5) {
    return 'assistant';
  }

  return null;
}

/**
 * Check if a message contains explicit remember/remember me signals
 * These are strong indicators of Human intent
 */
export function hasExplicitRememberSignal(text: string): boolean {
  const patterns = [
    /\bricorda questo\b:?\s*/gi,
    /\bremember this\b:?\s*/gi,
    /\bricorda\b:?\s*/gi,
    /\bremember\b:?\s*/gi,
    /\btieni a mente\b:?\s*/gi,
    /\bkeep in mind\b:?\s*/gi,
    /\bnota che\b:?\s*/gi,
    /\bnote that\b:?\s*/gi,
    /记住这个[:：]?\s*/gi,
    /記住這個[:：]?\s*/gi,
    /请记住[:：]?\s*/gi,
    /請記住[:：]?\s*/gi,
    /记住[:：]?\s*/gi,
    /記住[:：]?\s*/gi,
    /别忘了[:：]?\s*/gi,
    /別忘了[:：]?\s*/gi,
    /不要忘记[:：]?\s*/gi,
    /不要忘記[:：]?\s*/gi,
    /重要的是[:：]?\s*/gi,
    /注意[:：]?\s*/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a message contains Assistant-generated list patterns
 * These are often rephrasings and should be down-weighted
 */
export function hasAssistantListPattern(text: string): boolean {
  // Pattern: Assistant rephrasing user preferences as a list
  const listPatterns = [
    /(?:based on your (?:preferences|constraints|requirements),?)\s*(?:i'll|i will)\s*(?:remember|note)\s*:/gi,
    /(?:i've|i have)\s*(?:noted|remembered)\s*(?:that|the following)\s*:/gi,
    /(?:here's|here is)\s*(?:what i've|i have)\s*(?:learned|noted)\s*:/gi,
    /(?:from our conversation,)\s*(?:i|we)\s*(?:can see|understand)\s*:/gi,
  ];

  for (const pattern of listPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Context Building
// =============================================================================

/**
 * Build role-aware context from a line with its surrounding messages
 */
export interface RoleAwareLine {
  text: string;
  role: MessageRole;
  lineNumber: number;
}

/**
 * Extract role-aware context for a specific line in the conversation
 * Returns the line with its role and surrounding context
 */
export function extractRoleAwareContext(
  lines: string[],
  targetIndex: number,
  contextWindow: number = 3
): RoleAwareLine | null {
  if (targetIndex < 0 || targetIndex >= lines.length) {
    return null;
  }

  const line = lines.at(targetIndex);
  if (!line) {
    return null;
  }

  // Parse role from line format: "Human: ..." or "Assistant: ..."
  const roleMatch = line.match(/^(Human|Assistant):\s*/i);
  if (!roleMatch) {
    return null;
  }

  const roleLabel = roleMatch[1];
  if (!roleLabel) {
    return null;
  }

  const role: MessageRole = roleLabel.toLowerCase() === 'human' ? 'user' : 'assistant';

  return {
    text: line.substring(roleMatch[0].length).trim(),
    role,
    lineNumber: targetIndex,
  };
}

/**
 * Extract all lines with their roles from a conversation
 */
export function parseConversationLines(conversation: string): RoleAwareLine[] {
  const lines: RoleAwareLine[] = [];

  conversation.split('\n').forEach((text, index) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const roleMatch = trimmed.match(/^(Human|Assistant):\s*/i);
    if (!roleMatch) return;

    const roleLabel = roleMatch[1];
    if (!roleLabel) return;

    lines.push({
      text: trimmed.substring(roleMatch[0].length).trim(),
      role: roleLabel.toLowerCase() === 'human' ? 'user' : 'assistant',
      lineNumber: index,
    });
  });

  return lines;
}
