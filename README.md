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
2. Choose **Normal** or **Gauntlet** mode
3. **New session**
4. Write your goal → **Start** / **Start Gauntlet** (⌘/Ctrl+Enter)
5. Follow up in the same session; after reload it resumes via `Agent.resume`
6. With `settingSources: project + user`, workspace and user skills/rules are loaded

## Gauntlet mode

Gauntlet mode wraps your goal in a **builder vs harsh critic** orchestration prompt (the [Gauntlet Loop](https://somethingbig.ai/gauntlet-loop) pattern popularized by Matt Shumer). The lead Cursor agent is instructed to:

- decompose work into independently judgeable pieces
- fan out builder subagents and **separate** critics with fresh context
- compare real artifacts against a **concrete quality bar** (not “make it amazing”)
- keep looping until the bar is met (or you hit **Stop**)
- maintain `.open-cowork/gauntlet-progress.md` in the workspace

You must provide a quality bar (and optionally hard boundaries). Open Cowork does not run a separate multi-agent orchestrator in the API yet — it relies on Cursor’s Task/subagent harness.

## Architecture

| Package | Role |
|---------|------|
| `apps/web` | Vite + React — 3-column UI |
| `apps/api` | Hono + `@cursor/sdk` — sessions, SSE, file tree, Gauntlet prompt |
| `packages/shared` | Shared types (`Session`, `AgentStreamEvent`, …) |

Sessions are stored in `.open-cowork/sessions/*.json` (gitignored).

## MVP limitations

- Folder path is absolute text input (no Electron)
- **Local** agents only
- No user auth / multi-tenant / SaaS
- One lead agent per session (subagents via Cursor Task)
- Gauntlet critics are not fully isolated API processes (phase 2)

## License

MIT — see [LICENSE](LICENSE).  
`@cursor/sdk` remains proprietary to Anysphere; see its `LICENSE.md` and Cursor’s ToS.
