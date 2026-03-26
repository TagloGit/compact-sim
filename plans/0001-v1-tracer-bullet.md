# 0001 — V1 Tracer Bullet — Implementation Plan

## Overview

Build the V1 tracer bullet: a working end-to-end simulation of Strategy 1 (full compaction at threshold) with interactive message-by-message playback and live visualisations. All parameters are configurable in the UI. This proves the full tech stack (Vite + React + TypeScript + shadcn/ui + Tailwind + Effect + Recharts) and the core simulation architecture, which later versions will extend.

See [spec](../specs/0001-compaction-simulator.md) for full domain model, cost/cache models, and acceptance criteria.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  React UI Layer                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Parameter│ │ Playback │ │  Visualisations  │ │
│  │  Panel   │ │ Controls │ │ (Charts + Stack) │ │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘ │
│       │             │                │           │
│       ▼             ▼                ▲           │
│  ┌──────────────────────────────────────────┐    │
│  │  React Hook: useSimulation()             │    │
│  │  Owns config state, runs engine,         │    │
│  │  exposes step-by-step snapshots          │    │
│  └────────────────┬─────────────────────────┘    │
└───────────────────┼──────────────────────────────┘
                    │ calls (sync, pure)
┌───────────────────▼──────────────────────────────┐
│  Simulation Engine (Effect layer)                 │
│                                                   │
│  ┌─────────────┐  ┌──────────────┐               │
│  │ Conversation│  │  Simulation  │               │
│  │  Generator  │──▶   Runner     │               │
│  └─────────────┘  └──────┬───────┘               │
│                          │                        │
│            ┌─────────────┼─────────────┐          │
│            ▼             ▼             ▼          │
│     ┌───────────┐ ┌───────────┐ ┌──────────┐     │
│     │ Strategy  │ │   Cache   │ │   Cost   │     │
│     │  Engine   │ │   Model   │ │Calculator│     │
│     └───────────┘ └───────────┘ └──────────┘     │
└───────────────────────────────────────────────────┘
```

**Key boundary**: The simulation engine is a pure function: `SimulationConfig → SimulationResult` (an array of per-step snapshots). The React layer calls this whenever config changes, then indexes into the snapshot array based on the current playback position. No Effect runtime in React — the hook calls `Effect.runSync()` at the boundary.

## File structure

```
src/
├── engine/                    # Simulation engine (Effect layer)
│   ├── types.ts               # All domain types (Message, SimConfig, Snapshot, etc.)
│   ├── conversation.ts        # Conversation generator
│   ├── strategy.ts            # Strategy interface + Strategy 1 implementation
│   ├── cache.ts               # Cache model (prefix tracking, hit/miss calc)
│   ├── cost.ts                # Cost calculator (per-step cost breakdown)
│   └── simulation.ts          # Runner: orchestrates generator + strategy + cache + cost
├── hooks/
│   └── useSimulation.ts       # React hook: config state → engine → snapshots → playback position
├── components/
│   ├── layout/
│   │   └── AppLayout.tsx      # Top-level layout shell
│   ├── controls/
│   │   ├── ParameterPanel.tsx  # All config controls (grouped by category)
│   │   └── PlaybackControls.tsx # Step forward/back, play/pause, jump to start/end
│   └── visualisations/
│       ├── ContextStack.tsx    # Vertical stack of message blocks, colour-coded
│       ├── ContextSizeChart.tsx # Line chart: context size over time
│       ├── CostChart.tsx       # Stacked area: cumulative cost breakdown over time
│       └── CacheHitRate.tsx    # Cache hit percentage per step
├── lib/
│   └── utils.ts               # shadcn/ui utility (cn function etc.)
├── App.tsx                    # Root component, wires everything together
├── main.tsx                   # Vite entry point
└── index.css                  # Tailwind imports + theme
```

## Engine types (key interfaces)

```typescript
// Message in the conversation
type MessageType = 'system' | 'user' | 'assistant' | 'reasoning' | 'tool_call' | 'tool_result' | 'summary'

interface Message {
  id: string
  type: MessageType
  tokens: number
  compacted: boolean       // true if this message has been replaced by a summary
  compactedInto?: string   // id of the summary message that replaced this one
}

// What the LLM "sees" on a given step — the active context
interface ContextState {
  messages: Message[]      // ordered list of messages in context (summaries replace compacted)
  totalTokens: number
}

// Cache state at a given step
interface CacheState {
  cachedPrefixTokens: number   // how many tokens from start are cached
  cacheHitTokens: number       // tokens that hit cache on this step's LLM call
  cacheWriteTokens: number     // tokens written to cache on this step
  uncachedTokens: number       // tokens beyond cache (latest messages)
  hitRate: number              // percentage
}

// Cost breakdown for a single step
interface StepCost {
  cachedInput: number
  cacheWrite: number
  uncachedInput: number
  output: number
  compactionInput: number
  compactionOutput: number
  total: number
}

// Complete snapshot at each step (one per message added to conversation)
interface SimulationSnapshot {
  stepIndex: number
  message: Message              // the message added on this step
  conversation: Message[]       // full conversation history (including compacted)
  context: ContextState         // what the LLM sees
  cache: CacheState
  cost: StepCost                // cost incurred on this step
  cumulativeCost: StepCost      // running total
  compactionEvent: boolean      // did compaction fire on this step?
}

interface SimulationResult {
  config: SimulationConfig
  snapshots: SimulationSnapshot[]
  summary: {                    // aggregate stats
    totalCost: number
    totalTokensGenerated: number
    compactionEvents: number
    averageCacheHitRate: number
    peakContextSize: number
  }
}
```

These are illustrative — the developer should refine as needed during implementation, but the overall shape should be preserved.

## Order of operations

### Issue 1: Project scaffolding

Set up the project from scratch with the full tech stack. The goal is `npm run dev` showing a "Hello World" page with shadcn/ui components rendering correctly.

- Scaffold with `npm create vite@latest . -- --template react-ts`
- Install and configure: Tailwind CSS, shadcn/ui, Effect, Recharts
- Verify: dev server runs, a shadcn Button renders, TypeScript compiles, Effect can be imported
- Create the `src/engine/` and `src/components/` directory structure (empty files with TODO comments)
- Update CLAUDE.md build & test commands if needed

### Issue 2: Simulation engine — types and conversation generator

Build the data layer: define all domain types and implement the conversation generator that produces a message sequence from config parameters.

- Define all types in `src/engine/types.ts` (Message, SimulationConfig, SimulationSnapshot, etc.)
- Implement conversation generator in `src/engine/conversation.ts` as an Effect that takes SimulationConfig and returns `Message[]`
- The generator produces the message sequence per the spec: `[system] [user] [assistant] [reasoning] [tool_call] [tool_result] ...` with user messages at configured frequency
- Unit tests to verify: correct number of messages, correct types in correct order, token sizes match config
- No strategy/cache/cost logic yet — just raw message generation

### Issue 3: Simulation engine — Strategy 1, cache model, cost calculator

Build the core simulation logic that transforms a conversation into per-step snapshots.

- Implement Strategy 1 in `src/engine/strategy.ts`: interface `CompactionStrategy` with method to evaluate whether compaction should fire and produce the resulting context. Strategy 1: when context exceeds threshold, replace all non-system messages with a single summary.
- Implement cache model in `src/engine/cache.ts`: given previous and current context, calculate cache hits/misses/writes per the spec's cache model (prefix comparison, min cacheable tokens, write multiplier, hit multiplier).
- Implement cost calculator in `src/engine/cost.ts`: given cache state and output tokens for a step, calculate the full cost breakdown.
- Implement simulation runner in `src/engine/simulation.ts`: orchestrates everything. Takes config → generates conversation → steps through message by message → on each step: update context, check strategy, update cache, calculate cost → produces `SimulationSnapshot[]`.
- Use Effect services for Strategy, CacheModel, and CostCalculator so they're injectable/testable.
- Unit tests: verify compaction fires at the right threshold, cache invalidation after compaction, cost calculations match hand-calculated examples, snapshot array has correct length.

### Issue 4: UI shell, parameter panel, and simulation hook

Build the UI skeleton and wire it to the engine.

- Implement `useSimulation` hook: holds config state (with defaults from spec), calls engine on config change, exposes snapshots array and current step index.
- Build `AppLayout.tsx`: responsive desktop layout with sidebar (parameter panel) and main area (visualisations placeholder).
- Build `ParameterPanel.tsx` with shadcn/ui controls: sliders and number inputs for all V1 parameters, grouped into "Conversation Shape", "Context & Compaction", and "Pricing" sections. Changing any value triggers simulation re-run.
- Main area shows placeholder text with current snapshot data (step index, context size, total cost) to verify the wiring works before charts are added.

### Issue 5: Playback controls and context stack visualisation

Build the interactive playback experience.

- Build `PlaybackControls.tsx`: step forward, step back, jump to start, jump to end, play/pause (auto-advance with configurable speed). Controls update the current step index in `useSimulation`.
- Build `ContextStack.tsx`: vertical visualisation of the current context at the selected step. Each message is a block, height proportional to token size, colour-coded by type:
  - `system` = grey
  - `user` = blue
  - `assistant` = green
  - `reasoning` = teal/cyan
  - `tool_call` = orange
  - `tool_result` = amber/yellow
  - `summary` = purple
- Compacted messages shown at reduced opacity (they're in the conversation history but not in active context). Summary blocks that replaced them shown at full opacity.
- The stack should clearly show the "before and after" of a compaction event as the user steps through it.
- Show total context token count and context window utilisation percentage.

### Issue 6: Charts — context size, cost breakdown, cache hit rate

Build the three chart visualisations.

- `ContextSizeChart.tsx`: Recharts line chart. X-axis = step index, Y-axis = context token count. Plots `context.totalTokens` for each snapshot. Should show the characteristic sawtooth pattern (growth → compaction drop → regrowth). Add a horizontal reference line for the compaction threshold and context window max.
- `CostChart.tsx`: Recharts stacked area chart. X-axis = step index, Y-axis = cumulative cost ($). Stacked areas for: cached input, cache write, uncached input, output, compaction. Shows where money is being spent over time.
- `CacheHitRate.tsx`: Recharts line or bar chart. X-axis = step index, Y-axis = cache hit rate (%). Shows how cache utilisation changes, with visible drops at compaction events.
- All charts highlight the current playback position (vertical marker line or highlighted point).
- All charts render the full simulation data, not just up to the current step — so the user can see the full trajectory and scrub through it.

## Testing approach

- **Engine unit tests**: Each engine module gets its own test file (`*.test.ts`). Use Vitest (comes with Vite). Test the generator, strategy, cache, cost, and runner independently.
- **Key test cases**:
  - Conversation generator produces correct message count and ordering
  - Strategy 1 fires at exactly the right threshold
  - Cache model correctly identifies prefix hits after normal message append
  - Cache model correctly invalidates after compaction
  - Cost calculator matches hand-calculated values for a known scenario
  - Full simulation run: given known config, verify snapshot count, compaction event count, final cost
- **No UI component tests for V1** — manual verification is sufficient at this stage. Automated UI testing is a later concern.
- Test files live alongside source: `src/engine/__tests__/`

## Dependencies between issues

```
Issue 1 (scaffolding)
  └──▶ Issue 2 (types + generator)
        └──▶ Issue 3 (strategy + cache + cost + runner)
              └──▶ Issue 4 (UI shell + params + hook)
                    ├──▶ Issue 5 (playback + context stack)
                    └──▶ Issue 6 (charts)
```

Issues 5 and 6 can be worked in parallel once Issue 4 is complete.
