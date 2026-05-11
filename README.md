# True-Mem v1.4.1

> A persistent memory plugin for OpenCode with cognitive psychology-based memory management.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Noise Filtering](#noise-filtering)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Viewer](#viewer)
- [Memory Injection Tracking](#memory-injection-tracking)
- [Advanced: Semantic Embeddings (Experimental)](#advanced-semantic-embeddings-experimental)
- [Architecture](#architecture)
- [Pipeline Engine](#pipeline-engine)
- [Memory Classifications](#memory-classifications)
- [Technical Details](#technical-details)
- [Contributing](#contributing)
- [Debug](#debug)

---

## Overview

**True-Mem** is a memory plugin for OpenCode that enables AI coding agents to remember information across sessions and projects. It doesn't just store information - it manages memory like a human mind would.

---

## The Problem

If you've ever had to repeat your preferences to your AI assistant every time you start a new session, you know the pain. "I prefer TypeScript over JavaScript", "Never use `var`", "Always run tests before committing" - things you've already said, but the AI forgot.

---

## The Solution

True-Mem automatically extracts and stores memories from your conversations:

- **Preferences**: "I prefer functional style over OOP"
- **Constraints**: "Never use `var` keyword"
- **Decisions**: "We decided to use SQLite instead of Postgres for this project"
- **Semantic info**: "The API uses REST, not GraphQL"
- **Learning**: "Learned that bun:sqlite is built-in"

Next time you open OpenCode, it remembers. No more repeating yourself.

---

## The Psychology Behind It

What makes True-Mem different from a simple database? It's modeled after how human memory actually works:

**Ebbinghaus Forgetting Curve** - Episodic memories fade over time (7-day default), while preferences and decisions stay permanent. Just like your brain forgets what you had for lunch last Tuesday but remembers your favorite color.

**7-Feature Scoring Model** - Every memory is scored using Recency, Frequency, Importance, Utility, Novelty, Confidence, and Interference. This determines which memories surface when you need them.

**Dual-Store Architecture (STM/LTM)** - Short-term and long-term memory stores with automatic promotion. High-strength memories get promoted to LTM; weak ones stay in STM or decay.

**Four-Layer Defense System** - Prevents false positives with Question Detection (filters questions before classification), Negative Pattern filtering (including AI meta-talk detection), Multi-Keyword Scoring with sentence-level isolation, Confidence Thresholds, and Role Validation (only Human messages for user-level preferences).

**Reconsolidation** - When new information conflicts with existing memories, the system detects similarity and handles it intelligently (merge duplicates, keep both complements, or resolve conflicts).

**Dual Similarity Modes** - Jaccard (default, fast token matching) or ML embeddings (experimental, semantic understanding).

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Dual-Scope Memory** | Global (follows you across projects) + Project-specific |
| **Non-Blocking** | Async extraction, no UI freezes or QUEUED states |
| **Multilingual** | Full support for Italian, Spanish, French, German, and 11 more languages |
| **Smart Decay** | Only episodic memories fade; preferences and decisions stay forever |
| **Zero Native Dependencies** | Works on Bun and Node 22+ with built-in SQLite |
| **Local Viewer** | Chinese web UI for browsing, filtering, monitoring, sessions, and configuring memories on localhost |
| **Memory Injection Tracking** | Records every injected memory per session with timeline visualization |
| **Dual Injection** | Memories injected into both main-agent prompts and sub-agent (task/background_task) prompts |
| **Pipeline Engine** | Controlled cutover architecture: ingest, retrieve, decay, and maintenance pipelines with shadow-run comparison |
| **Proactive Suggestions** | Automatically inserts relevant memories as suggestions when the user pattern matches |

---

## Noise Filtering

What truly sets True-Mem apart is its ability to distinguish **signal from noise**. Unlike simpler memory plugins that store everything matching a keyword, True-Mem understands context and intent:

**What gets filtered OUT:**

| Pattern Type | Example | Why filtered |
|--------------|---------|--------------|
| Questions | "Do you remember this?" | It's a question, not a statement |
| 1st person recall | "I remember when we fixed that" | Recounting, not requesting storage |
| Remind-me recall | "Remind me how we did this" | Asking AI to recall info, not store |
| AI meta-talk | "Goal: The user is trying to..." | AI-generated, not user content |
| List selections | "I prefer option 3" | Context-specific choice, not general preference |

**What gets stored:**

| Pattern Type | Example | Why stored |
|--------------|---------|------------|
| Imperatives | "Remember this: always run tests" | Explicit storage request |
| Preferences | "I prefer TypeScript over JavaScript" | General, reusable preference |
| Decisions | "We decided to use SQLite" | Project-level decision |
| Constraints | "Never use var keyword" | Permanent rule |

All filtering patterns support **10 languages**: English, Italian, Spanish, French, German, Portuguese, Dutch, Polish, Turkish, and Russian.

---

## Installation

Add to your `~/.config/opencode/opencode.jsonc`:

```
{
  "plugin": [
    "true-mem"
  ]
}
```

OpenCode will automatically download the plugin from npm.

A `~/.true-mem/` directory will be created to store the SQLite database and debug logs.

After restarting OpenCode, you'll see a toast notification confirming the plugin is loaded:

```
True-Mem v1.4.1
Memory active.
```

This confirms True-Mem is installed and working correctly.

---

## Configuration

True-Mem creates a configuration file at `~/.true-mem/config.jsonc` on first run. You can edit this file to customize behavior:

```
{
  // Storage location: "legacy" = ~/.true-mem/ (default), "opencode" = ~/.config/opencode/true-mem/
  "storageLocation": "legacy",

  // Injection mode: 0 = session start only, 1 = every prompt (default)
  "injectionMode": 1,

  // Sub-agent mode: 0 = disabled, 1 = enabled (default)
  "subagentMode": 1,

  // Embeddings: 0 = Jaccard similarity only, 1 = hybrid (Jaccard + embeddings)
  "embeddingsEnabled": 0,

  // Maximum memories to inject per prompt (10-50 recommended)
  "maxMemories": 20,

  // Retrieve pipeline: 0 = legacy scope reads only, 1 = use pipeline with SQLite-first fallback (default: 0)
  "retrievePipelineEnabled": 0,

  // Proactive suggestions: 0 = disabled, 1 = enabled (default)
  "proactiveEnabled": 1
}
```

### Settings Explained

| Setting | Values | Description |
|---------|--------|-------------|
| **storageLocation** | `"legacy"` or `"opencode"` | Where to store data. `"legacy"` = `~/.true-mem/` (default). `"opencode"` = `~/.config/opencode/true-mem/` |
| **injectionMode** | `0` or `1` | `0` = inject memories only at session start (saves tokens). `1` = inject on every prompt (default) |
| **subagentMode** | `0` or `1` | `0` = disable memory injection for sub-agents. `1` = enable for sub-agents (default) |
| **embeddingsEnabled** | `0` or `1` | `0` = use Jaccard similarity only (fast, default). `1` = use hybrid semantic embeddings (experimental) |
| **maxMemories** | `10-50` | How many memories to include in each prompt (default: 20). Lower = fewer tokens, Higher = more context |
| **retrievePipelineEnabled** | `0` or `1` | `0` = legacy scope reads. `1` = use pipeline-based retrieval with SQLite-first fallback (experimental) |
| **proactiveEnabled** | `0` or `1` | `0` = disabled. `1` = auto-insert relevant memory suggestions when user patterns match |

**Injection Mode Trade-off:**
- **Mode 1 (ALWAYS)** - Default. Real-time memory updates, at each prompt. New memories appear immediately. Best for most users.
- **Mode 0 (SESSION_START)**: Memories are injected once at session start (both /new and --continue). New memories extracted during the session won't appear until you restart OpenCode. Best for long sessions (20+ prompts) where token cost matters.

### Environment Variables

You can also configure via environment variables (override config file):

| Variable | Values | Description |
|----------|--------|-------------|
| `TRUE_MEM_STORAGE_LOCATION` | `legacy` or `opencode` | Override storageLocation setting |
| `TRUE_MEM_INJECTION_MODE` | `0` or `1` | Override injectionMode setting |
| `TRUE_MEM_SUBAGENT_MODE` | `0` or `1` | Override subagentMode setting |
| `TRUE_MEM_EMBEDDINGS` | `0` or `1` | Override embeddingsEnabled setting |
| `TRUE_MEM_MAX_MEMORIES` | `10-50` | Override maxMemories setting |
| `TRUE_MEM_RETRIEVE_PIPELINE` | `0` or `1` | Override retrievePipelineEnabled setting |

Example:
```bash
export TRUE_MEM_STORAGE_LOCATION=opencode
export TRUE_MEM_INJECTION_MODE=1
export TRUE_MEM_MAX_MEMORIES=25
opencode
```

### Changing Storage Location

When you change `storageLocation` (via config or env var), True-Mem v1.4.1 automatically migrates your data:

1. **Automatic copy** - If the new location has no data, the existing database is copied from the old location
2. **Non-destructive** - Original data is preserved as backup (you can revert by switching back)
3. **Config + state** - Along with the database, `state.json` and `config.jsonc` are also copied if they exist

**After migration**, you can safely delete the old location's folder to free up disk space:
- Legacy: `rm -rf ~/.true-mem/`
- OpenCode: `rm -rf ~/.config/opencode/true-mem/`

**Note:** If the source database has active WAL/SHM files (not cleanly closed), migration is skipped to avoid data inconsistency.

---

## Usage

### Viewer

True-Mem includes a local Chinese web viewer for single-user memory inspection and management.

```bash
bun run build
bun run viewer
```

Open `http://127.0.0.1:3456` in your browser. The Viewer is bound to loopback by default and reads the active SQLite database from the configured storage location.

The Viewer provides five tabs:

| Tab | Purpose |
|-----|---------|
| 记忆列表 | Search, filter, expand details, soft delete/restore, and reclassify memory entries with virtual scrolling and smart refresh |
| 会话记录 | Session list with memory injection timeline - shows which sessions received which memories, with pagination and injection detail view |
| 数据统计 | Charts for store, classification, creation trend, status, project, and strength metrics |
| 运行监控 | SQLite-inferred activity, errors, active sessions, memory health, and recent events |
| 设置 | Edit `config.jsonc` values such as storage location, injection mode, sub-agent mode, embeddings, and max memories |

The Viewer UI features a modern dark theme, Lucide icon system, card-based layouts with gradient surfaces, fade/slide animations, responsive mobile layout, and virtual scrolling for large memory lists.

For development, run the backend and Vite UI separately:

```bash
bun run viewer
bun run viewer:dev
```

The development UI proxies `/api/*` to `http://127.0.0.1:3456`.

### Automatic Extraction

Just have conversations with OpenCode. True-Mem extracts relevant info in the background.

**What gets stored**:
- User preferences: "I prefer TypeScript over JavaScript"
- Constraints: "Never use var keyword"
- Decisions: "We decided to use SQLite instead of Postgres"
- Semantic info: "The API uses REST, not GraphQL"
- Learning: "I learned that bun:sqlite is built-in"

### List Injected Memories

To see which memories are currently injected in your prompt, use one of:

```
list-memories
list-memory
show-memory
```

All three commands are equivalent and display all memories grouped by scope (Global/Project) and store (LTM/STM). Useful for debugging or understanding what the AI remembers about you.

### Delete a Memory

To delete a specific memory from True-Mem, ask your AI assistant mentioning "true-mem" to avoid confusion with other memory plugins:

```
"Delete the true-mem memory about using bun"
"Remove from true-mem the memory that says 'always run tests'"
```

The AI assistant can directly query and update the SQLite database at `~/.true-mem/memory.db`.

### Explicit Memory Storage

Use phrases like "Remember this:" or "Remember that ..." to force storage:

```
"Remember this: never commit without running tests first"
"Remember that I prefer to use TypeScript in my projects"
```

**Scope Behavior**:

By default, explicit intent memories are stored at **project scope** (only visible in the current project). To make them **global** (available in all projects), include a global scope keyword anywhere in your phrase:

| Language | Global Scope Keywords |
|----------|---------------------|
| **English** | "always", "everywhere", "for all projects", "in every project", "globally" |
| **Italian** | "sempre", "ovunque", "per tutti i progetti", "in ogni progetto", "globalmente" |
| **Spanish** | "siempre", "en todas partes", "para todos los proyectos" |
| **French** | "toujours", "partout", "pour tous les projets" |
| **German** | "immer", "überall", "für alle projekte" |
| **Portuguese** | "sempre", "em todos os projetos" |

**Examples**:

| Memory | Scope | Phrase |
|---------|---------|---------|
| **Project** | `project_scope = current_project` | "Remember that we use REST for the API" |
| **Global** | `project_scope = null` | "Remember to _always_ run tests before committing" |
| **Global** | `project_scope = null` | "Remember that I _always_ use Typescript _in every project_" |

---

## Memory Injection Tracking

True-Mem v1.4.1 introduces a complete memory injection tracking system that answers the fundamental question: **"Which memories were injected into which sessions?"**

### How It Works

Every time memories are injected into a model prompt (main agent or sub-agent), True-Mem records:
- Which session received the injection
- Which memories were injected (by memory ID)
- When the injection occurred
- The relevance score of each memory at injection time
- The injection context (truncated prompt context that triggered selection)

These records are stored in the `memory_injections` table in SQLite, linked to both `sessions` and `memory_units` via foreign keys.

### Injection Entry Points

| Entry Point | Trigger | Coverage |
|-------------|---------|----------|
| `experimental.chat.system.transform` | Every model request to the main LLM | Main agent prompts |
| `tool.execute.before` | Every `task`/`background_task` call | Sub-agent prompts |
| `experimental.session.compacting` | Session compaction event | Compacted session summaries |

### Viewer Integration

Open the **会话记录** (Sessions) tab in the Viewer to:
- Browse all sessions with pagination
- See which sessions received memory injections and how many
- Click into a session to view its full injection timeline
- Each injection entry shows memory summary, classification, store (LTM/STM), relevance score, and timestamp

---

## Advanced: Semantic Embeddings (Experimental)

True-Mem includes an **experimental** NLP embeddings feature that provides semantic similarity search beyond basic Jaccard matching.

### What It Does

When enabled, True-Mem uses a lightweight transformer model (all-MiniLM-L6-v2) to generate 384-dimensional embeddings for each memory. This enables:

- **Semantic retrieval** - Find memories by meaning, not just keyword matching
- **Better relevance** - Understands that "I like TypeScript" relates to "JavaScript preferences"
- **Cross-lingual support** - Works across the 15 supported languages

### How It Works

**Architecture:**
```
Main Thread (Bun) → Node.js Worker Process → Transformers.js v4 → ONNX Runtime
```

The plugin spawns a separate Node.js process to run the transformer model in isolation, ensuring Bun stability. The model is automatically downloaded on first use and cached locally.

**Trade-offs:**
- **Storage**: ~23MB for cached model (downloaded once to `~/.true-mem/models/`)
- **Memory**: ~200MB RAM when worker is active (during embedding generation)
- **Init time**: 2-3 seconds on first use (model loading)
- **Hot-reload resilient**: Debounce (1s) prevents spawn thrashing

### Enabling Embeddings

Edit `~/.true-mem/config.jsonc` and set:

```
{
  "embeddingsEnabled": 1
}
```

Or use environment variable:

```bash
export TRUE_MEM_EMBEDDINGS=1
opencode
```

To disable, set to `0` or remove the line from config.

### Status

**Experimental** - The feature works well but is still being tested. The Jaccard-only mode (default) is production-stable. When embeddings are enabled, the system gracefully falls back to Jaccard if the worker fails (circuit breaker: 3 failures / 5 minutes).

### Checking If Active

```bash
# Check config file
cat ~/.true-mem/config.jsonc | grep embeddingsEnabled

# Check logs for [embeddings=true] tag
tail -f ~/.true-mem/plugin-debug.log | grep "embeddings"
```

---

## Architecture

```
true-mem/
├── src/
│   ├── index.ts                     # Plugin entry point with fire-and-forget init + hot-reload
│   ├── state.ts                     # Plugin state management
│   ├── logger.ts                    # File-based debug logging
│   ├── shutdown.ts                  # Graceful shutdown (LIFO handlers, no signal traps)
│   ├── acl/                         # Access control layer
│   ├── adapters/
│   │   └── opencode/
│   │       ├── index.ts             # Full extraction + injection hooks
│   │       ├── injection.ts         # Memory injection selection + wrapping logic
│   │       ├── injection-tracker.ts # Session injection tracking (mode 0/1)
│   │       ├── memory-retrieval.ts  # Compaction query memory retrieval
│   │       ├── retrieve-pipeline-routing.ts  # Pipeline-controlled retrieval routing
│   │       ├── session-lifecycle.ts # Session lifecycle hook handlers
│   │       ├── process-session.ts   # Session message extraction pipeline
│   │       └── session-manager.ts   # Session lifecycle management
│   ├── config/
│   │   ├── config.ts                # JSONC config loading with env override
│   │   ├── state.ts                 # Runtime state persistence
│   │   ├── migration.ts             # Config migration (v1.2 → v1.3)
│   │   └── injection-mode.ts       # Injection mode utilities
│   ├── domain/                      # Domain logic boundary
│   ├── extraction/
│   │   └── queue.ts                 # Fire-and-forget sequential extraction queue
│   ├── llm/                         # LLM provider abstraction layer
│   ├── memory/
│   │   ├── patterns.ts              # Multilingual patterns (15 languages)
│   │   ├── negative-patterns.ts     # False positive prevention (10 languages)
│   │   ├── role-patterns.ts         # Role-aware extraction (Human vs Assistant)
│   │   ├── classifier.ts            # Four-layer defense + role validation
│   │   ├── similarity.ts            # Jaccard similarity search
│   │   ├── embeddings-nlp.ts        # NLP embeddings worker management
│   │   ├── embedding-worker.ts      # Worker process for transformer model
│   │   └── reconsolidate.ts         # Conflict resolution
│   ├── pipeline/
│   │   ├── index.ts                 # Pipeline registry and exports
│   │   ├── types.ts                 # Pipeline type definitions
│   │   ├── manager.ts               # Pipeline execution engine
│   │   ├── ingest.ts                # Memory ingest pipeline context
│   │   ├── retrieve.ts              # Memory retrieve pipeline context
│   │   ├── decay.ts                 # Memory decay pipeline context
│   │   ├── maintenance.ts           # Memory maintenance pipeline context
│   │   ├── ingest-bridge.ts         # Controlled cutover bridge for process-session.ts
│   │   └── steps/
│   │       ├── ingest.ts            # Ingest pipeline steps (normalize/classify/dedupe/persist)
│   │       ├── retrieve.ts          # Retrieve pipeline steps (scope/sqlite/query/vector_hint)
│   │       └── pattern-detect.ts    # Pattern detection pipeline step
│   ├── scope/                       # Scope context management
│   ├── storage/
│   │   ├── port.ts                  # StorageProvider port interface (session/event/read/write/maintenance/injection)
│   │   └── database.ts              # MemoryDatabase implementation with scope filtering + safe JSON parsing
│   ├── templates/                   # Template files
│   ├── types/
│   │   ├── config.ts                # Config type definitions with DEFAULT_USER_CONFIG
│   │   └── database.ts              # MemoryUnit, Session, Event type definitions
│   ├── upgrade/                     # Upgrade/migration utilities
│   ├── utils/
│   │   ├── version.ts               # Version utilities
│   │   ├── jsonc.ts                 # JSONC parser with comments
│   │   └── toast.ts                 # Toast notifications
│   └── viewer/
│       ├── server/
│       │   ├── index.ts             # Hono server entry point (port 3456)
│       │   ├── db.ts                # Viewer-side DB read adapter
│       │   └── routes/
│       │       ├── memories.ts      # Memory CRUD + search/filter routes
│       │       ├── sessions.ts      # Session list/detail/injection routes
│       │       ├── stats.ts         # Statistics aggregation routes
│       │       ├── monitor.ts       # Monitoring/memory health routes
│       │       └── settings.ts      # Config read/write routes
│       ├── shared/
│       │   └── types.ts             # Shared Viewer types
│       └── ui/
│           ├── App.tsx              # Main app with 5-tab navigation + icons
│           ├── state.ts             # Viewer state management
│           ├── components/
│           │   ├── shared/          # Shared UI components (loading, empty, etc.)
│           │   └── tabs/
│           │       ├── FeedTab.tsx      # Memory list with virtual scrolling + smart refresh
│           │       ├── SessionsTab.tsx  # Session list + injection timeline
│           │       ├── StatsTab.tsx     # Charts and statistics
│           │       ├── MonitorTab.tsx   # System monitoring
│           │       └── SettingsTab.tsx  # Configuration editor
│           ├── i18n/                # Internationalization
│           ├── lib/api/             # API client utilities
│           └── styles/
│               └── index.css        # Tailwind styles with custom dark theme
├── dist/
│   ├── index.js                     # Plugin bundle (~218 KB)
│   ├── memory/
│   │   └── embedding-worker.js      # Worker bundle (~3 KB)
│   ├── viewer/
│   │   └── index.html               # Built Viewer SPA
│   └── viewer-server/
│       └── index.js                 # Viewer server bundle (~113 KB)
```

---

## Pipeline Engine

True-Mem v1.4.1 introduces a controlled pipeline engine architecture for safe migration from legacy v1 code paths:

### Design Principles

| Principle | Description |
|-----------|-------------|
| **Non-destructive** | All pipeline features are off by default; legacy paths unchanged |
| **Controlled cutover** | Each pipeline replaces one legacy path at a time, with feature flags |
| **Fallback safety** | Pipeline failure must never block or corrupt the legacy code path |
| **Shadow-run comparison** | New pipeline paths run alongside legacy for diff telemetry |

### Available Pipelines

| Pipeline | Purpose | Status |
|----------|---------|--------|
| `memory.ingest` | Normalize, classify, deduplicate, persist memory from session content | Controlled (off by default) |
| `memory.retrieve` | Scope-enforced SQLite-first retrieval with optional query ranking | Controlled (off by default) |
| `memory.decay` | Apply forgetting curve decay to episodic memories | Legacy (v1 path active) |
| `memory.maintenance` | Consolidation and maintenance operations | Legacy (v1 path active) |

### Controlled Cutover Flow

```
Session Message
     │
     ▼
┌─────────────────────┐
│  Legacy Extraction   │  (always active)
│  v1 classifier       │
│  v1 database write   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐  ┌──────────────────────┐
│  Ingest Pipeline     │  │  Shadow-run (if       │
│  TRUE_MEM_INGEST_    │  │  enabled) compares    │
│  WRITE=1             │  │  v1 vs pipeline       │
└─────────────────────┘  └──────────────────────┘
          │
          ▼
┌─────────────────────┐
│  Retrieve Pipeline   │  (if TRUE_MEM_RETRIEVE_ │
│  SQLite-first scope  │   PIPELINE=1)
│  query routing       │
└─────────────────────┘
```

---

## Memory Classifications

| Type | Decay | Store | Scope | Example |
|------|-------|-------|-------|---------|
| **constraint** | Never | STM/LTM | Global | "Never use `var`" |
| **preference** | Never | STM/LTM | Global | "Prefers functional style" |
| **learning** | Never | LTM | Global | "Learned bun:sqlite API" |
| **procedural** | Never | STM/LTM | Global | "Run tests before commit" |
| **decision** | Never | LTM | Project | "Decided SQLite over Postgres" |
| **semantic** | Never | STM/LTM | Project | "API uses REST, not GraphQL" |
| **episodic** | Yes (7d) | STM | Project | "Yesterday we refactored auth" |

Note: `constraint` and `procedural` can be promoted to LTM via strength scoring. Scope is determined by `project_scope` column at time of injection, not classification alone.

---

## Technical Details

### 7-Feature Scoring Model

| Feature | Weight | Description |
|---------|--------|-------------|
| Recency | 0.20 | Time since creation (0 = recent, 1 = old) |
| Frequency | 0.15 | Number of accesses (log scale) |
| Importance | 0.25 | Combination of signals (diminishing returns) |
| Utility | 0.20 | Usefulness for current task |
| Novelty | 0.10 | Distance from existing memories |
| Confidence | 0.10 | Consensus of extraction evidence |
| Interference | -0.10 | Penalty for conflicts |

**Strength Formula**: `Strength = Sum(weight_i * feature_i)` clamped to [0, 1]

### Four-Layer False Positive Prevention

| Layer | Purpose |
|-------|---------|
| 1. Question Detection | Filter questions before classification |
| 2. Negative Patterns | AI meta-talk, list selections, 1st person recall, remind-me recall (10 languages) |
| 3. Multi-Keyword + Sentence-Level | Require 2+ signals in the same sentence |
| 4. Confidence Threshold | Store only if score >= 0.6 |

### Decay Strategy

- **Episodic memories**: Decay using Ebbinghaus formula (lambda = 0.05 STM, 0.01 LTM)
- **All other types**: Permanent (no decay)

### Safe JSON Parsing

Injection and extraction paths now include safe JSON parsing wrappers (`safeParseJsonObject`, `safeParseJsonStringArray`) to gracefully degrade malformed `tags`, `associations`, `source_event_ids`, or `metadata` fields to empty defaults with a log warning, preventing a single bad data field from failing an entire injection cycle.

---

## Contributing

Want to contribute or test your own changes? Here's how:

1. **Fork this repository**

2. **Build the plugin**
   ```bash
   cd true-mem
   bun install
   bun run build
   ```

3. **Use your local version** in `~/.config/opencode/opencode.json`:
   ```json
   {
     "plugin": [
       "file:///path/to/your/fork/true-mem"
     ]
   }
   ```

4. **Restart OpenCode** - it will load your local build instead of the npm version.

5. **Make your changes**, rebuild with `bun run build`, and test.

6. **Submit a PR** when ready!

Inspired by [PsychMem](https://github.com/muratg98/psychmem) - a pioneering plugin for persistent memory in OpenCode.

---

## Debug

```bash
# View logs
tail -f ~/.true-mem/plugin-debug.log

# Query active memories by strength
sqlite3 ~/.true-mem/memory.db "SELECT classification, summary, strength FROM memory_units WHERE status = 'active' ORDER BY strength DESC LIMIT 10;"

# Check injection history per session
sqlite3 ~/.true-mem/memory.db "SELECT mi.session_id, mi.memory_id, mu.summary, mi.injected_at FROM memory_injections mi LEFT JOIN memory_units mu ON mi.memory_id = mu.id ORDER BY mi.injected_at DESC LIMIT 10;"
```

---

**License**: MIT
**Version**: 1.4.1
**Status**: Actively maintained
