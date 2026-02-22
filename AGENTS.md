# True-Memory - AGENTS.md

## ⚠️ CRITICAL CONFIG

```
PROJECTS_ROOT = ~/Documents/_PROGETTI/
THIS_PROJECT  = ~/Documents/_PROGETTI/true-memory

DATABASE      = ~/.true-memory/memory.db
DEBUG_LOG     = ~/.true-memory/debug.log
OPENCODE_CFG  = ~/.config/opencode/opencode.jsonc
```

---

## Project Overview

**True-Memory** è un sistema di memoria persistente per AI coding agents (OpenCode), ispirato a [PsychMem](https://github.com/muratg98/psychmem) ma con correzioni architetturali fondamentali e miglioramenti basati su feedback della community.

### Perché non PsychMem?

PsychMem ha problemi strutturali che lo rendono inutilizzabile:
- **Peer dependency opzionale** (`@opencode-ai/plugin`) → crash all'avvio
- **Logger SDK-dipendente** (`ctx.client.app.log()`) → crash se contesto non pronto
- **Inizializzazione sincrona** → blocca il caricamento del plugin
- **Tipi definiti localmente** → rischio di drift dal SDK

### Perché True-Memory?

| Aspetto | PsychMem | True-Memory |
|---------|----------|-------------|
| Dipendenze | Peer optional | Dipendenze regolari |
| Logger | SDK (crasha) | File-based (robusto) |
| Init | Sync nel default export | Lazy, differita |
| Decay | Temporale su tutto | Solo episodico |
| Similarity | Jaccard (parole) | Vector embeddings (semantico) |
| Retrieval | Tutte le memorie | Top-k contestuali |

---

## I 5 Miglioramenti (dal feedback Reddit)

### 1. Decay Intelligente (non solo temporale)

**Problema PsychMem**: Applica la curva di Ebbinghaus a TUTTE le memorie. Una constraint come "usiamo TypeScript strict" decade se non menzionata per una settimana.

**Soluzione True-Memory**: Separare i tipi di memoria:
- **Memorie Episodiche** (eventi specifici) → decadono nel tempo
- **Memorie Semantiche** (fatti, constraint, decisioni) → permanenti fino a revoca esplicita

```
Episodica: "Ieri abbiamo fixato il bug del login" → decade in 7 giorni
Semantica: "Il progetto usa PostgreSQL" → permanente finché non revocata
```

### 2. Vector Embeddings (non Jaccard)

**Problema PsychMem**: Usa Jaccard similarity (bag-of-words). "DB is broken" e "Postgres crashes" hanno similarità 0.0 ma significano la stessa cosa.

**Soluzione True-Memory**: Usare embeddings vettoriali con cosine similarity:
- text-embedding-3-small (OpenAI)
- BGE (open-source)
- O locale con transformers.js

### 3. Retrieval Contestuale (non injection globale)

**Problema PsychMem**: Inietta TUTTE le memorie user-level o project-level nel context. Con centinaia di memorie, bloata il context window.

**Soluzione True-Memory**: Retrieval contestuale:
1. Embeddelo il prompt corrente dell'utente
2. Cerca nel DB vettoriale le top-k memorie più rilevanti
3. Inietta solo quelle nel context

### 4. Estrazione Asincrona (non blocking)

**Problema PsychMem**: Estrae memorie dopo ogni messaggio, bloccando la risposta. Raddoppia latency e costi API.

**Soluzione True-Memory**: Background processing:
1. L'agente risponde subito all'utente
2. Un processo background analizza la conversazione
3. Aggiorna il DB in modo asincrono

### 5. Reconsolidation LLM (non interferenza automatica)

**Problema PsychMem**: Se due memorie hanno similarità 0.3-0.8, le penalizza automaticamente. "User prefers modular functions" e "User prefers pure functions" sono complementari, non conflittuali.

**Soluzione True-Memory**: Reconsolidation con LLM:
1. Rilevata potenziale interferenza
2. Chiedi a un piccolo LLM: "Conflitto, complemento o duplicato?"
3. Agisci di conseguenza

---

## Architettura

```
true-memory/
├── src/
│   ├── index.ts              # Entry point plugin (default export)
│   ├── types.ts              # Type definitions
│   ├── logger.ts             # File-based logger (no SDK dependency)
│   ├── memory/
│   │   ├── store.ts          # SQLite storage (lazy init)
│   │   ├── embeddings.ts     # Vector embeddings
│   │   ├── retrieval.ts      # Contextual retrieval
│   │   └── classifications.ts # Memory types (episodic vs semantic)
│   ├── extraction/
│   │   ├── patterns.ts       # Regex patterns for extraction
│   │   ├── scorer.ts         # Feature scoring
│   │   └── background.ts     # Async extraction queue
│   └── hooks/
│       ├── session.ts        # Session start/end handlers
│       ├── message.ts        # Message processing
│       └── injection.ts      # Context injection
├── package.json
├── tsconfig.json
└── AGENTS.md                 # This file
```

---

## Classificazioni Memorie

| Tipo | Decay | Esempio |
|------|-------|---------|
| **constraint** | Mai | "Never use `var` in TypeScript" |
| **preference** | Mai | "Prefers functional style" |
| **decision** | Mai | "Decided to use SQLite over Postgres" |
| **bugfix** | Mai | "Fixed null pointer in auth" |
| **learning** | Mai | "Learned that bun:sqlite has different API" |
| **procedural** | Mai | "Run tests before committing" |
| **episodic** | Sì (7 giorni) | "Yesterday we refactored auth" |
| **semantic** | Mai | "The API uses REST, not GraphQL" |

### Scope

| Scope | Iniezione |
|-------|-----------|
| **user-level** | Sempre (constraint, preference, learning, procedural) |
| **project-level** | Solo se matching project (decision, bugfix, semantic, episodic) |

---

## Plugin Installation

### Via file:// (sviluppo)

```json
// opencode.jsonc
{
  "plugin": ["file:///Users/riccardosallusti/Documents/_PROGETTI/true-memory"]
}
```

### Via npm (produzione)

```json
// opencode.jsonc
{
  "plugin": ["true-memory"]
}
```

---

## Dependencies Strategy

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.2.6",  // REGULAR dependency, not peer!
    "uuid": "^13.0.0",
    "better-sqlite3": "^12.0.0"        // O node:sqlite per Node 22+
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/better-sqlite3": "^7.0.0"
  }
}
```

**IMPORTANTE**: `@opencode-ai/plugin` deve essere una dipendenza REGOLARE, non peer optional. Questo garantisce che i tipi siano sempre disponibili e compatibili.

---

## Logger

NON usare `ctx.client.app.log()`. Usa file-based logging:

```typescript
// src/logger.ts
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_DIR = join(homedir(), '.true-memory');
const LOG_FILE = join(LOG_DIR, 'debug.log');

export function log(message: string, data?: unknown): void {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;
    appendFileSync(LOG_FILE, entry);
  } catch {
    // Silently ignore
  }
}
```

---

## Lazy Initialization

IL DEFAULT EXPORT NON DEVE FARE INIT PESANTE:

```typescript
// src/index.ts
import type { Plugin } from '@opencode-ai/plugin';

let memoryStore: MemoryStore | null = null;

async function getStore(): Promise<MemoryStore> {
  if (!memoryStore) {
    memoryStore = await MemoryStore.create();
  }
  return memoryStore;
}

const TrueMemory: Plugin = async (ctx) => {
  log('Plugin loaded, lazy init pending');
  
  return {
    name: 'true-memory',
    
    event: async ({ event }) => {
      const store = await getStore(); // Lazy init here
      // Handle events...
    },
  };
};

export default TrueMemory;
```

---

## Debug

```bash
# Visualizzare log
tail -f ~/.true-memory/debug.log

# Query database
sqlite3 ~/.true-memory/memory.db "SELECT COUNT(*), type FROM memories GROUP BY type;"

# Cercare errori
grep -i "error" ~/.true-memory/debug.log
```

---

## Notes

- **Creato**: 22/02/2026
- **Ispirato da**: [PsychMem](https://github.com/muratg98/psychmem)
- **Miglioramenti**: Basati su feedback Reddit r/opencodeCLI
- **Obiettivo**: Plugin di memoria robusto, senza crash, semanticamente intelligente
