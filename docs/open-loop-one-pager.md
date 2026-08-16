# Open Loop — one-page overview

Open Loop is a **local** web app for working with AI agents on your own files. Pick a folder on your computer, describe a goal, and watch the agent chat, browse files, and show live activity — all in one window.

It runs on your machine and uses Cursor’s agent runtime (an AI that can read and edit files). You supply your own API key. It is **not** affiliated with Cursor or Anthropic.

## Who it is for

- Developers who want a simple UI around Cursor agents on a local project folder
- Anyone experimenting with AI-assisted coding without deploying to the cloud
- People trying **Gauntlet mode** — a builder-vs-critic loop that keeps improving work until a quality bar is met

## How to start

Full walkthrough: **[Quick Start](../README.md#quick-start)** (~5 minutes).

| Tool | Notes |
|------|-------|
| Node.js ≥ 22.13 | [nodejs.org](https://nodejs.org/) |
| pnpm 9+ | `corepack enable` picks up the pinned version |
| Cursor API key | [Dashboard → Integrations](https://cursor.com/dashboard/integrations) — needed for agent sessions, not to load the UI |

```bash
git clone https://github.com/fedollo/open-cowork.git
cd open-cowork
cp .env.example .env
# Edit .env — set CURSOR_API_KEY=your_key
corepack enable && pnpm install
pnpm dev
```

Wait for both lines in the terminal (`Open Loop API on http://localhost:8787` and `Local: http://localhost:5173`), then open **http://localhost:5173**. Before your first session:

- Set `CURSOR_API_KEY` in `.env`, then restart `pnpm dev` if the key was missing
- Enter a **folder path** — use **Browse** for the native picker, or type an absolute path (e.g. `/Users/you/my-project`)
- Click **New session** — the composer appears only after that

Stuck? See [Setup (detailed)](setup.md).

## Normal mode

One agent, one goal. You choose a folder, pick a model, create a session, and describe what you want done. The agent reads and edits files in that folder while you follow chat, the file tree, and the activity panel. Good for everyday tasks: refactors, docs, bug fixes, small features.

## Gauntlet mode

A **builder vs harsh critic** loop for when quality matters more than speed. You write a concrete **quality bar** (what “done” means) and optional boundaries (what not to touch). A lead agent splits the work, sends builders to improve it, and separate critics check the real files — not the builder’s summary. The loop runs until the bar is met or you stop it.

## What it is not

- **Not cloud-hosted** — everything runs locally on your machine; agents work only on local files
- **No login or accounts** — no sign-in, no shared team server
- **Not a hosted SaaS** — your files stay on disk; session history lives under `.open-loop/` in the workspace
- **Checkpoints are opt-in** — rollback needs a checkpoint from the prior turn (see [setup.md](setup.md))
- **One lead agent per session** — not a multi-user workspace in the cloud
- **Not Claude Cowork** — unofficial project; you use your own Cursor API key

For the full feature list and roadmap, see [ROADMAP.md](ROADMAP.md).
