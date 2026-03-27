# 0002 — Parameter Sweep Explorer

## Problem

The interactive simulator (spec 0001, V1–V3) lets users step through a single conversation under one strategy with fixed parameters. This builds intuition but can't answer two key questions:

1. **What configurations are unusually cheap or expensive?** Interesting results often come from extreme or non-obvious parameter combinations that users wouldn't think to try manually.
2. **Which strategy wins under which conditions?** Each strategy has a sweet spot, but finding it requires systematic comparison across a range of inputs.

Answering these requires running many simulations across a parameter space and presenting the results in a way that surfaces patterns and outliers.

## Proposed Solution

A **Parameter Sweep Explorer** — a new "Explorer" tab alongside the existing "Simulator" tab. The user defines a parameter space (some params fixed, some swept over ranges), the engine runs the full cartesian product of combinations, and results are displayed as an interactive 1D heat bar where each pixel represents one simulation's result for a chosen metric.

### Core concepts

**Everything is a parameter.** All simulation parameters — conversation shape, pricing, strategy config, and strategy selection itself — are available for sweeping. The user drags parameters between "fixed" and "swept" buckets. Fixed params get a single value; swept params get a range and step count.

**Sweep, not Monte Carlo.** The engine tests a systematic grid of values rather than random sampling. This ensures no sweet spot is missed because the RNG skipped it. The total number of simulations is the cartesian product of all swept parameter step counts.

**Strategy is just a parameter.** It can be fixed (analyse one strategy across varying conditions) or swept (compare strategies head-to-head under the same conditions). When swept, each strategy variant is one "step" in that dimension.

### Parameter sweep configuration

Each swept parameter has:
- **Range**: min and max values
- **Step count**: how many values to test within the range
- **Scale**: linear or logarithmic (log is better for token sizes that span orders of magnitude)

Reasonable defaults should be set for ranges and step counts so users can get started quickly without tuning every parameter.

### Combination count control

The UI prominently displays the total number of combinations, broken down by parameter (e.g. "18,750 = 5 x 5 x 5 x 5 x 6 x 5"). A global slider reduces the total combination count by proportionally reducing step counts across all swept parameters. For example, dragging down one notch might go from 18,750 (5x5x5x5x6x5) to 5,120 (4x4x4x4x5x4). Users can also adjust individual parameter step counts directly.

A warning threshold (initially a rough estimate, to be revised once we have performance data) alerts users when the combination count is very high.

### Execution

Simulations run in web workers to avoid blocking the UI. Progress is reported back to the main thread. All metrics are stored per run so the user can switch the displayed metric without re-running.

### Results visualisation: the heat bar

Results are displayed as a **1D heat bar** — a horizontal bar spanning the screen width where each segment represents one simulation, coloured by the selected metric (e.g. total cost). The simulations are ordered by the cartesian expansion of the swept variables.

**Variable ordering:** The user sees a list of the swept variables and can drag to reorder them. The ordering defines a nested sort:
- The topmost variable changes slowest (one block per value)
- The bottommost variable changes every item

Reordering variables surfaces different patterns — grouping by strategy first shows strategy-level bands, grouping by tool result size first shows size-driven gradients.

**Zooming:** The user can zoom into a range of the bar to inspect a subset of simulations. Zooming in reveals finer-grained colour variation.

**Metric selection:** A dropdown lets the user switch which metric colours the heat bar. All metrics are pre-computed, so switching is instant. Metrics include at minimum: total cost, peak context size, number of compaction events, cache hit rate, external store size (where applicable), retrieval cost as % of total (where applicable).

**Hover/click:** Hovering over a segment shows a tooltip with the parameter values and key metrics for that simulation. Clicking opens a summary card with full details and an "Open in Simulator" button that loads the exact configuration into the Simulator tab for step-by-step inspection.

### Conversation consistency

When swept parameters include conversation shape params (tool result size, number of cycles, etc.), each parameter combination necessarily produces a different conversation — the engine generates the conversation from the params.

When only strategy/config params are swept (threshold, compression ratio, strategy selection) and conversation shape is fixed, all runs share the same generated conversation, making comparisons fair. The engine handles this automatically — it generates a conversation from the shape params and reuses it for all strategy/config variations of the same shape.

## User Stories

- As a developer, I want to sweep a range of parameter combinations across strategies so that I can find which strategy is most cost-effective under which conditions.
- As a developer, I want to see all simulation results as a heat bar so that I can visually spot patterns, clusters, and outliers across the parameter space.
- As a developer, I want to reorder the swept variables to surface different patterns in the heat bar.
- As a developer, I want to zoom into an interesting region of the heat bar and see what parameter configurations those simulations represent.
- As a developer, I want to click on an interesting simulation and load it in the interactive Simulator tab so I can step through it and understand why it produced that result.
- As a developer, I want a global slider that controls the total combination count so I can quickly dial between fast rough sweeps and detailed fine-grained sweeps.

## Acceptance Criteria

- [ ] New "Explorer" tab alongside existing "Simulator" tab
- [ ] All simulation parameters available in a fixed/swept bucket UI
- [ ] Swept parameters have configurable range, step count, and scale (linear/log)
- [ ] Strategy selection is available as a swept parameter
- [ ] Total combination count displayed with per-parameter breakdown
- [ ] Global slider to reduce combination count by adjusting step counts proportionally
- [ ] Warning when combination count exceeds threshold (threshold TBD based on performance testing)
- [ ] Simulations run in web workers with progress reporting
- [ ] All metrics stored per run (no re-run needed to switch displayed metric)
- [ ] 1D heat bar visualisation coloured by selected metric
- [ ] Draggable variable reordering that re-sorts the heat bar
- [ ] Zoom into ranges of the heat bar
- [ ] Hover tooltip showing parameter values and key metrics
- [ ] Click to open summary card with full details
- [ ] "Open in Simulator" button loads the configuration into the Simulator tab
- [ ] Conversation reuse when only non-shape parameters vary

## Out of Scope

- 2D heat map wrapping (may be added later if the 1D bar feels limiting)
- Monte Carlo / random sampling mode
- Statistical summary tables (mean/median/P5/P95) — may be added in a future iteration
- Scatter plots or other chart types
- Export of sweep results
- Automated "interesting configuration" detection / recommendations

## Open Questions

None — all resolved during discussion.
