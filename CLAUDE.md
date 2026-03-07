# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**revauto** — Revenue Operations Autopilot. A B2B SaaS automation platform covering the full lifecycle: Lead Research → Outreach Delivery → Knowledge Retrieval.

## Package Manager

Use **pnpm** exclusively (v10.7.0):

```bash
pnpm install          # install dependencies
pnpm add <pkg>        # add a dependency
pnpm add -D <pkg>     # add a dev dependency
```

## Repository Structure

This is a monorepo. Currently only the `backend/` workspace exists. As the project grows, expect workspaces like:

```
backend/    # API server and automation logic
frontend/   # UI (if added)
```

## Commands

As the project is early-stage, scripts will be added to `backend/package.json`. Standard conventions to follow:

```bash
pnpm dev      # start dev server
pnpm build    # compile/bundle
pnpm test     # run tests
pnpm lint     # lint code
```

## Architecture Notes

- **Domain**: Revenue Operations automation — the core flows will center around lead enrichment, outreach sequencing, and RAG/knowledge retrieval
- **Backend**: Node.js-based (entry point `index.js`); TypeScript is the expected language as the project grows
