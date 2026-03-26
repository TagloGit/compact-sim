# CLAUDE.md — compact-sim

Simulation tool for evaluating LLM agent context compaction strategies. Compares cost, cache utilisation, and context size trade-offs across different approaches.

## Repo purpose

This repo contains a browser-based simulation application. See `specs/0001-compaction-simulator.md` for the full spec.

## Domain context

The simulation models five compaction strategies (and combinations):

1. **Full compaction** — summarise entire conversation at threshold
2. **Incremental compaction** — summarise in intervals, append summaries
3. **Tool result compression** — compress tool results at ingestion
4. **Lossless with retrieval** — summarise but store originals externally (variants 4a-4d)
5. **Agent-controlled discard** — agent decides what to drop

Key modelling concepts:
- **Input caching** — stable prefixes get ~75% discount; compaction invalidates cache
- **Monte Carlo simulation** — randomised parameters over distributions
- **Conversation shape** — tool-heavy vs conversation-heavy, result sizes, call frequency

## Tech stack

- React + TypeScript, Vite, shadcn/ui + Tailwind, Recharts
- Effect (simulation engine layer only — not in React UI layer)
- Client-side only — no backend

## Build & test

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — lint

## Conventions

- Specs: `specs/`, Plans: `plans/`
- Default branch: `main`
- **Never use compound Bash commands** (no `&&`, `;`, or `|` chaining). Use separate Bash tool calls instead — independent calls can run in parallel. Compound commands trigger extra permission prompts.
- **Never prefix Bash commands with `cd`**. The working directory is already the project root. All commands (`gh`, `git`, `npm`, etc.) work without `cd`.
