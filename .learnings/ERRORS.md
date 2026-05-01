# Error Log

## [ERR-20260501-001] background_explore_context_pollution

**Logged**: 2026-05-01T14:15:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
Background explore task for retrieve test seams failed after inherited memory-context pollution changed the prompt payload.

### Error
```
Task bg_e95d0894 failed with UnknownError. The reported original prompt contained injected <true_memory_context> content unrelated to the intended retrieve-test search.
```

### Context
- Operation attempted: background task to inspect retrieve pipeline test seams.
- Intended input: read/search only over `test/golden/*retrieval*`, `*scope*`, `*storage*`, `*pipeline*`.
- Actual failure: task reported an unrelated memory context fragment in the original prompt.

### Suggested Fix
When a background exploration task fails with context pollution, do not rely on retrying the same broad prompt. Use narrower direct file reads or a fresh, minimal prompt with explicit file paths and no inherited contextual prose.

### Metadata
- Reproducible: unknown
- Related Files: test/golden/retrieval-degradation-marker.test.ts, test/golden/scope-context.test.ts, test/golden/storage-port-interface.test.ts

---

## [ERR-20260501-002] background_domain_seam_context_pollution

**Logged**: 2026-05-01T15:20:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Background task for domain seam exploration failed with inherited `<true_memory_context>` pollution instead of executing the intended read-only code search.

### Error
```
Task bg_e6b03e8f failed with UnknownError. The reported original prompt started with injected <true_memory_context> content instead of the domain seam search request.
```

### Context
- Operation attempted: background task to inspect classifier, patterns, reconsolidation, database, process-session, and ingest steps for TrueMemDomainPort boundaries.
- Recovery used: direct file reads of `src/memory/classifier.ts`, `src/memory/patterns.ts`, `src/memory/reconsolidate.ts`, `src/storage/database.ts`, `src/adapters/opencode/process-session.ts`, and golden tests.

### Suggested Fix
For recurring broad background exploration failures caused by injected memory context, skip retrying the same task shape. Prefer direct reads or multiple narrow file-specific prompts.

### Metadata
- Reproducible: unknown
- Related Files: src/memory/classifier.ts, src/memory/patterns.ts, src/memory/reconsolidate.ts, src/storage/database.ts
- See Also: ERR-20260501-001

---
