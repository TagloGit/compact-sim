# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo purpose

Simulation tool for evaluating LLM agent context compaction strategies. Compares cost, cache utilisation, and context size trade-offs across different approaches. Browser-based, client-side only — no backend. See `specs/0001-compaction-simulator.md` for the full spec.

## Build & test

- `npm run dev` — start dev server
- `npm run build` — production build (`tsc -b` then `vite build`)
- `npm run lint` — ESLint
- `npm test` — run tests (Vitest)
- `npm run test:watch` — watch mode
- Run a single test file: `npx vitest run src/engine/__tests__/sweep.test.ts`

## Tech stack

- React 19 + TypeScript, Vite, shadcn/ui + Tailwind v4, Recharts
- Effect library (simulation engine layer only — not in React UI layer)
- Path alias: `@/` maps to `src/`

## Architecture

### Two-tab UI

The app has two tabs (both always mounted to preserve state):

- **Simulator tab** — single-config simulation with step-by-step playback. `useSimulation` hook runs `runSimulation` synchronously via `Effect.runSync` on every config change, producing an array of `SimulationSnapshot`s. A playback slider selects the current step.
- **Explorer tab** — parameter sweep across cartesian product of config values. `useSweep` hook manages sweep execution via web workers. Configs are partitioned by conversation shape so groups sharing the same shape reuse a single generated conversation.

### Engine layer (`src/engine/`)

Pure TypeScript + Effect. No React imports.

- **`types.ts`** — core domain types: `SimulationConfig`, `Message`, `SimulationSnapshot`, `SimulationResult`, `DEFAULT_CONFIG`
- **`conversation.ts`** — generates a deterministic conversation (sequence of `Message`s) from a config
- **`strategy.ts`** — compaction strategy implementations. Each strategy implements `CompactionStrategy.evaluate()`. Registry function `getStrategy(type)` maps `StrategyType` to implementation:
  - `strategy1` (full-compaction) — replace all non-system with one summary at threshold
  - `strategy2` (incremental) — compact new content in intervals, meta-compact accumulated summaries
  - `strategy4a` (lossless-append) — incremental + external store
  - `strategy4b` (lossless-hierarchical) — full replacement each time, hierarchical store levels
  - `strategy4c` (lossless-tool-results) — only tool_result messages go to external store
  - `strategy4d` (lcm-subagent) — full replacement + external store with dual retrieval tools
- **`simulation.ts`** — 8-stage pipeline processing each message through immutable `StepState`: ingest → buildContext → evaluateCompaction → updateExternalStore → calculateCache → rollRetrieval → calculateCost → buildSnapshot. `runSimulationWithConversation` is the pure core; `runSimulation` wraps it in Effect to generate the conversation first.
- **`cache.ts`** — prefix cache model (stable prefixes get discount, compaction invalidates)
- **`cost.ts`** — cost calculation from cache state and token counts
- **`retrieval.ts`** — probabilistic retrieval from external store, cost models for different retrieval strategies
- **`sweep.ts`** — expands `SweepConfig` into cartesian product of `SimulationConfig`s, partitions by conversation shape
- **`sweep-worker.ts`** — web worker that receives batches of simulation runs
- **`sweep-worker-protocol.ts`** — shared types and helpers between main thread and workers
- **`sweep-types.ts`** — sweep-specific types (`SweepConfig`, `SweepRunResult`, `SweepParameterDef`)
- **`sweep-defaults.ts`** — parameter metadata and default sweep config builder

### UI layer (`src/components/`)

- `SimulatorTab.tsx` / `ExplorerTab.tsx` — top-level tab content
- `controls/` — `ParameterPanel.tsx` (simulator config), `PlaybackControls.tsx` (step slider)
- `explorer/` — sweep-specific UI: `SweepParameterPanel.tsx`, `SweepControls.tsx`, `VariableOrderPanel.tsx`, `HeatBar.tsx`, `RunDetailCard.tsx`, `CombinationCounter.tsx`
- `visualisations/` — charts: `ContextSizeChart`, `CostChart`, `CostPerStepChart`, `CacheHitRate`, `ContextStack`, `ExternalStore`
- `ui/` — shadcn primitives

### Hooks (`src/hooks/`)

- `useSimulation` — manages `SimulationConfig` state, runs simulation reactively, tracks current step
- `useSweep` — manages `SweepConfig` state, web worker lifecycle, sweep execution with progress tracking and cancellation

## Domain context

The simulation models compaction strategies for LLM agent conversations:

- **Input caching** — stable prefixes get ~75% discount; compaction invalidates cache
- **Conversation shape** — tool-heavy vs conversation-heavy, result sizes, call frequency
- **External store** — lossless strategies store originals externally, enabling probabilistic retrieval at a cost

## Conventions

- `/code-review <pr>` — PR code review
- Specs: `specs/`, Plans: `plans/`
- Default branch: `main`
- **Never use compound Bash commands** (no `&&`, `;`, or `|` chaining). Use separate Bash tool calls instead — independent calls can run in parallel. Compound commands trigger extra permission prompts.
- **Never prefix Bash commands with `cd`**. The working directory is already the project root. All commands (`gh`, `git`, `npm`, etc.) work without `cd`.
