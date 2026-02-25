/**
 * Negative Patterns for False Positive Prevention
 *
 * These patterns filter out common false positives before classification.
 * E.g., "resolve DNS" should NOT trigger bugfix classification.
 */

/**
 * AI Meta-Talk Patterns
 *
 * These patterns detect AI-generated content (summaries, meta-talk, task completions)
 * that should NEVER be stored as user memories, regardless of classification.
 *
 * Rationale: In multilingual contexts, AI output is often in English while user
 * preferences are in their primary language. These patterns catch AI-generated
 * content at the source, preventing it from polluting the memory database.
 */
export const AI_META_TALK_PATTERNS: RegExp[] = [
  // AI summary prefixes
  /^(Goal|Summary|Context|Analysis|Note|Overview|Background):\s+The user/i,
  /^(Goal|Summary|Context|Analysis|Note|Overview|Background):\s+This/i,

  // Task completion markers
  /^\[.*task.*completed\]/i,
  /^\[.*completed.*\]/i,
  /^\[Background task/i,

  // AI instructional prefixes
  /^Please (analyze|create|review|implement|explain|describe|summarize)/i,
  /^Let me (analyze|create|review|implement|explain|describe)/i,
  /^I will (analyze|create|review|implement|explain|describe)/i,

  // AI self-reference patterns
  /^This (file|code|implementation|solution|approach|method)/i,
  /^The (above|following|below) (code|solution|implementation)/i,
  /^Here('s| is) (the|a)/i,

  // AI meta-commentary
  /^Based on (the|my) analysis/i,
  /^After (reviewing|analyzing|examining)/i,
  /^Looking at (the|this)/i,

  // Markdown table / pipe-separated content
  /^\|[^|]+\|[^|]+\|/i,           // Starts with table row
  /^[\s]*\|[^\n]+\|[^\n]*$/im,    // Any table row at start

  // Regex-like patterns (technical docs)
  /^[\s]*\/.*\/[gimsuvy]*\s*$/i,  // Regex pattern lines
  /\|\w+\|.*\.\.\./i,              // |important|... patterns

  // System-generated content markers
  /^\|.+\|$/i,                     // Entire line is pipe-wrapped
];

/**
 * Check if text appears to be AI-generated meta-talk
 */
export function isAIMetaTalk(text: string): boolean {
  return AI_META_TALK_PATTERNS.some(pattern => pattern.test(text.trim()));
}

/**
 * Check if text is a question (should NOT be stored as a statement)
 */
export function isQuestion(text: string): boolean {
  const trimmed = text.trim();

  // Ends with question mark
  if (trimmed.endsWith('?')) return true;

  // Italian question patterns (no question mark in casual writing)
  const questionPatterns = [
    /\b(?:cosa|come|quando|dove|perché|chi|quale|quanto)\s+(?:devo|posso|dovrei|potrei|conviene)\b/i,
    /\b(?:potrò|dovrò|posso|devo)\s+\w+/i,
  ];

  return questionPatterns.some(p => p.test(trimmed));
}

/**
 * First Person Recall Patterns
 *
 * These patterns detect when the user is recounting/recalling something
 * (1st person indicative) rather than requesting storage (imperative).
 *
 * "I remember when..." = recounting, NOT storage request
 * "Remember this!" = imperative, storage request
 */
export const FIRST_PERSON_RECALL_PATTERNS: RegExp[] = [
  // English - 1st person indicative
  /\bI\s+(remember|recall|recollect|don'?t\s+forget)\b/i,
  /\bwe\s+(remember|recall|recollect)\b/i,
  /\bI\s+can\s+remember\b/i,

  // Italian - 1st person singular "io ricordo"
  /\b(io\s+)?ricordo\b/i,
  /\bmi\s+ricordo\b/i,
  /\bho\s+ricordato\b/i,

  // Italian - 1st person plural with indicative context
  /\b(ci\s+)?ricordiamo\s+(che|di|quando|come|perch)\b/i,

  // Spanish - 1st person "yo recuerdo"
  /\b(yo\s+)?recuerdo\b/i,
  /\bme\s+acuerdo\b/i,
  /\brecordamos\b/i,

  // French - 1st person "je me souviens"
  /\bje\s+(me\s+)?souviens\b/i,
  /\bnous\s+(nous\s+)?souvenons\b/i,

  // German - 1st person "ich erinnere mich"
  /\bich\s+erinnere(\s+mich)?\b/i,
  /\bwir\s+erinnern(\s+uns)?\b/i,

  // Portuguese - 1st person "eu me lembro"
  /\b(eu\s+)?(me\s+)?lembro\b/i,
  /\bnos\s+lembramos\b/i,

  // Dutch - 1st person "ik herinner me"
  /\bik\s+herinner(\s+me)?\b/i,
  /\bwe\s+herinneren(\s+ons)?\b/i,

  // Polish - 1st person "pamiętam"
  /\bpamiętam\b/i,
  /\bpamiętamy\b/i,

  // Turkish - 1st person "hatırlıyorum"
  /\bhatırlıyorum\b/i,
  /\bhatırlıyoruz\b/i,
];

/**
 * Remind Recall Patterns
 *
 * These patterns detect when "remind me" is used to request INFORMATION
 * (recall) rather than to store something (imperative).
 *
 * "Remind me how we did this" = asking AI to recall → DON'T store
 * "Remind me to commit" = imperative to store → STORE
 *
 * Key distinction: question word vs. preposition/demonstrative after "remind me"
 */
export const REMIND_RECALL_PATTERNS: RegExp[] = [
  // English: remind me [question word]
  /\bremind\s+me\s+(how|what|when|where|why|who|which)\b/i,
  /\bremind\s+me\s+of\s+(the|what|how|when|where|why)\b/i,

  // Italian: ricordami [question word]
  /\bricordami\s+(come|cosa|quando|dove|perch[eé]|chi|quale|quanto)\b/i,
  /\bricordami\s+che\s+(cosa|tipo|ragione)\b/i,

  // Spanish: recuérdame [question word]
  /\brec[uú]rdame\s+(c[oó]mo|qu[eé]|cu[aá]ndo|d[oó]nde|por\s*qu[eé]|qui[eé]n|cu[aá]l)\b/i,

  // French: rappelle-moi [question word]
  /\brappelle[s]?\s*-?\s*moi\s+(comment|quand|o[uù]|pourquoi|qui|quel)\b/i,
  /\brappelle[s]?\s*-?\s*moi\s+ce\s+que\b/i,

  // German: erinner mich [question word]
  /\berinner\s+(mich|uns)\s+(wie|was|wann|wo|warum|wer|welche[ns]?)\b/i,

  // Portuguese: lembre-me [question word]
  /\blembre\s*-?\s*me\s+(como|quando|onde|por\s*que|quem|qual)\b/i,
  /\blembre\s*-?\s*me\s+o\s+que\b/i,

  // Dutch: herinner me [question word]
  /\bherinner\s+(me|ons)\s+(hoe|wat|wanneer|waar|waarom|wie|welke)\b/i,

  // Polish: przypomnij mi [question word]
  /\bprzypomnij\s+mi\s+(jak|co|kiedy|gdzie|dlaczego|kto|kt[oó]ry)\b/i,

  // Turkish: hatırlat bana [question word]
  /\bhat[ıi]rlat\s+(bana)\s+(nas[ıi]l|ne|ne\s+zaman|nere[dy]e|neden|kim|hangi)\b/i,
];

// Negative patterns per classification type
export const NEGATIVE_PATTERNS: Record<string, RegExp[]> = {
  bugfix: [
    // resolve (not bug-related)
    /resolve\s+(dns|ip|address|hostname|url|uri|path)/i,
    /resolve\s+(promise|async|await)/i,
    /git\s+resolve/i,
    /resolve\s+conflict(?!.*(?:bug|error|crash|fail))/i,
    /resolve\s+overlapping/i,

    // fix (not bug-related)
    /fixed\s+(width|height|position|size|length)/i,
    /fix\s+(position|layout|spacing|padding|margin)/i,
    /fixed-point/i,
    /fixed\s+asset/i,

    // handle (not error-related)
    /handle\s+(click|event|input|change|submit|hover|focus|blur)/i,
    /event\s+handler/i,
    /click\s+handler/i,
    /handler\s+function/i,

    // address (not issue-related)
    /\baddress\s+(space|bar|book|ing)\b/i,
    /ip\s+address/i,
    /mac\s+address/i,
    /email\s+address/i,
    /memory\s+address/i,

    // error (not bug-related)
    /error\s*(handling|handler|boundary)/i,
    /type\s*error/i,  // TypeScript type errors in docs
  ],

  decision: [
    /decided\s+to\s+(run|start|begin|try|test|check|verify|use)/i,
    /decision\s+(tree|matrix|making)/i,
  ],

  learning: [
    /machine\s+learning/i,
    /deep\s+learning/i,
    /learning\s+(rate|curve)/i,
  ],

  constraint: [
    /database\s+constraint/i,
    /foreign\s+key\s+constraint/i,
    /unique\s+constraint/i,
  ],

  preference: [
    // List selection patterns - "preferisco 3", "scelgo la 2", "voglio la prima"
    /\b(preferisco|scelgo|voglio|prendo|opto)\s+(?:la\s+)?[0-9]+(?:a|o)?\b/i,
    /\b(preferisco|scelgo|voglio|prendo|opto)\s+(?:la\s+)?(prima|seconda|terza|quarta|quinta|primo|secondo|terzo)\b/i,
    /\b(preferisco|scelgo|voglio|prendo|opto)\s+(?:l'|il\s+)?(?:opzione\s+)?[0-9]+\b/i,
    /\b(?:option|opzione)\s+[0-9]+\b/i,
    /\b(preferisco|scelgo|voglio)\s+[0-9]\s*[,.\n]/i,
  ],
};

/**
 * Check if text matches any negative pattern for the given classification
 * Also checks AI meta-talk patterns first (applies to all classifications)
 */
export function matchesNegativePattern(text: string, classification: string): boolean {
  // First, check if this is AI-generated meta-talk (applies to ALL classifications)
  if (isAIMetaTalk(text)) {
    return true;
  }

  // Check for 1st person recall patterns (recounting, not storage request)
  if (FIRST_PERSON_RECALL_PATTERNS.some(pattern => pattern.test(text))) {
    return true;
  }

  // Check for "remind me [question word]" patterns (recall request, not storage)
  if (REMIND_RECALL_PATTERNS.some(pattern => pattern.test(text))) {
    return true;
  }

  const patterns = NEGATIVE_PATTERNS[classification];
  if (!patterns) return false;

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Get matching negative patterns (for debugging)
 */
export function getMatchingNegativePatterns(text: string, classification: string): string[] {
  const matches: string[] = [];

  // Check AI meta-talk first
  if (isAIMetaTalk(text)) {
    matches.push('[AI_META_TALK]');
  }

  // Check 1st person recall patterns
  if (FIRST_PERSON_RECALL_PATTERNS.some(pattern => pattern.test(text))) {
    matches.push('[FIRST_PERSON_RECALL]');
  }

  // Check "remind me [question word]" patterns
  if (REMIND_RECALL_PATTERNS.some(pattern => pattern.test(text))) {
    matches.push('[REMIND_RECALL]');
  }

  const patterns = NEGATIVE_PATTERNS[classification];
  if (patterns) {
    matches.push(
      ...patterns
        .filter(pattern => pattern.test(text))
        .map(p => p.source)
    );
  }

  return matches;
}
