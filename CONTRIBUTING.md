# Contributing to Open Cowork

Grazie per l’interesse. Questo è un progetto open source non ufficiale.

## Setup

```bash
cp .env.example .env   # aggiungi la tua CURSOR_API_KEY
pnpm install
pnpm dev
```

Requisiti: Node.js ≥ 22.13, pnpm 9+.

## Linee guida

- Mantieni lo scope MVP: niente Electron, cloud agents multi-tenant, auth utenti
- Codice e commenti in inglese; README/issue possono essere in italiano o inglese
- Non commitare `.env`, chiavi API, o cartelle runtime (`.open-cowork/`)
- Prima di una PR: `pnpm --filter @open-cowork/shared build` e typecheck api/web

## Pull request

1. Fork + branch da `main`
2. Descrivi il “perché” del cambiamento
3. Aggiungi/aggiorna note nel README se cambia setup o comportamento

## Codice di condotta

Sii rispettoso. Issue e PR abusive verranno chiuse.
