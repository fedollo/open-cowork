# Open Cowork

A **local** web mini-app for agentic workspaces: pick a folder, describe a goal, and let an agent work on your files. Chat, file tree, and live activity in one UI.

It uses Cursor’s agent runtime via the npm package `@cursor/sdk` (third-party dependency).

> **Not affiliated with Cursor / Anysphere.** Independent, unofficial project. “Cursor” is a trademark of its respective owners. Use of the SDK and APIs is subject to Cursor’s [Terms of Service](https://cursor.com/terms-of-service). Each user provides their **own** `CURSOR_API_KEY`.

## Requirements

- Node.js ≥ 22.13
- [pnpm](https://pnpm.io) 9+
- A [Cursor API key](https://cursor.com/dashboard/integrations)

## Setup

```bash
cp .env.example .env
# edit .env → CURSOR_API_KEY=...

pnpm install
pnpm --filter @open-cowork/shared build
pnpm dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

```bash
pnpm restart   # kill ports 8787/5173 and restart
pnpm stop      # kill only
```

## Usage

1. Sidebar: **absolute** folder path + model (default `composer-2.5`)
2. **New session**
3. Write your goal → **Start** (⌘/Ctrl+Enter)
4. Follow up in the same session; after reload it resumes via `Agent.resume`
5. With `settingSources: project + user`, workspace and user skills/rules are loaded

## Architecture

| Package | Role |
|---------|------|
| `apps/web` | Vite + React — 3-column UI |
| `apps/api` | Hono + `@cursor/sdk` — sessions, SSE, file tree |
| `packages/shared` | Shared types (`Session`, `AgentStreamEvent`, …) |

Sessions are stored in `.open-cowork/sessions/*.json` (gitignored).

## MVP limitations

- Folder path is absolute text input (no Electron)
- **Local** agents only
- No user auth / multi-tenant / SaaS
- One agent per session

## License

MIT — see [LICENSE](LICENSE).  
`@cursor/sdk` remains proprietary to Anysphere; see its `LICENSE.md` and Cursor’s ToS.
