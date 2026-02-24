# True-Memory

> A persistent memory plugin for OpenCode (AI coding assistant) with dual-scope architecture, intelligent decay, and robust false-positive prevention.

---

## Overview

**True-Memory** is a production-ready memory plugin for OpenCode that enables AI coding agents to remember information across sessions and projects.

---

## What Distinguishes True-Memory

| Feature | True-Memory | Other Plugins |
|----------|---------------|---------------|
| **Dual-Scope Model** | ✅ Global (user-level) + Project-specific | Usually single-scope only |
| **Async Fire-and-Forget** | ✅ Non-blocking extraction | Often blocking (causes QUEUED state) |
| **Four-Layer Defense** | ✅ Multi-level false positive prevention | Single-layer filtering |
| **Jaccard Similarity** | ✅ No native dependencies, no memory leaks | Transformers.js embeddings (resource heavy) |
| **Runtime-Agnostic** | ✅ Bun + Node 22+ native SQLite | often single-runtime |
| **Multilingual Support** | ✅ 15 languages, Italian fully supported | English-only typically |
| **Production-Ready** | ✅ Critical bugs fixed (QUEUED, crashes) | May have stability issues |
---

## Key Features

### 1. Dual-Scope Memory System

- **Global memories** (\`project_scope IS NULL\`): User preferences, constraints, learning, procedurals, and user-generated semantic memories
- **Project memories** (\`project_scope = /path/to/project\`): Project-specific decisions, bugfixes, semantic context, episodic events

### 2. Async Fire-and-Forget Extraction

- **Non-blocking**: Extraction runs in background without blocking the UI
- **500ms debounce**: Multiple rapid messages trigger single extraction
- **Result**: No QUEUED state, instant OpenCode startup

### 3. Four-Layer False Positive Prevention

| Layer | Purpose |
|--------|---------|
| 1. Negative Patterns | Filter known false positives |
| 2. Multi-Keyword Scoring | Require 2+ signals |
| 3. Confidence Threshold | Store only if ≥0.6 |
| 4. Role Validation | Human-only for user-level |

### 4. Intelligent Decay

- **Only episodic memories decay**: User preferences, decisions, bugfixes are permanent
- **Temporal decay**: Ebbinghaus curves (λ = 0.05 STM, 0.01 LTM)
- **7-day default**: Episodic memories fade after 7 days of inactivity

### 5. Jaccard Similarity Search

- **No embeddings**: Removed Transformers.js for stability (resource leaks, bundling issues)
- **Jaccard similarity**: Word overlap-based semantic search
- **Fast**: Sub-100ms for typical queries
- **Zero native dependencies**: Works on Bun + Node 22+ with built-in SQLite

---

## Installation

Via file:// (Development):

\`\`\`jsonc
{
  "plugin": [
    "file:///Users/riccardosallusti/Documents/_PROGETTI/true-memory"
  ]
}
\`\`\`

---

## Usage

### Automatic Extraction

True-Memory **automatically extracts memories** from your conversations with OpenCode.

**What gets stored**:
- User preferences: "I prefer TypeScript over JavaScript"
- Constraints: "Never use var keyword"
- Decisions: "We decided to use SQLite instead of Postgres"
- Bugfixes: "Fixed null pointer in auth module"
- Learning: "I learned that bun:sqlite is built-in"

### Explicit Memory Storage

You can explicitly tell True-Memory to remember something:

\`\`\`
"Ricorda questo: prefisco sempre usare TypeScript per i miei progetti"
"Remember this: never commit without running tests first"
\`\`\`

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-24  
**Status**: Production-ready, actively maintained
