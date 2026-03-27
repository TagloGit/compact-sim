# 0002 — Parameter Sweep Explorer — Implementation Plan

## Overview

Add an "Explorer" tab to the app that lets users define a parameter sweep (fixing some params, varying others over ranges), runs the full cartesian product of combinations via web workers, and presents results as an interactive 1D heat bar for pattern discovery and outlier investigation.

The existing simulation engine (`runSimulation`) is reused as-is — the sweep layer is purely orchestration and visualisation on top.

## Key Design Decisions

### Sweep parameter model

Every field of `SimulationConfig` becomes a `SweepParameter` — either fixed (single value) or swept (range + step count + scale). Strategy (`selectedStrategy`) is a special case: when swept, the "steps" are the selected strategy variants rather than a numeric range. Boolean params like `toolCompressionEnabled` sweep over `[false, true]`.

### Conversation reuse

The cartesian product is partitioned by conversation-shape keys. All runs sharing the same shape values reuse one generated conversation, so strategy/config comparisons are fair. The engine already accepts a full `SimulationConfig` and generates the conversation internally, so we'll extract `generateConversation` to be callable separately and pass the pre-generated messages into a new `runSimulationWithConversation` variant.

### Web worker architecture

A dedicated worker receives batches of `SimulationConfig` objects, runs them via `Effect.runSync`, and posts back `SweepRunResult` objects (config + summary metrics — not full snapshots, which would be too large). The main thread collects results and renders progressively.

When the user clicks "Open in Simulator," we re-run that single config on the main thread to get full snapshots for playback — this is cheap for one run.

## Types

### New types (`src/engine/sweep-types.ts`)

```typescript
type ParamScale = 'linear' | 'log'

// Numeric parameter sweep definition
interface NumericSweepRange {
  kind: 'swept'
  min: number
  max: number
  steps: number        // number of values to test (min 2)
  scale: ParamScale    // linear or logarithmic spacing
}

interface FixedValue<T> {
  kind: 'fixed'
  value: T
}

// Strategy sweep: pick which strategies to include
interface StrategySweepRange {
  kind: 'swept'
  values: StrategyType[]  // which strategies to include in sweep
}

// Boolean sweep: test both values
interface BooleanSweepRange {
  kind: 'swept'
}

// One entry per SimulationConfig key
type SweepParameterDef =
  | FixedValue<number>
  | FixedValue<StrategyType>
  | FixedValue<boolean>
  | NumericSweepRange
  | StrategySweepRange
  | BooleanSweepRange

// Full sweep configuration: mirrors SimulationConfig shape
type SweepConfig = {
  [K in keyof SimulationConfig]: SweepParameterDef
}

// What the worker returns per run (lightweight — no snapshots)
interface SweepRunResult {
  readonly index: number                // position in cartesian product
  readonly config: SimulationConfig     // exact config used
  readonly metrics: SweepMetrics
}

interface SweepMetrics {
  readonly totalCost: number
  readonly peakContextSize: number
  readonly compactionEvents: number
  readonly averageCacheHitRate: number
  readonly externalStoreSize: number    // 0 for non-4x strategies
  readonly totalRetrievalCost: number   // sum of retrieval input + output
}

// Ordering of swept variables for heat bar layout
type SweepVariableOrder = (keyof SimulationConfig)[]
```

### Parameter metadata (`src/engine/sweep-defaults.ts`)

A registry mapping each `SimulationConfig` key to:
- Display name and group (for UI sections)
- Default sweep range (min, max, steps, scale)
- Default fixed value (from `DEFAULT_CONFIG`)
- Whether it's a "conversation shape" param (for conversation reuse logic)

This drives the UI and avoids hardcoding param details in components.

## Files to Touch

### Engine layer

| File | Change |
|---|---|
| `src/engine/sweep-types.ts` | **New.** Types listed above |
| `src/engine/sweep-defaults.ts` | **New.** Parameter metadata registry with default ranges/scales |
| `src/engine/sweep.ts` | **New.** `expandSweepConfig` — generates the cartesian product of `SimulationConfig` objects from a `SweepConfig`. `partitionByShape` — groups configs sharing conversation-shape params |
| `src/engine/simulation.ts` | Extract conversation generation so we can pass pre-generated messages. Add `runSimulationWithConversation(config, messages)` alongside existing `runSimulation` |
| `src/engine/sweep-worker.ts` | **New.** Web worker entry point. Receives batches of configs (with pre-generated conversations), runs simulations, posts back `SweepRunResult[]` with progress |

### Hooks

| File | Change |
|---|---|
| `src/hooks/useSweep.ts` | **New.** Manages sweep state: config, execution (spawns workers), results collection, progress. Exposes `run()`, `results`, `progress`, `isRunning` |

### UI — tab infrastructure

| File | Change |
|---|---|
| `src/App.tsx` | Add tab navigation (Simulator / Explorer). Simulator tab contains existing content. Explorer tab renders new components. Lift `useSimulation` to accept config from Explorer's "Open in Simulator" action |
| `src/components/layout/AppLayout.tsx` | May need minor adjustments for tab-aware layout (sidebar content differs per tab) |

### UI — Explorer tab components

| File | Change |
|---|---|
| `src/components/explorer/SweepParameterPanel.tsx` | **New.** Lists all params in fixed/swept buckets. Drag to move between buckets. For swept params: range, step count, scale controls. For strategy: checkboxes. Combination count display with breakdown. Global granularity slider |
| `src/components/explorer/CombinationCounter.tsx` | **New.** Shows total combinations with per-param breakdown (e.g. "18,750 = 5 x 5 x 5 x 5 x 6 x 5"). Contains the global slider to reduce step counts |
| `src/components/explorer/SweepControls.tsx` | **New.** Run button, progress bar, cancel button, metric selector dropdown |
| `src/components/explorer/HeatBar.tsx` | **New.** The 1D heat bar. Renders a canvas/SVG bar where each segment is coloured by the selected metric. Handles zoom (range selection), hover tooltips, click to select |
| `src/components/explorer/VariableOrderPanel.tsx` | **New.** Draggable list of swept variables that controls heat bar ordering |
| `src/components/explorer/RunDetailCard.tsx` | **New.** Summary card shown when a simulation is clicked. Shows all param values and metrics. "Open in Simulator" button |
| `src/components/explorer/ExplorerTab.tsx` | **New.** Composes all Explorer components into the tab layout |

## Order of Operations

The order is UI-first: build interactive shells with mock data so Tim can verify the experience early, then plug in the real engine underneath. Each step makes something that was fake become real.

### 1. Sweep types and parameter metadata

Create `sweep-types.ts` and `sweep-defaults.ts` with the type system and parameter metadata registry. These types are the contract between UI and engine — everything else depends on them. No logic yet, just types and defaults.

### 2. Tab infrastructure

Add Simulator/Explorer tab navigation to `App.tsx`. Move existing simulator content into a `SimulatorTab` component. Explorer tab renders a placeholder. Support "Open in Simulator" by accepting a config from the Explorer and switching tabs. The existing simulator must work exactly as before.

### 3. Sweep parameter panel + combination counter (mock data)

Build `SweepParameterPanel` with fixed/swept buckets. Each param shows its current mode (fixed value or range). Drag-and-drop to move between buckets. Swept params show range/step/scale controls. Strategy shows checkboxes. Boolean shows as auto-swept when in swept bucket.

Build `CombinationCounter` with the per-param breakdown display (e.g. "18,750 = 5 x 5 x 5 x 5 x 6 x 5") and global granularity slider to reduce step counts.

Build `SweepControls` with run button, progress bar (static), cancel button, metric selector dropdown.

All functional UI — Tim can drag params, adjust ranges, see combination counts update — but the "Run" button produces mock results.

### 4. Heat bar + variable ordering + detail card (mock data)

Build `HeatBar` component with mock `SweepRunResult[]` data:
- Canvas-based rendering (SVG won't scale to thousands of segments)
- Colour scale mapping (metric value → colour)
- Zoom via mouse drag to select range, scroll wheel, or range handles
- Hover tooltip showing param values + metrics
- Click to select a run

Build `VariableOrderPanel` with drag-to-reorder. Reordering triggers a re-sort of the mock results and re-render of the heat bar.

Build `RunDetailCard` — summary card shown on click, with all param values and metrics. "Open in Simulator" button navigates to Simulator tab with that config.

Compose everything into `ExplorerTab`. Layout: parameter panel on the left (like Simulator), main area has controls at top, heat bar in the middle, variable order panel and detail card below.

Tim can now test the full Explorer interaction flow end-to-end with mock data: configure a sweep, "run" it, explore the heat bar, zoom, reorder variables, click a run, open in simulator.

### 5. Sweep expansion engine + tests

Implement `expandSweepConfig` in `sweep.ts` — the pure function that takes a `SweepConfig` and returns an array of `SimulationConfig` objects. Include `partitionByShape` for conversation reuse grouping.

Unit test thoroughly: cartesian product correctness, log/linear scale value generation, strategy enumeration, boolean sweep, single-step edge case, partition-by-shape grouping.

Wire the expansion into the UI so the combination counter uses the real expansion logic (replacing any mock count calculation).

### 6. Simulation extraction for conversation reuse

Refactor `simulation.ts` to extract conversation generation as a separate callable step. Add `runSimulationWithConversation(config, messages)` that skips generation and uses provided messages. Existing `runSimulation` delegates to the new function. All existing tests must pass unchanged. Add a test verifying `runSimulationWithConversation` produces identical results to `runSimulation` for the same config.

### 7. Web worker + useSweep hook

Create `sweep-worker.ts` web worker entry point. It receives batches of `{ config, messages }` pairs, runs each through `runSimulationWithConversation`, and posts back `SweepRunResult` objects. Batch size tunable (start with 50). Posts progress updates periodically.

Implement `useSweep` hook that:
- Holds `SweepConfig` state (initialised from defaults)
- On `run()`: expands config, partitions by shape, generates conversations, distributes work across N workers (`navigator.hardwareConcurrency` or 4), collects results
- Tracks progress (runs completed / total)
- Stores all `SweepRunResult[]` for the heat bar
- Supports cancel (terminates workers)

Replace mock data in the Explorer with the real `useSweep` hook. The heat bar now shows real simulation results, progress bar is live, cancel works. Tim can run real sweeps and explore actual data.

Vite handles worker bundling natively via `new Worker(new URL('./sweep-worker.ts', import.meta.url), { type: 'module' })`.

### 8. Performance tuning and warning threshold

Run sweeps of various sizes, measure wall-clock time, and set the warning threshold. Adjust worker batch sizes and worker count if needed. Revise the threshold in the UI. Document findings.

## Testing Approach

- **UI components** (steps 2–4): manual testing by Tim against mock data. Drag-and-drop, heat bar zoom/hover/click, variable reordering, tab navigation, "Open in Simulator" flow. Automated tests are low-value here given the visual nature.
- **Sweep logic** (step 5): unit tests in `src/engine/__tests__/sweep.test.ts`. Test cartesian expansion, log/linear scaling, strategy enumeration, boolean handling, partition-by-shape grouping.
- **Simulation extraction** (step 6): existing tests in `simulation.test.ts` must pass unchanged. Add a test for `runSimulationWithConversation` producing identical results to `runSimulation` for the same config.
- **useSweep hook** (step 7): integration test with a small sweep config (3 params x 2 steps = 8 runs). Verify correct number of results, progress reporting, cancel behaviour. Worker communication may need manual testing if Vitest doesn't support workers well.
- **Performance** (step 8): manual benchmarking at various sweep sizes to set the warning threshold.

## Open Questions

None — all resolved during discussion.
