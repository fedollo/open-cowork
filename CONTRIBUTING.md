# Contributing to Open Cowork

Thanks for your interest. This is an unofficial open-source project.

## Setup

```bash
cp .env.example .env   # add your CURSOR_API_KEY
pnpm install
pnpm dev
```

Requirements: Node.js ≥ 22.13, pnpm 9+.

## Guidelines

- Keep MVP scope: no Electron, multi-tenant cloud agents, or user auth
- Code and comments in English
- Never commit `.env`, API keys, or runtime folders (`.open-cowork/`)
- Before a PR: `pnpm --filter @open-cowork/shared build` and typecheck api/web

## Pull requests

1. Fork + branch from `main`
2. Explain *why* the change matters
3. Update the README if setup or behavior changes

## Code of conduct

Be respectful. Abusive issues and PRs will be closed.
