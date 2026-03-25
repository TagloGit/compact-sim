# CLAUDE.md — compact-sim

Simulation tool for evaluating LLM agent context compaction strategies. Compares cost, cache utilisation, and context size trade-offs across different approaches.

## Repo purpose

This repo contains a simulation application (likely web-based, tech stack TBD). See `docs/compaction-simulation-brief.md` for the full problem statement and strategy descriptions.

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

## Build & test

<!-- TODO: fill in once tech stack is chosen -->

## Conventions

- Specs: `specs/`, Plans: `plans/`
- Default branch: `main`
