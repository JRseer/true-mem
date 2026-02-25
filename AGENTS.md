# True-Mem - AGENTS.md

## CRITICAL CONFIG

```
PROJECTS_ROOT = ~/Documents/_PROGETTI/
THIS_PROJECT  = ~/Documents/_PROGETTI/true-mem

DATABASE      = ~/.true-mem/memory.db
DEBUG_LOG     = ~/.true-mem/plugin-debug.log
OPENCODE_CFG  = ~/.config/opencode/opencode.jsonc
```

---

## CURRENT STATUS

**Aggiornamento**: 25/02/2026 - v1.0.2 - Preference Classification fix

### Stato Implementazione

| Componente | Status |
|------------|--------|
| Build (bun) | OK - 97.98 KB |
| TypeCheck | OK - 0 errors |
| Runtime | OK - Funzionante |
| npm | Pubblicato 1.0.1 |

### Bug Risolti

| Bug | Soluzione |
|-----|-----------|
| esbuild crash | bun build |
| QUEUED state | Opzione B + maintenance a session.end |
| Duplicate memories | content_hash + global debounce 2s |
| AI meta-talk | Pattern filtering (pipes, markdown tables) |
| Preference false positives | Question detection + list selection + sentence-level scoring |
| Global scope retrieval | Query SQL allineata |
| Query consistency | vectorSearch = getMemoriesByScope |

---

## Project Overview

**True-Mem** - Plugin memoria persistente per OpenCode, ispirato a [PsychMem](https://github.com/muratg98/psychmem) con miglioramenti:
- Init non-bloccante (fire-and-forget)
- Decay solo episodic (preferenze permanenti)
- Jaccard similarity (no embeddings pesanti)
- Four-layer defense contro false positives
- Top-k retrieval contestuale

---

## Architettura

```
src/
├── index.ts              # Entry point, fire-and-forget init
├── storage/
│   ├── sqlite-adapter.ts # bun:sqlite + node:sqlite
│   └── database.ts       # MemoryDatabase class
├── memory/
│   ├── patterns.ts       # Multilingual keywords (15 lingue)
│   ├── negative-patterns.ts # False positive prevention
│   ├── classifier.ts     # Four-layer defense
│   ├── embeddings.ts     # Jaccard similarity
│   └── reconsolidate.ts  # Conflict resolution
├── extraction/queue.ts   # Async extraction
└── adapters/opencode/    # OpenCode hooks
```

---

## Classificazioni Memorie

| Tipo | Decay | Scope | Esempio |
|------|-------|-------|---------|
| constraint | Mai | Global | "Never use var" |
| preference | Mai | Global | "Preferisco TypeScript" |
| learning | Mai | Global | "Imparato bun:sqlite" |
| procedural | Mai | Global | "Test prima di commit" |
| decision | Mai | Project | "Scelto SQLite" |
| bugfix | Mai | Project | "Fixato auth timeout" |
| semantic | Mai | Project | "API usa REST" |
| episodic | Si (7gg) | Project | "Ieri abbiamo refactorato" |

---

## Four-Layer Defense (False Positive Prevention)

1. **Question Detection** - Filtra domande (finiscono con ?)
2. **Negative Patterns** - Filtra AI meta-talk, list selection
3. **Multi-Keyword + Sentence-Level** - Richiede 2+ segnali nella stessa frase
4. **Confidence Threshold** - Salva solo se score >= 0.6

---

## Dipendenze

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.2.6",
    "@opencode-ai/sdk": "^1.2.6",
    "uuid": "^13.0.0"
  }
}
```

**CRITICAL:**
- Usare `bun build` (NON esbuild - crasha in OpenCode)
- SQLite built-in (bun:sqlite / node:sqlite)

---

## Debug

```bash
# Log
tail -f ~/.true-mem/plugin-debug.log

# Query memories
sqlite3 ~/.true-mem/memory.db "SELECT classification, substr(summary,1,50) FROM memory_units WHERE status='active';"

# Delete memory
sqlite3 ~/.true-mem/memory.db "UPDATE memory_units SET status='deleted' WHERE id='...';"
```

---

## Git & npm

- Commit solo locale (push su richiesta)
- npm publish solo con permesso esplicito
- Versione letta dinamicamente da package.json nel log startup

---

## Best Practice

- Background tasks: attendere notifica automatica, no polling
- Test pulizia: eseguire manualmente `rm -rf ~/.true-mem/`
- No emoji nel codice

---

## Risorse

- [PsychMem repo](https://github.com/muratg98/psychmem)
- [oh-my-opencode-slim](~/Documents/_PROGETTI/oh-my-opencode-slim) - Plugin riferimento
