# Setup (detailed)

Expanded steps for [Quick Start](../README.md#quick-start). Use this if the one-liner fails or you want more context.

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 22.13 | `package.json` `engines` |
| pnpm | 9+ | Repo pins `pnpm@9.15.0` via `packageManager` |
| Cursor API key | — | [Dashboard → Integrations](https://cursor.com/dashboard/integrations) |

### Install pnpm

Preferred (uses pinned version):

```bash
corepack enable
```

If `corepack enable` fails (permissions), install pnpm manually: [pnpm.io/installation](https://pnpm.io/installation).

## Step-by-step

### 1. Clone

```bash
git clone https://github.com/fedollo/open-loop.git
cd open-loop
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env`:

```
CURSOR_API_KEY=your_key
PORT=8787
# Optional MCP integrations — see .env.example / README Integrations
# GITHUB_TOKEN=          # https://github.com/settings/tokens
# ATLASCLOUD_API_KEY=    # key only; base URL not needed for MCP
# REPLICATE_API_TOKEN=
```

`.env` is read at API startup from the **repo root**. Restart `pnpm dev` after changes.

### 3. Install

```bash
pnpm install
```

First run typically takes 2–4 minutes. `pnpm dev` runs a `predev` hook that builds `@open-loop/shared` automatically.

### 4. Start dev servers

```bash
pnpm dev
```

Wait for both lines in the terminal:

```
Open Loop API on http://localhost:8787
VITE v… ready in … ms
  ➜  Local:   http://localhost:5173/
```

Then open http://localhost:5173.

### 5. Verify API

```bash
curl http://localhost:8787/health
```

Expected:

```json
{"ok":true,"hasApiKey":true}
```

- `"ok":false` — API not running.
- `"hasApiKey":false` — UI works but agent sessions will fail until you set `CURSOR_API_KEY` and restart.

## Dev server scripts

```bash
pnpm restart   # kill ports 8787/5173, then pnpm dev
pnpm stop      # kill only
```

Scripts use `bash` and `lsof` (macOS/Linux). On Windows use WSL or kill processes on ports 8787 and 5173 manually.

## Custom API port

Vite proxies `/api` to `http://localhost:8787` (hardcoded in `apps/web/vite.config.ts`). If you change `PORT` in `.env`, update the Vite proxy target to match.
