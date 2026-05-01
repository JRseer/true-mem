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
