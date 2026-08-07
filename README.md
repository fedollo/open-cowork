# Open Cowork

Mini-app web **locale** per workspace agentici: scegli una cartella, descrivi un obiettivo, un agent lavora sui file. Chat, albero file e activity live in un’unica UI.

Usa il runtime agent di [Cursor](https://cursor.com) tramite il pacchetto npm `@cursor/sdk` (dipendenza di terze parti).

> **Non affiliato a Cursor / Anysphere.** Progetto indipendente e non ufficiale. “Cursor” è un marchio dei rispettivi proprietari. L’uso dell’SDK e delle API è soggetto ai [Terms of Service](https://cursor.com/terms-of-service) di Cursor. Ogni utente porta la **propria** `CURSOR_API_KEY`.

## Requisiti

- Node.js ≥ 22.13
- [pnpm](https://pnpm.io) 9+
- Una [API key Cursor](https://cursor.com/dashboard/integrations)

## Setup

```bash
cp .env.example .env
# modifica .env → CURSOR_API_KEY=...

pnpm install
pnpm --filter @open-cowork/shared build
pnpm dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

```bash
pnpm restart   # kill porte 8787/5173 e riavvia
pnpm stop      # solo kill
```

## Uso

1. Sidebar: path **assoluto** della cartella + model (default `composer-2.5`)
2. **Nuova sessione**
3. Scrivi l’obiettivo → **Avvia** (⌘/Ctrl+Enter)
4. Follow-up nella stessa sessione; dopo reload riprende via `Agent.resume`
5. Con `settingSources: project + user` vengono caricate skills/rules del workspace e dell’utente

## Architettura

| Package | Ruolo |
|---------|--------|
| `apps/web` | Vite + React — UI a 3 colonne |
| `apps/api` | Hono + `@cursor/sdk` — sessioni, SSE, file tree |
| `packages/shared` | Tipi (`Session`, `AgentStreamEvent`, …) |

Sessioni: `.open-cowork/sessions/*.json` (gitignored).

## Limitazioni MVP

- Path cartella come testo assoluto (niente Electron)
- Solo agent **local**
- Nessuna auth utenti / multi-tenant / SaaS
- Un agent per sessione

## License

MIT — vedi [LICENSE](LICENSE).  
`@cursor/sdk` resta proprietario di Anysphere; vedi la sua `LICENSE.md` e i ToS Cursor.
