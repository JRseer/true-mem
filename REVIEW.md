# True-Memory - Architectural Code Review

**Reviewer**: @oracle (zai-coding-plan/glm-5)
**Date**: 2026-02-24
**Duration**: 277 seconds
**Scope**: Complete codebase architectural review

---

## Executive Summary

**Overall Architecture Assessment**: SOLID with Minor Concerns

True-Memory demonstrates a well-structured plugin architecture with clear separation of concerns. The codebase shows evidence of iterative refinement based on production issues (QUEUED state, Bun crashes, false positives). The decision to remove Transformers.js in favor of Jaccard similarity was pragmatic for stability.

### Strengths
- Clean modular architecture with single-responsibility files
- Robust four-layer defense against false positives
- Fire-and-forget async pattern prevents UI blocking
- Runtime-agnostic SQLite adapter (Bun + Node 22+)
- Comprehensive multilingual pattern support (15 languages)

### Critical Findings
1. **Potential SQL injection vector** in `getMemoriesByScope` parameterization
2. **Race condition risk** in extraction queue with concurrent session.idle events
3. **Memory leak potential** in debounce timer cleanup
4. **Jaccard similarity semantic limitations** - word overlap ≠ semantic meaning

### High-Level Recommendations
1. Add parameterized query validation for `project_scope`
2. Consider mutex/lock for extraction queue critical sections
3. Implement cleanup for debounce timers on plugin unload
4. Document Jaccard limitations and consider hybrid approach for v2

---

## Architecture Analysis

### 2.1 Dual-Scope Model (Global vs Project-Level)

**Assessment**: Generally Sound, Edge Case Risk

The dual-scope model separates user-level memories (preferences, constraints, learning, procedural) from project-level (decision, bugfix, semantic, episodic).

**Implementation Review**:
```typescript
// database.ts:479-489 - Correct implementation
query = `
  SELECT * FROM memory_units
  WHERE status = 'active'
  AND (
    project_scope IS NULL           -- Global memories
    OR (project_scope IS NOT NULL AND project_scope = ?)  -- Project-specific
  )
`;
```

**Concern**: The fallback path (when `hasValidProject` is false) returns ALL memories:
```typescript
// database.ts:492-497
} else {
  query = `SELECT * FROM memory_units WHERE status = 'active'`;
  params = [];
}
```
This is a **security/data leakage concern** - if worktree resolution fails, all memories are exposed. Should default to global-only, not all.

### 2.2 Fire-and-Forget Async Extraction

**Assessment**: Correct Pattern for OpenCode

The option B init strategy is well-implemented:

```typescript
// index.ts:33-55
state.initPromise = (async () => {
  const { createTrueMemoryPlugin } = await import('./adapters/opencode/index.js');
  state.realHooks = await createTrueMemoryPlugin(state.ctx);
  state.initialized = true;
})();
// Returns hooks IMMEDIATELY - no await
```

**Strengths**:
- Non-blocking startup (<50ms init)
- Graceful fallback if init fails
- Hooks await init only when needed

**Risk**: The `event` hook uses fire-and-forget with `.catch()` swallowing errors:
```typescript
// index.ts:67-76
})().catch(err => log(`Event error (${event.type}): ${err}`));
```
Silent error handling could mask critical issues. Consider structured error tracking.

### 2.3 Four-Layer Defense Effectiveness

**Assessment**: Well-Designed, Minor Gaps

| Layer | Purpose | Implementation Quality |
|--------|---------|----------------------|
| 1. Negative Patterns | Filter known false positives | ✅ Excellent - comprehensive regex patterns |
| 2. Multi-Keyword Scoring | Require 2+ signals | ✅ Good - primary + booster logic |
| 3. Confidence Threshold | Store only if ≥0.6 | ✅ Correct - prevents low-quality memories |
| 4. Role Validation | Human-only for user-level | ⚠️ Good but incomplete |

**Gap in Layer 4**: Role validation depends on `RoleAwareContext` being passed correctly:
```typescript
// classifier.ts:364-373
if (!roleAwareContext) {
  log('Debug: No role-aware context, skipping role validation');
  return { classification, confidence, isolatedContent, roleValidated: true, ... };
}
```
If context is missing, validation is **bypassed silently** with `roleValidated: true`. This could allow Assistant-generated false positives.

---

## Key File Reviews

### 3.1 `src/index.ts` (Entry Point) - **Rating: 8/10**

**Strengths**:
- Clean singleton state management
- Proper hook delegation pattern
- Non-blocking init strategy

**Issues**:
1. **Missing cleanup on plugin unload** - `injectedSessions` Set grows unbounded
2. **No graceful degradation** if init permanently fails

```typescript
// Issue: If initPromise rejects, state is corrupted
state.initPromise = null;  // Line 52 - allows retry
state.realHooks = null;    // But no re-trigger mechanism
```

### 3.2 `src/adapters/opencode/index.ts` (Core Adapter) - **Rating: 7/10**

**Strengths**:
- Comprehensive event handling
- Sub-agent detection prevents noise
- Well-structured extraction flow

**Issues**:

1. **Debounce Timer Leak**:
```typescript
// Lines 25-26 - Module-level timers
let messageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessageEvent: { properties: unknown } | null = null;
```
These are never cleaned up on plugin shutdown.

2. **Regex lastIndex Bug Risk**:
```typescript
// Lines 333-345 - injectionMarkers use test() which mutates lastIndex
const hasInjectedContent = injectionMarkers.some(marker => marker.test(conversationText));
```
While these are NOT global regexes (good), the pattern should use `.some(m => m.test(...))` with fresh regex each time to be safe.

3. **Hardcoded Thresholds**:
```typescript
// Line 419 - Magic number
const isExplicitIntent = confidence >= 0.85;
```
Should be configurable via `PsychMemConfig`.

### 3.3 `src/storage/database.ts` (Database Layer) - **Rating: 8/10**

**Strengths**:
- Proper transaction handling with rollback
- WAL mode with fallback
- Well-structured schema initialization

**Issues**:

1. **Potential SQL Injection in `project_scope`**:
```typescript
// Line 489 - Parameter is user-controlled (worktree path)
params = [currentProject];
```
While SQLite prepared statements handle escaping, the worktree comes from OpenCode context and could contain malicious characters. Add validation.

2. **vectorSearch Query Inconsistency**:
```typescript
// Lines 534-543 - Different query structure than getMemoriesByScope
const query = `
  SELECT * FROM memory_units
  WHERE status = 'active'
  AND (
    (classification IN (${userClassPlaceholders}) AND project_scope IS NULL)
    OR (project_scope IS NOT NULL AND project_scope = ?)
  )
`;
```
This query restricts global memories to `userLevelClassifications` only, while `getMemoriesByScope` returns ALL global memories. **Inconsistent behavior.**

3. **Missing Index for Decay Operations**:
```sql
-- Decay queries scan all active memories without index on classification
SELECT id, strength, decay_rate, updated_at, status, classification
FROM memory_units WHERE status = 'active'
```
Consider composite index: `(status, classification)` for decay-only-episodic optimization.

### 3.4 `src/memory/classifier.ts` (Classification Logic) - **Rating: 9/10**

**Strengths**:
- Clean separation of concerns
- Explicit intent isolation logic is well-designed
- Role-aware classification with proper validation

**Issues**:

1. **Semantic Fallback Always Triggers**:
```typescript
// Lines 252-257 - If no classification found, always returns 'semantic'
return {
  classification: 'semantic',
  confidence: 0.85,
  isolatedContent
};
```
This means ANY "Ricordati che..." becomes semantic, even if it's noise. Consider adding a minimum content length check.

2. **Confidence Boosting Could Overshoot**:
```typescript
// Lines 396-407 - 10x multiplier for Human messages
const boostedConfidence = Math.min(1, confidence * HUMAN_MESSAGE_WEIGHT_MULTIPLIER);
```
A 0.4 confidence becomes 4.0 → capped to 1.0. This effectively eliminates the confidence threshold for Human messages.

### 3.5 `src/memory/reconsolidate.ts` (Conflict Resolution) - **Rating: 7/10**

**Strengths**:
- Clear threshold-based decision making
- Proper frequency increment for duplicates

**Issues**:

1. **Direct Database Access in Handler**:
```typescript
// Lines 93, 121 - Accessing private db property
db['db'].prepare(`UPDATE ...`).run(...);
db['db'].prepare(`DELETE ...`).run(...);
```
This breaks encapsulation. Should use public methods `updateMemoryStrength()`, `updateMemoryStatus()`.

2. **No Transaction for Delete + Insert**:
```typescript
// handleConflict deletes existing, but insertion happens in caller
db['db'].prepare(`DELETE FROM memory_units WHERE id = ?`).run(existingMemory.id);
return { type: 'conflict', replacementMemory: ... };
```
If caller fails to insert, memory is lost. Should be atomic.

### 3.6 `src/extraction/queue.ts` (Job Queue) - **Rating: 8/10**

**Strengths**:
- Simple, effective sequential processing
- queueMicrotask for non-blocking execution

**Issues**:

1. **No Concurrency Protection**:
```typescript
// Lines 41-47 - Race condition potential
private async runNextJob(): Promise<void> {
  if (this.queue.length === 0) {
    this.isProcessing = false;
    return;
  }
  this.isProcessing = true;
```
If two `queueMicrotask` callbacks run simultaneously, both could grab jobs. The `isProcessing` flag is checked synchronously but set asynchronously.

2. **No Job Timeout**:
A stuck job blocks the queue indefinitely. Consider adding timeout.

### 3.7 `src/memory/embeddings.ts` (Jaccard Similarity) - **Rating: 7/10**

**Strengths**:
- Clean, simple implementation
- Proper error handling

**Issues**:

1. **Semantic Limitation Not Documented**:
Jaccard similarity only catches word overlap. "I love TypeScript" and "I hate TypeScript" have high Jaccard similarity (3/4 words overlap) but opposite meaning.

2. **Tokenization Too Simple**:
```typescript
// Lines 23-29
const words = text
  .toLowerCase()
  .replace(/[^\w\s]/g, '')  // Removes ALL punctuation
  .split(/\s+/)
```
"don't" → "dont", "can't" → "cant". This loses important negation signals.

---

## Technical Decisions Assessment

### 4.1 Jaccard vs Embeddings - **Decision: PRAGMATIC but LIMITING**

**Rationale from AGENTS.md**: Transformers.js caused bundling issues and resource leaks.

**Assessment**:
- ✅ Correct for v1 stability (no native dependencies, no memory leaks)
- ⚠️ Significant semantic search degradation
- ⚠️ Reconsolidation accuracy reduced

**Recommendation**: Document limitations clearly. Consider a hybrid approach:
- Jaccard for quick filtering (reduce candidate pool)
- Optional embeddings for final ranking (if configured)

### 4.2 Option B Init (Non-Awaited) - **Decision: CORRECT**

**Assessment**: This is the right pattern for OpenCode plugins. The implementation is sound.

**Why it works**:
1. Plugin returns hooks immediately
2. Hooks await init only if needed
3. Init is lightweight (<50ms without Transformers.js)

### 4.3 Maintenance at session.end - **Decision: CORRECT**

Moving decay and consolidation from `session.created` to `session.end` was the right call:

**Before**: 20-100ms blocking on session start → QUEUED state
**After**: Non-blocking startup, maintenance at session close

### 4.4 Dual-Scope Query Logic - **Decision: INCONSISTENT**

Two different query patterns:

| Method | Global Memories | Project Memories |
|--------|-----------------|------------------|
| `getMemoriesByScope` | ALL classifications | Matching project |
| `vectorSearch` | User-level only | Matching project |

**Fix**: Align both methods to use the same scope logic.

---

## Potential Issues & Risks

### 5.1 Race Conditions

**Location**: `src/extraction/queue.ts:41-47`

```typescript
// Two concurrent session.idle events could both pass this check
if (this.isProcessing || this.queue.length === 0) return;
queueMicrotask(() => this.runNextJob());
```

**Risk**: Medium. Could cause duplicate extractions.

**Fix**: Use atomic flag or mutex.

### 5.2 Memory Leak: Debounce Timer

**Location**: `src/adapters/opencode/index.ts:25-26`

```typescript
let messageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
```

Timer is never cleared on plugin shutdown. In long-running sessions with many message updates, this could accumulate.

### 5.3 Unbounded Set Growth

**Location**: `src/adapters/opencode/index.ts:112`

```typescript
injectedSessions: new Set<string>(),
```

Set grows indefinitely across sessions. Should be cleared on session end or have a max size.

### 5.4 Data Loss in Conflict Resolution

**Location**: `src/memory/reconsolidate.ts:121`

If `handleConflict` deletes existing memory and caller fails to insert new one, data is permanently lost.

### 5.5 Edge Case: Empty Project Scope

**Location**: `src/storage/database.ts:474`

```typescript
const hasValidProject = currentProject && currentProject !== '/' && currentProject.length > 1;
```

If worktree is `/` (root), ALL memories are returned. This could leak cross-project data.

---

## Recommendations

### Priority 1: Critical Fixes

1. **Fix vectorSearch/getMemoriesByScope Inconsistency**
   - Both should use identical scope logic
   - Global memories should include all classifications

2. **Add Transaction for Conflict Resolution**
   ```typescript
   // In handleReconsolidation, wrap delete+insert in transaction
   this.db.exec('BEGIN TRANSACTION');
   try {
     // delete + insert
     this.db.exec('COMMIT');
   } catch {
     this.db.exec('ROLLBACK');
   }
   ```

3. **Clear Debounce Timer on Shutdown**
   ```typescript
   // Add to shutdown handler
   if (messageDebounceTimer) {
     clearTimeout(messageDebounceTimer);
     messageDebounceTimer = null;
   }
   ```

### Priority 2: Important Improvements

4. **Add Concurrency Protection to ExtractionQueue**
   ```typescript
   private lock: Promise<void> = Promise.resolve();

   async add(job: ExtractionJob): Promise<void> {
     this.lock = this.lock.then(() => this.processJob(job));
   }
   ```

5. **Bound injectedSessions Set**
   ```typescript
   if (state.injectedSessions.size > 1000) {
     state.injectedSessions.clear(); // Or LRU eviction
   }
   ```

6. **Validate Project Scope Input**
   ```typescript
   if (currentProject && !/^[\w\-./]+$/.test(currentProject)) {
     log('Invalid project scope, defaulting to global');
     currentProject = undefined;
   }
   ```

### Priority 3: Future Enhancements

7. **Hybrid Similarity Search**
   - Jaccard for initial filtering (top-100)
   - Optional embeddings for reranking (top-10)

8. **Configurable Thresholds**
   - Move `0.85` explicit intent threshold to config
   - Move `0.6` confidence threshold to config

9. **Add Metrics/Monitoring**
   - Track extraction success rate
   - Track false positive rate (via user feedback)
   - Track memory retrieval hit rate

---

## Code Quality Assessment

### Type Safety: **8/10**

- Strict TypeScript configuration enabled
- Proper use of `type` imports
- Generic types used appropriately

**Gap**: Some `any` usage:
```typescript
// database.ts:254, 261, etc.
const row = this.db.prepare(...).get(sessionId) as any;
```

### Error Handling: **7/10**

- Most errors are caught and logged
- Graceful degradation in most places

**Gap**: Silent error swallowing in critical paths:
```typescript
// logger.ts:28-30
} catch {
  // Silently ignore logging errors
}
```

### Code Consistency: **9/10**

- Consistent naming conventions
- Similar patterns across modules
- Good use of TypeScript features

### Documentation: **6/10**

- JSDoc comments present but sparse
- Complex algorithms lack explanation
- AGENTS.md is excellent, but code comments minimal

### Test Coverage: **N/A** (No tests present)

**Critical Gap**: No unit tests. For a memory system, this is concerning. Recommend:
- Unit tests for classifier
- Integration tests for extraction pipeline
- E2E tests for full lifecycle

---

## Summary

True-Memory is a well-architected plugin with solid foundations. The iterative bug fixes (QUEUED state, Bun crashes, false positives) demonstrate mature engineering. However, several edge cases and potential race conditions need attention before production-scale deployment.

**Top 3 Actions**:
1. Fix vectorSearch/getMemoriesByScope inconsistency (data integrity)
2. Add transaction for conflict resolution (prevent data loss)
3. Implement unit tests (reliability)
