# True-Memory - Implementation Plan

## Overview

Questo documento descrive il piano di implementazione di True-Memory, un plugin di memoria persistente per OpenCode. Leggi prima `AGENTS.md` per il context completo.

---

## Fasi di Implementazione

### FASE 1: Foundation (MVP)

**Obiettivo**: Plugin funzionante che carica senza crashare e salva/recupera memorie basilari.

#### Step 1.1: Setup progetto

```bash
cd ~/Documents/_PROGETTI/true-memory
npm init -y
npm install @opencode-ai/plugin uuid better-sqlite3
npm install -D typescript @types/node @types/better-sqlite3 esbuild
```

#### Step 1.2: Configurazione TypeScript

Crea `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### Step 1.3: Struttura cartelle

```bash
mkdir -p src/{memory,extraction,hooks}
touch src/index.ts
touch src/types.ts
touch src/logger.ts
touch src/memory/store.ts
touch src/memory/classifications.ts
```

#### Step 1.4: Logger (file-based)

Crea `src/logger.ts`:
- File-based logging in `~/.true-memory/debug.log`
- NO dipendenza da `ctx.client.app.log()`
- Funzione `log(message, data?)`

#### Step 1.5: Types

Crea `src/types.ts`:
- Importa tipi da `@opencode-ai/plugin`
- Definisci `Memory`, `MemoryType`, `MemoryScope`
- Definisci `TrueMemoryConfig`

#### Step 1.6: Classificazioni

Crea `src/memory/classifications.ts`:
- `DECAYING_TYPES`: episodic (decadono)
- `PERMANENT_TYPES`: constraint, preference, decision, bugfix, learning, procedural, semantic
- `USER_LEVEL_TYPES`: sempre iniettati
- `PROJECT_LEVEL_TYPES`: solo se matching project

#### Step 1.7: Memory Store (SQLite)

Crea `src/memory/store.ts`:
- Classe `MemoryStore` con init lazy
- Database path: `~/.true-memory/memory.db`
- **WAL mode** (`PRAGMA journal_mode = WAL`) per concorrenza
  - SQLite creerà automaticamente `memory.db-shm` e `memory.db-wal`
  - Questi 3 file insieme formano UN solo database (non 3 separati)
- Schema DB:
  ```sql
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    scope TEXT NOT NULL,  -- 'user' or project path
    content TEXT NOT NULL,
    embedding BLOB,       -- Per vector search (fase 2)
    strength REAL DEFAULT 1.0,
    created_at TEXT,
    last_accessed TEXT,
    decay_type TEXT       -- 'temporal' or 'explicit'
  );
  ```
- Metodi: `add()`, `get()`, `search()`, `decay()`, `delete()`

#### Step 1.8: Entry Point

Crea `src/index.ts`:
- Default export: async function `(ctx) => PluginHooks`
- Lazy initialization dello store
- Hooks minimi: `event`, `tool.execute.after`
- NO init pesante nel default export

#### Step 1.9: Build script

Aggiungi a `package.json`:
```json
{
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

#### Step 1.10: Test locale

```bash
npm run build
```

Configura `opencode.jsonc`:
```json
{
  "plugin": ["file:///Users/riccardosallusti/Documents/_PROGETTI/true-memory"]
}
```

Avvia OpenCode e verifica:
- [ ] Plugin carica senza crash
- [ ] Log creato in `~/.true-memory/debug.log`
- [ ] Database creato in `~/.true-memory/memory.db`

---

### FASE 2: Memory Extraction

**Obiettivo**: Estrarre memorie dalle conversazioni.

#### Step 2.1: Pattern matching

Crea `src/extraction/patterns.ts`:
- Regex patterns per identificare importanza
- Pattern multilingua (copiare da psychmem)
- Categorie: explicit_remember, emphasis, bug_fix, learning, decision, constraint, preference

#### Step 2.2: Feature scorer

Crea `src/extraction/scorer.ts`:
- Calcola `strength` basato su:
  - Recency (0.20)
  - Frequency (0.15)
  - Importance (0.25)
  - Utility (0.20)
  - Novelty (0.10)
  - Confidence (0.10)

#### Step 2.3: Extraction logic

Crea `src/extraction/extract.ts`:
- Funzione `extractMemories(conversationText)`
- Returns array di `Memory` candidates

#### Step 2.4: Hook handlers

Crea `src/hooks/message.ts`:
- Hook `message.updated`
- Estrai memorie dal messaggio
- Salva nel store

---

### FASE 3: Memory Injection

**Obiettivo**: Iniettare memorie rilevanti nel context.

#### Step 3.1: Session hooks

Crea `src/hooks/session.ts`:
- Hook `session.created`
- Lazy injection (solo al primo user message per sessioni continuate)
- Traccia `injectedSessions: Set<string>`

#### Step 3.2: Retrieval (basic)

Crea `src/memory/retrieval.ts`:
- Funzione `getRelevantMemories(projectPath, limit)`
- Per ora: query semplice per scope e type
- Filtra: user-level sempre, project-level solo se matching

#### Step 3.3: Injection

Crea `src/hooks/injection.ts`:
- Formatta memorie per injection
- Usa `ctx.client.session.prompt({ noReply: true, ... })`
- Header markdown strutturato

---

### FASE 4: Vector Embeddings (Advanced)

**Obiettivo**: Retrieval semantico con embeddings.

#### Step 4.1: Scelta embeddings

Opzioni:
1. **OpenAI text-embedding-3-small** (richiede API key)
2. **Local con transformers.js** (nessuna API, ma più lento)
3. **BGE via API** (open-source)

**Raccomandato per MVP**: Opzione 1 con fallback a opzione 2

#### Step 4.2: Embeddings module

Crea `src/memory/embeddings.ts`:
- Funzione `embed(text): Promise<number[]>`
- Funzione `cosineSimilarity(a, b): number`
- Cache per embeddings esistenti

#### Step 4.3: Vector search

Aggiorna `src/memory/store.ts`:
- Salva embeddings come BLOB
- Funzione `vectorSearch(queryEmbedding, k): Memory[]`
- SQLite non supporta vector nativamente, usa cosine similarity in-memory per ora

#### Step 4.4: Contextual retrieval

Aggiorna `src/memory/retrieval.ts`:
- Embeddelo il prompt utente
- Cerca top-k memorie più simili
- Filtra per scope (user-level sempre, project-level condizionale)

---

### FASE 5: Intelligent Decay

**Obiettivo**: Decay solo per memorie episodiche.

#### Step 5.1: Decay logic

Aggiorna `src/memory/store.ts`:
- Funzione `applyDecay()`
- Applica solo a `decay_type = 'temporal'` (episodic)
- Formula: `S(t) = S₀ × e^(-λt)` con λ = 0.05 per STM
- Rimuovi memorie con S < 0.1

#### Step 5.2: Decay scheduling

Crea `src/memory/decay.ts`:
- Esegui decay ogni ora (o a ogni session start)
- Logga memorie rimosse

---

### FASE 6: Background Processing (Advanced)

**Obiettivo**: Estrazione asincrona non blocking.

#### Step 6.1: Queue system

Crea `src/extraction/queue.ts`:
- Coda di messaggi da processare
- Processa in background ogni N secondi
- Non blocca la risposta all'utente

#### Step 6.2: Integration

Aggiorna `src/hooks/message.ts`:
- Aggiungi messaggio alla coda invece di processare subito
- Rispondi subito all'utente

---

### FASE 7: Reconsolidation (Advanced)

**Obiettivo**: Gestire interferenze con LLM.

#### Step 7.1: Interference detection

Aggiorna `src/memory/store.ts`:
- Quando aggiungi memoria, cerca simili con embeddings
- Se similarità > 0.7, marca per reconsolidation

#### Step 7.2: LLM reconsolidation

Crea `src/memory/reconsolidate.ts`:
- Funzione `reconsolidate(mem1, mem2): 'conflict' | 'complement' | 'duplicate'`
- Usa piccolo LLM per valutare
- Azioni:
  - `conflict`: mantieni la più recente
  - `complement`: mantieni entrambe
  - `duplicate`: mergia

---

## Priorità

| Priorità | Fase | Descrizione |
|----------|------|-------------|
| **P0** | Fase 1 | Plugin funzionante |
| **P0** | Fase 2 | Estrazione memorie |
| **P0** | Fase 3 | Injection base |
| **P1** | Fase 4 | Vector embeddings |
| **P1** | Fase 5 | Decay intelligente |
| **P2** | Fase 6 | Background processing |
| **P2** | Fase 7 | Reconsolidation |

---

## Checklist Pre-Commit

- [ ] `npm run build` senza errori
- [ ] Plugin carica senza crash in OpenCode
- [ ] Log funzionante in `~/.true-memory/debug.log`
- [ ] Database creato in `~/.true-memory/memory.db`
- [ ] Lazy initialization implementata
- [ ] Nessuna dipendenza da `ctx.client.app.log()`
- [ ] `@opencode-ai/plugin` come dipendenza regolare

---

## Testing

### Test manuale

1. Avvia OpenCode con plugin
2. Scrivi: "Remember that I always use TypeScript strict mode"
3. Chiudi sessione
4. Riapri OpenCode
5. Verifica che la memoria sia iniettata

### Test retrieval

```bash
sqlite3 ~/.true-memory/memory.db "SELECT * FROM memories WHERE scope='user';"
```

---

## Risorse

- [PsychMem repo](https://github.com/muratg98/psychmem) - Per ispirazione patterns
- [oh-my-opencode-slim](~/Documents/_PROGETTI/oh-my-opencode-slim) - Per struttura plugin
- [OpenCode plugin docs](https://github.com/opencode-ai/opencode) - Per API SDK

---

## Note Implementative

### Evita questi errori di PsychMem

1. **NON** usare peer dependency optional per `@opencode-ai/plugin`
2. **NON** usare `ctx.client.app.log()` nel default export
3. **NON** fare init sincrono di SQLite nel default export
4. **NON** definire tipi localmente quando puoi importarli dal SDK
5. **NON** iniettare tutte le memorie - usa retrieval contestuale

### Segui questi pattern di oh-my-opencode-slim

1. `@opencode-ai/plugin` come dipendenza REGOLARE
2. File-based logger in `/tmp/` o `~/.true-memory/`
3. Default export pulito, init lazy
4. Importa tipi dal SDK

---

## Commands

```bash
# Build
npm run build

# Watch mode
npm run dev

# Test in OpenCode (add to opencode.jsonc)
# "plugin": ["file:///Users/riccardosallusti/Documents/_PROGETTI/true-memory"]

# Check logs
tail -f ~/.true-memory/debug.log

# Query DB
sqlite3 ~/.true-memory/memory.db ".schema"
sqlite3 ~/.true-memory/memory.db "SELECT COUNT(*) FROM memories;"
```

---

## Status

- **Creato**: 22/02/2026
- **Stato**: Inizio implementazione
- **Fase corrente**: FASE 1 - Foundation
- **Prossimo step**: Step 1.1 - Setup progetto
