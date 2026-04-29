# True-Mem - AGENTS.md

## CRITICAL CONFIG

```
PROJECTS_ROOT = ~/Documents/_PROGETTI/
THIS_PROJECT  = ~/Documents/_PROGETTI/true-mem

DATABASE      = ~/.true-mem/memory.db
DEBUG_LOG     = ~/.true-mem/plugin-debug.log
OPENCODE_CFG  = ~/.config/opencode/opencode.jsonc

# v1.3.0+ Config Files
CONFIG        = ~/.true-mem/config.jsonc    # User settings (JSONC with comments)
STATE         = ~/.true-mem/state.json      # Runtime state (auto-managed)
```

---

## CURRENT STATUS

**Aggiornamento**: 09/04/2026 - v1.4.1 - Auto Data Migration

### Stato Implementazione

| Componente | Status |
|------------|--------|
| Build (bun) | ✅ OK - ~159 KB |
| TypeCheck | ✅ OK - 0 errors |
| Runtime | ✅ OK - Funzionante |
| npm | Pubblicato 1.4.0 (main), develop in sync |
| GitHub Actions | OK - NPM_TOKEN secret |
| Toast | OK - Tutte le sessioni |
| Meta-Command | OK - Previene loop infiniti |
| Hot-Reload | ✅ OK - Node.js path persistence + debounce (1s) |
| Log Rotation | ✅ OK - 1MB con 1 backup |
| Injection Mode | ✅ v1.3.2 - Default changed to 1 (ALWAYS) |
| Session Resume | ✅ Phase 2 - Detect resumed sessions |
| Sub-Agent Mode | ✅ Phase 3 - Configurable sub-agent injection |
| Config System | ✅ v1.3.0 - Separate config.json + state.json |
| Project Scope | ✅ v1.3.1 - Fixed memory leakage across projects |
| Storage Location | ✅ v1.3.2 - Configurable storage path |
| Data Migration | ✅ v1.4.1 - Auto copy on location change |

---

## Project Overview

**True-Mem** - Plugin memoria persistente per OpenCode, ispirato a [PsychMem](https://github.com/muratg98/psychmem) con miglioramenti:
- Init non-bloccante (fire-and-forget)
- Decay solo episodic (preferenze permanenti)
- Hybrid similarity (Jaccard + embeddings opzionali)
- Four-layer defense contro false positives
- Hot-reload resilient feature flags

**Feature Flag (embeddings):**
```bash
export TRUE_MEM_EMBEDDINGS=1  # Enable embeddings
export TRUE_MEM_EMBEDDINGS=0  # Disable (default)
```

### Architettura (Dual-Layer)

```
src/index.ts (outer shell)
  ├── Init immediato (fire-and-forget)
  ├── Hot-reload detection (worktree cached to ~/.true-mem/.worktree-cache)
  ├── Toast notification
  └── Thin hook wrappers → delega a:
        src/adapters/opencode/index.ts (inner adapter)
          ├── experimental.chat.system.transform  → Main injection
          ├── tool.execute.before                  → Sub-agent injection
          ├── chat.message                         → List-memories command
          ├── event                                → Session lifecycle + queue extraction
          └── experimental.session.compacting      → Compact detection
```

### WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Memory classification logic | `src/memory/classifier.ts` | Four-layer defense entry point |
| Multilingual negative patterns | `src/memory/negative-patterns.ts` | 15 languages, false-positive prevention |
| Keyword/scope patterns | `src/memory/patterns.ts` | GLOBAL_SCOPE_KEYWORDS, marker detection |
| Jaccard similarity matching | `src/memory/similarity.ts` | Default matching (no embeddings) |
| NLP embeddings (optional) | `src/memory/embeddings-nlp.ts` + `src/memory/embedding-worker.ts` | Node.js child process, lazy-loaded |
| Hook implementations | `src/adapters/opencode/index.ts` | All OpenCode hook handlers |
| Memory injection formatting | `src/adapters/opencode/injection.ts` | XML wrapping, token budgeting |
| Session lifecycle | `src/adapters/opencode/session-manager.ts` | Created/idle/end detection |
| Config system | `src/config/config.ts` + `src/config/state.ts` | JSONC parsing, env override, migration |
| Database layer | `src/storage/database.ts` | SQLite adapter, schema migrations |
| Extraction queue | `src/extraction/queue.ts` | Sequential async, debounce, context cache |
| Plugin entry point | `src/index.ts` | Fire-and-forget init, dual-layer bridge |
| Type definitions | `src/types/config.ts` + `src/types/database.ts` | DEFAULT_USER_CONFIG, MemoryUnit types |
| Build/publish CI | `.github/workflows/release.yml` | npm publish on main push |
| User-facing docs | `README.md` | Full feature documentation |
| Release history | `CHANGELOG.md` | Version changes |

### Estrazione Memorie (Interni)

- **Role-aware classification**: Human messages weighted 10x vs Assistant
- **Four-layer defense**: Question detection → Negative patterns → Multi-keyword sentence-level → Confidence >= 0.6
- **Extraction queue**: Sequenziale asincrona (previene race conditions)
- **Debounce**: 2s minimo tra estrazioni + 500ms debounce su singolo messaggio
- **Context cache**: 5s TTL per evitare ri-estrazione su messaggi identici
- **Content hash deduplication**: SHA-256 hash per O(1) exact duplicate detection nel database
- **Pre-filtri**: URL >150 char, contenuti >500 char → skip

### Injection Format

```xml
<true_memory_context type="global" worktree="/path/to/project">
  <persona_boundary>
    <memory classification="preference" store="LTM" strength="0.85">
      Memory content here
    </memory>
  </persona_boundary>
</true_memory_context>
```

- **Dynamic allocation**: 30% global min, 30% project min, 40% flexible
- **Token budget**: 4000 max per injection
- **Jaccard similarity**: Default matching (no embeddings)
- **NLP embeddings**: Optional via Node.js worker process (`embedding-worker.ts`)

### Shutdown

- **NO signal handlers** (`process.on('SIGINT')`) — causano eccezioni C++ in Bun
- **ShutdownManager**: Handlers LIFO, database close sincrono chiamato all'uscita del plugin

---

## Memory Injection

### Quando vengono iniettate le memorie?

**Hook:** `experimental.chat.system.transform`
- Chiamato **prima di ogni richiesta al modello**
- Inietta memorie in tempo reale nel system prompt

**Flusso:**
```
Utente scrive messaggio → OpenCode prepara richiesta → 
Hook transform eseguito → Memorie iniettate nel system → 
Richiesta inviata al modello con memorie incluse
```

### Selezione Memorie

**Strategia attuale:**
- `getMemoriesByScope(worktree, 20)` ordina per **strength DESC**
- Prende le 20 memorie con strength più alta
- **NON** per rilevanza semantica al contesto

**Configurazione limite:**
```bash
export TRUE_MEM_MAX_MEMORIES=20  # Default
export TRUE_MEM_MAX_MEMORIES=25  # Più contesto
export TRUE_MEM_MAX_MEMORIES=15  # Meno token
```

### Injection Mode Configuration (v1.3.0+)

| Mode | Value | Behavior | Token Savings |
|------|-------|----------|---------------|
| SESSION_START | 0 | Inject only at session start | ~76% |
| ALWAYS | 1 | Inject on every prompt (DEFAULT) | 0% |

**Default**: `1` (ALWAYS), defined in `src/types/config.ts` → `DEFAULT_USER_CONFIG`.

**Environment Variables:**

- `TRUE_MEM_STORAGE_LOCATION` - legacy=~/.true-mem/ (default), opencode=~/.config/opencode/true-mem/
  - **Auto-migration**: When changed, data is automatically copied from old to new location (not moved)
  - Original data is preserved as backup - safe to delete old folder after migration if desired
- `TRUE_MEM_INJECTION_MODE` - 0=SESSION_START, 1=ALWAYS (default)
- `TRUE_MEM_SUBAGENT_MODE` - 0=DISABLED, 1=ENABLED (default)
- `TRUE_MEM_MAX_MEMORIES` - Default 20
- `TRUE_MEM_EMBEDDINGS` - 0=Jaccard only (default), 1=Hybrid

### Sub-Agent Injection

Sub-agent tasks are detected via the `-task-` heuristic in session IDs. When `TRUE_MEM_SUBAGENT_MODE=1` (default), memories are also injected into task/background_task sub-agent prompts using the `tool.execute.before` hook. Each sub-agent gets its own session-scoped context.

---

## Classificazioni Memorie

| Tipo | Decay | Scope | Esempio |
|------|-------|-------|---------|
| constraint | Mai | Global | "Never use var" |
| preference | Mai | Global | "Preferisco TypeScript" |
| learning | Mai | Global | "Imparato bun:sqlite" |
| procedural | Mai | Global | "Test prima di commit" |
| decision | Mai | Project | "Scelto SQLite" |
| semantic | Mai | Project | "API usa REST" |
| episodic | Si (7gg) | Project | "Ieri abbiamo refactorato" |

### Pre-filtraggio Contenuti

- **URL > 150 caratteri** - Skip (evita API dumps)
- **Contenuti > 500 caratteri** - Skip (evita clipboard accidentali)

---

## Scope Logic (Explicit Intent)

**Regola**: "Ricordami..." → default **PROJECT scope**

Per memorizzare in **GLOBAL scope**, il testo deve contenere keyword globale:
- English: always, everywhere, for all projects, globally
- Italian: sempre, ovunque, per tutti i progetti, globalmente
- + ES, FR, DE, PT, NL, PL, TR

**File:** `src/memory/patterns.ts` → `GLOBAL_SCOPE_KEYWORDS`

---

## Four-Layer Defense

1. **Question Detection** - Filtra domande (finiscono con ?)
2. **Negative Patterns** - AI meta-talk, list selection, 1st person recall (10 lingue)
3. **Multi-Keyword + Sentence-Level** - Richiede 2+ segnali nella stessa frase
4. **Confidence Threshold** - Salva solo se score >= 0.6

---

## Meta-Command Detection

**Problema:** Loop infinito quando si chiede di cancellare una memoria usando il suo pattern.

**Soluzione:** Pattern `MEMORY_COMMAND_PATTERNS` che rilevano comandi diretti al sistema memoria.

| Pattern | Azione |
|---------|--------|
| "cancelliamo questa memoria: ho capito X" | **BLOCK** |
| "ho imparato come cancellare file" | **ALLOW** |
| "ricordati di eliminare i log" | **ALLOW** |

**File:** `src/memory/negative-patterns.ts` - Supporto multilingue (9 lingue)

---

## Dipendenze

- `@opencode-ai/plugin` - OpenCode plugin SDK
- `@opencode-ai/sdk` - OpenCode SDK  
- `uuid` - UUID generation
- `@huggingface/transformers` ^4.0.0 - NLP embeddings (optional, lazy-loaded)

**CRITICAL:**
- Build: `bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly && bun build src/memory/embedding-worker.ts --outdir dist/memory --target bun --format esm` (NON esbuild - crasha in OpenCode)
- SQLite: built-in (bun:sqlite / node:sqlite)

---

## Debug

**Log:** `tail -f ~/.true-mem/plugin-debug.log`

**Query memories**
sqlite3 ~/.true-mem/memory.db "SELECT classification, substr(summary,1,50) FROM memory_units WHERE status='active';"

# Delete memory
sqlite3 ~/.true-mem/memory.db "UPDATE memory_units SET status='deleted' WHERE id='...';"
```

---

## Git & npm

- Commit solo locale (push su richiesta)
- npm publish solo con permesso esplicito
- Versione letta con `findPackageJsonUp()` (come OMO-slim)

---

## Release Workflow (GitHub Actions)

```bash
# 1. Commit feature su develop (se non già fatto)
# ... lavoro su develop ...

# 2. Version bump SU DEVELOP (crea tag qui)
git checkout develop
npm version minor -m "release: v%s - <FEATURE_NAME>"   # feature
npm version patch -m "release: v%s - <FEATURE_NAME>"    # bug fix
npm version major -m "release: v%s - <FEATURE_NAME>"    # breaking change

# 3. Push develop con il nuovo tag
git push origin develop --tags

# 4. Merge develop in main (porta anche il tag)
git checkout main
git merge develop

# 5. Push main → trigger npm publish + GitHub Release automatici
git push origin main

# 6. Allinea develop con main (per avere la versione corretta anche su develop)
git checkout develop
git merge main
```

### Spiegazione

| Step | Azione | Perché |
|------|--------|--------|
| 1 | Commit su develop | Feature completata e testata |
| 2 | Version bump su develop | Crea tag Git con versione aggiornata |
| 3 | Push develop | Sincronizza remote, tag visibile |
| 4 | Merge in main | Porta codice + tag su main per release |
| 5 | Push main | Trigger GitHub Actions per npm publish |
| 6 | Merge main in develop | Allinea versione su develop |

### REGOLA CRITICA

**Il version bump va fatto su DEVELOP, non su main. Poi si fa merge di develop in main.**

Questo garantisce che:
- Il tag sia creato sul commit di develop
- Develop abbia sempre la versione corretta dopo il rilascio
- Main e develop siano sincronizzati sulla stessa versione

### Convenzione Tag

| Tag | Uso |
|-----|-----|
| `release: v1.3.2 - Feature Name` | Changelog automatico su GitHub Release |

### Automazione

Push su main con versione nuova + tag → npm publish + GitHub Release automatici

---

## Best Practice

- Background tasks: attendere notifica automatica, no polling
- Test pulizia: eseguire manualmente `rm -rf ~/.true-mem/`
- No emoji nel codice

---

## Risorse

- [PsychMem repo](https://github.com/muratg98/psychmem)
- [oh-my-opencode-slim](~/Documents/_PROGETTI/oh-my-opencode-slim) - Plugin riferimento
- [CHANGELOG.md](./CHANGELOG.md) - Storico modifiche completo
