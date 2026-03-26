# 0001 — V3 Lossless with Retrieval — Implementation Plan

## Overview

Add Strategy 4 variants (4a, 4b, 4c, 4d) — lossless compaction with external storage and retrieval. Also fix three bugs from V2, refactor the simulation loop into a step pipeline, and update defaults. This is the largest version yet: four new strategies with shared infrastructure (external store, retrieval probability model, retrieval cost model, store visualisation).

The refactoring is a structural prerequisite: the current `simulation.ts` is a procedural loop with scattered mutable state and conditional branches that already produced two integration bugs in V2. Adding four more strategies, external store tracking, and retrieval probability to the same loop would compound the problem. The pipeline refactor makes each concern a self-contained stage, eliminating the class of bug where conditions in one part of the loop silently affect another.

See [spec](../specs/0001-compaction-simulator.md) — V3 acceptance criteria.

## Bug Fixes (Issue 0)

Three issues discovered during V2 testing:

### Bug 1: Compaction cost silently dropped

**Location:** `src/engine/simulation.ts:148-168`

Cost calculation is inside `if (isLlmCallStep(message))`, but compaction fires on any message type (commonly `tool_result`, which is the biggest contributor to context growth). When compaction fires on a non-LLM step, `compactionEvent=true` and `tokensCompacted`/`summaryTokens` are computed, but the cost calculator is never called — compaction cost is silently zero.

**Fix:** Split compaction cost out of the LLM-step gate. When compaction fires, always calculate and add compaction cost. Cache/input/output cost still only calculated on LLM steps.

### Bug 2: Strategy 2 ignores main compaction threshold

**Location:** `src/engine/strategy.ts:107`

Strategy 2 only checks `newContentTokens > config.incrementalInterval`. It never checks whether total context exceeds `compactionThreshold * contextWindow`. So with a 100k window at 85%, context can grow past 85k if the incremental interval hasn't been reached — the main threshold is ignored.

**Fix:** Add a secondary check in Strategy 2: if `context.totalTokens > config.compactionThreshold * config.contextWindow`, fire compaction on the new content regardless of whether the incremental interval was reached. This ensures the context window threshold is always respected.

### Bug 3: Default value updates

- `toolCallCycles`: 50 → **100**
- `minCacheableTokens`: 2,048 → **4,096**

## New Domain Concepts

### External Store

Strategy 4 variants store original content externally when compacting. The store is modelled as:

```typescript
interface ExternalStore {
  readonly entries: readonly ExternalStoreEntry[]
  readonly totalTokens: number
}

interface ExternalStoreEntry {
  readonly id: string
  readonly originalMessageIds: readonly string[]  // messages this entry stores
  readonly tokens: number                         // total tokens stored
  readonly level: number                          // 0 = original content, 1 = summary-of-summaries, etc. (4b only)
}
```

The store grows monotonically — content is never removed. It has no cost (it's just "memory" outside the context window). Its value is that retrieval is possible.

### Retrieval Probability Model

Whether the agent retrieves from the external store on a given turn depends on how much content has been compressed away:

```
pRetrieve = min(compressedTokens / compressedTokensCap, 1.0) * pRetrieveMax
```

Where:
- `compressedTokens` = total tokens that have been compacted into summaries (cumulative)
- `compressedTokensCap` = token count at which retrieval probability plateaus (configurable, default: 100,000)
- `pRetrieveMax` = maximum retrieval probability (configurable, default: 0.20)

This gives linear growth from 0% to `pRetrieveMax` as compressed tokens increase from 0 to `compressedTokensCap`, then flat. `f(0) = 0%`, `f(100k) = 20%`, `f(800k) = 20%`.

The simulation uses a seeded PRNG to determine whether retrieval fires on each turn (for reproducibility).

### Retrieval Cost Model

When retrieval fires, it has a cost (sub-agent round-trip):

| Component | Calculation |
|---|---|
| Retrieval input | `(retrievalQueryTokens + retrievedContentTokens) * config.baseInputPrice` |
| Retrieval output | `retrievalResponseTokens * config.outputPrice` |

Where:
- `retrievalQueryTokens` — fixed size per retrieval (configurable, default: 500)
- `retrievedContentTokens` — tokens of original content pulled from store. For 4a/4c, this is one entry. For 4b, this may traverse levels. For 4d, depends on tool type.
- `retrievalResponseTokens` — fixed size per retrieval (configurable, default: 300)

Retrieved content is **not** added back to the main context — the sub-agent processes it and returns a response that the main agent uses. The retrieval cost is the only impact.

### Strategy 4d: LCM Model Specifics

4d differs from 4a-4c:
- Two retrieval tools: `lcm_grep` (cheap, small response) and `lcm_expand` (expensive, full expansion)
- Configurable mix: `lcmGrepRatio` (default: 0.7) — 70% of retrievals use grep, 30% use expand
- `lcm_grep` cost: `retrievalQueryTokens * baseInputPrice + grepResponseTokens * outputPrice` (grepResponseTokens default: 100)
- `lcm_expand` cost: `(retrievalQueryTokens + retrievedContentTokens) * baseInputPrice + retrievalResponseTokens * outputPrice`
- Compaction behaviour: same thresholds as Strategy 2 (incremental interval + main threshold), but compacts **all non-system, non-summary content** each time (not just new content since last compaction). This means after compaction the context is always `[system] [single_summary]`, with everything else in the external store.

## New Config Parameters

```typescript
// Strategy 4 — Lossless retrieval (shared)
readonly retrievalQueryTokens: number        // default: 500
readonly retrievalResponseTokens: number     // default: 300
readonly pRetrieveMax: number                // default: 0.20
readonly compressedTokensCap: number         // default: 100_000

// Strategy 4d — LCM specifics
readonly lcmGrepRatio: number               // default: 0.70
readonly lcmGrepResponseTokens: number      // default: 100
```

## Strategy Definitions

### Strategy 4a — Lossless Append-Only

- Same compaction triggers as Strategy 2 (incremental interval + main threshold)
- Same compaction scope as Strategy 2 (compact only new content since last summary)
- On compaction: original content is stored in external store before being replaced by summary
- Summary includes pointer to store entry (modelled as summary having an `externalStoreId`)
- Retrieval: on each LLM call step, roll pRetrieve. If retrieval fires, pull one random entry from external store and pay retrieval cost.

### Strategy 4b — Lossless Hierarchical

- Same triggers as 4a
- Same compaction as 4a, but also: when accumulated summaries exceed `summaryAccumulationThreshold`, re-compact summaries into a meta-summary (like Strategy 2's meta-compaction), storing the original summaries in the external store at level 1
- Creates a hierarchy: level 0 = original content, level 1 = summaries of originals, level 2 = summary of summaries...
- Retrieval may need to traverse levels: if the agent retrieves a level-1 entry, it may then need to retrieve the level-0 entry underneath. Model this as: retrieval cost multiplied by `(level + 1)`. Average retrieval level = weighted average of store entry levels.

### Strategy 4c — Tool-Results-Only Lossless

- Only `tool_result` messages get stored externally
- General conversation compacted normally using Strategy 2 logic (lossy, no external storage)
- External store only contains tool results
- Retrieval: pRetrieve based only on compressed tool_result tokens (not all compressed tokens)
- Naturally combines with Strategy 3 (tool compression happens at ingestion, then lossless storage stores the compressed version)

### Strategy 4d — Sub-Agent Retrieval (LCM Model)

- Compaction triggers: same as Strategy 2 (incremental interval + main threshold)
- Compaction scope: **everything** non-system, non-summary is compacted into a single summary each time. More aggressive than 4a — no keeping recent raw content alongside summaries.
- All compacted content goes to external store
- Retrieval: two tools (`lcm_grep` and `lcm_expand`) with configurable mix
- Cost structure differs per tool type (see Retrieval Cost Model above)

## Strategy Composability Update

Updated grouping with new strategies:

- **Primary strategies** (mutually exclusive): 1, 2, 4a, 4b, 4c, 4d
- **Orthogonal modifiers** (can layer on top): 3 (tool compression), 5 (agent discard — V5)

The `StrategyType` union becomes:
```typescript
type StrategyType = 'full-compaction' | 'incremental' | 'lossless-append' | 'lossless-hierarchical' | 'lossless-tool-results' | 'lcm-subagent'
```

## UI Changes

### Strategy Selector

Add four new options to the strategy dropdown:
- "4a — Lossless append-only"
- "4b — Lossless hierarchical"
- "4c — Tool-results-only lossless"
- "4d — LCM sub-agent retrieval"

Conditional parameters:
- All 4x strategies show: `pRetrieveMax`, `compressedTokensCap`, `retrievalQueryTokens`, `retrievalResponseTokens`
- 4a, 4b, 4d show: `incrementalInterval` (same as Strategy 2)
- 4b shows: `summaryAccumulationThreshold`
- 4d shows: `lcmGrepRatio`, `lcmGrepResponseTokens`

### External Store Visualisation

New component below the context stack. Design:

- Same horizontal bar approach as context stack, where the width represents the context window size (for visual alignment)
- Content fills left-to-right within the row, then wraps to the next row when it exceeds the width
- Each entry is a coloured block (sized proportional to its token count, same scale as context stack)
- Colour: use a distinct colour for external store entries (e.g. indigo). For 4b, vary shade by level.
- Header: "External Store — {totalTokens} tokens"
- Only visible when a Strategy 4x is selected

### Cost Chart Update

Add `retrieval` as a new cost component in the cumulative cost breakdown chart (new colour in the stacked area).

### StepCost Type Update

Add to `StepCost`:
```typescript
readonly retrievalInput: number
readonly retrievalOutput: number
```

Update `addCosts`, `ZERO_COST`, and the cost chart to include these.

## Simulation Loop Refactor (Issue 2)

The current `simulation.ts` is a single procedural loop with 7+ mutable variables, conditional flag-setting in one section consumed by conditional logic in another. Both V2 bugs are symptoms of this design — not logic errors in isolation, but integration wiring errors in the loop. Adding V3 concerns (external store, retrieval probability, retrieval cost) to this loop would make it worse.

### Current problems

1. **Scattered mutable state:** `conversation`, `previousContext`, `cumulativeCost`, `compactionEvents`, `peakContextSize`, `totalTokensGenerated`, `summaryCounter` — all mutated across the loop body.
2. **Conditional coupling:** `compactionEvent` is set unconditionally, but its cost is consumed inside `if (isLlmCallStep)`. No structural guarantee these are coordinated.
3. **Implicit ordering:** compaction ID remapping, conversation mutation, context rebuilding, cache calculation, and cost calculation all depend on execution order within the loop, but nothing enforces or documents that order.

### Target design: step pipeline

Refactor into a pipeline of pure transformation stages. Each step takes an immutable `StepState` and returns a new one:

```typescript
interface StepState {
  readonly conversation: readonly Message[]
  readonly context: ContextState
  readonly previousContext: ContextState | null
  readonly externalStore: ExternalStore
  readonly compressedTokens: number       // cumulative, for retrieval probability
  readonly summaryCounter: number
  readonly cumulativeCost: StepCost
  readonly peakContextSize: number
}

interface StepResult {
  readonly state: StepState
  readonly snapshot: SimulationSnapshot
}
```

The loop becomes:

```
for each message in allMessages:
  state = ingestMessage(state, message, config)       // add to conversation, apply tool compression
  state = buildContext(state)                          // filter non-compacted messages
  state = evaluateCompaction(state, strategy, config)  // strategy.evaluate → apply result
  state = updateExternalStore(state, config)           // add compacted content to store (4x only)
  state = calculateCache(state, config)                // prefix cache model
  state = rollRetrieval(state, prng, config)           // retrieval probability → event
  state = calculateCost(state, message, config)        // all cost components, unconditionally
  snapshot = buildSnapshot(state, message, stepIndex)  // assemble immutable snapshot
```

Each stage:
- Takes only what it needs from `StepState`
- Returns a new `StepState` (no mutation)
- Has no knowledge of other stages' internals
- Can be tested in isolation with a constructed `StepState`

**Bug 1 becomes impossible:** `calculateCost` always runs. If compaction didn't fire, `tokensCompacted` is 0 and compaction cost is naturally 0. No gate needed.

**Bug 2 stays in the strategy:** The threshold check belongs in `evaluateCompaction`, which delegates to the strategy. The pipeline doesn't need to know about it.

**V3 extensibility:** Adding external store tracking is just `updateExternalStore`. Adding retrieval is just `rollRetrieval`. Neither touches the other stages.

### Migration approach

- The `StepState` type and pipeline stages are new code
- The existing `runSimulation` function signature and return type (`SimulationResult`) do not change
- All 56 existing tests must continue to pass — they test inputs and outputs, not the internal loop structure
- The refactor is purely internal to `simulation.ts` (plus the new `StepState` type)

### Snapshot type additions

`SimulationSnapshot` adds:
```typescript
readonly externalStore: ExternalStore
readonly retrievalEvent: boolean
```

## Files to Touch

### Engine

- `src/engine/types.ts` — Add `ExternalStore`, `ExternalStoreEntry`, new `StrategyType` values, new config params, `retrievalInput`/`retrievalOutput` on `StepCost`, `externalStore`/`retrievalEvent` on `SimulationSnapshot`
- `src/engine/strategy.ts` — Add `strategy4a`, `strategy4b`, `strategy4c`, `strategy4d`. Update `CompactionResult` to include `externalStoreEntries` (content to add to store). Update `getStrategy`.
- `src/engine/simulation.ts` — Bug fix #1 (compaction cost). Add external store tracking, retrieval probability logic, retrieval cost calculation. Add PRNG for deterministic retrieval rolls.
- `src/engine/cost.ts` — Add retrieval cost fields to calculator. Update `ZERO_COST`, `addCosts`.
- `src/engine/retrieval.ts` — New file: retrieval probability function, retrieval cost calculator, PRNG utility.

### UI

- `src/engine/types.ts` — Default config updates (bug fix #3)
- `src/components/controls/ParameterPanel.tsx` — New strategy options, conditional params for 4x strategies
- `src/components/visualisations/ContextStack.tsx` — (minor) no changes needed, but verify it handles new strategy contexts correctly
- `src/components/visualisations/ExternalStore.tsx` — New component: wrapping horizontal bar showing external store contents
- `src/components/visualisations/CostChart.tsx` — Add retrieval cost series
- `src/App.tsx` — Wire up ExternalStore component, update strategy descriptions

### Tests

- `src/engine/__tests__/simulation.test.ts` — Bug fix verification, retrieval integration tests
- `src/engine/__tests__/strategy.test.ts` — Tests for all four 4x strategies
- `src/engine/__tests__/retrieval.test.ts` — Retrieval probability model, cost calculations

## Order of Operations

### Issue 1: Bug fixes + defaults

Fix the three bugs. Small, self-contained, unblocks accurate testing of everything else.

- Fix compaction cost gating in `simulation.ts`
- Fix Strategy 2 threshold check in `strategy.ts`
- Update defaults in `types.ts`
- Add test: force compaction on a `tool_result` step, assert `cumulativeCost.compactionInput > 0`
- Add test: Strategy 2 with small context window where main threshold is reached before incremental interval, assert compaction fires
- Add known-answer integration test: fixed config, verify exact cost breakdown at a specific step
- Update existing test "only assistant/reasoning steps incur output cost" which currently codifies the buggy assumption (it asserts all cost fields are zero on non-LLM steps — compaction cost should be allowed)

### Issue 2: Refactor simulation loop into step pipeline

Restructure `simulation.ts` from procedural loop to step pipeline. Purely internal refactor — no changes to `runSimulation` signature or `SimulationResult`.

- Define `StepState` type (immutable state threaded through pipeline)
- Extract pipeline stages: `ingestMessage`, `buildContext`, `evaluateCompaction`, `calculateCache`, `calculateCost`, `buildSnapshot`
- Add placeholder stages for V3: `updateExternalStore` (no-op), `rollRetrieval` (no-op) — these accept `StepState` and return it unchanged, but the pipeline slot exists
- Verify all 56 existing tests pass unchanged
- Add pipeline-specific tests: verify `StepState` is not mutated between stages, verify stage ordering doesn't matter for independent stages

### Issue 3: External store infrastructure + retrieval model

Build the shared infrastructure that all 4x strategies depend on, without implementing any strategies yet.

- Add new types (`ExternalStore`, `ExternalStoreEntry`, retrieval config params, `StepCost` additions)
- Create `retrieval.ts` (probability model, cost calculator, seeded PRNG)
- Implement `updateExternalStore` and `rollRetrieval` pipeline stages (active, but no-op when store is empty)
- Update `cost.ts` with retrieval fields
- Tests for retrieval probability function, cost calculation, PRNG reproducibility

### Issue 4: Strategy 4a — Lossless append-only

First strategy to use the external store. Validates the full pipeline.

- Implement `strategy4a` in `strategy.ts`
- Update `CompactionResult` to include `externalStoreEntries`
- Wire up in `updateExternalStore` stage: on compaction, add entries to store
- Update `StrategyType`, `getStrategy`, default config
- Tests for compaction + store population + retrieval integration

### Issue 5: Strategy 4c — Tool-results-only lossless

Simpler than 4b, builds on 4a pattern. Good to do before 4b because it validates the "partial lossless" approach.

- Implement `strategy4c` — hybrid: tool results go to store, rest compacted normally
- Retrieval probability based on compressed tool_result tokens only
- Tests for selective storage, interaction with tool compression toggle

### Issue 6: Strategy 4b — Lossless hierarchical

Extends 4a with multi-level storage and meta-compaction.

- Implement `strategy4b` — hierarchical store with levels
- Retrieval cost multiplied by `(level + 1)`
- Store entries track level
- Tests for level creation, meta-compaction, retrieval cost scaling

### Issue 7: Strategy 4d — LCM sub-agent retrieval

Most complex strategy. Two retrieval tools, aggressive compaction.

- Implement `strategy4d` — full compaction each time, dual retrieval tools
- Retrieval cost split by `lcmGrepRatio`
- New config params for LCM specifics
- Tests for aggressive compaction, grep vs expand cost split

### Issue 8: UI — Strategy selector, parameters, external store visualisation

UI updates for all the new strategies.

- Add strategy options to selector dropdown
- Add conditional parameter sections for 4x strategies
- Create `ExternalStore.tsx` component (wrapping horizontal bar)
- Update cost chart with retrieval series
- Update `App.tsx` to wire everything together
- Update strategy description text

## Dependencies

```
Issue 1 (bug fixes)
  └──▶ Issue 2 (simulation loop refactor)
         └──▶ Issue 3 (external store + retrieval infra)
                ├──▶ Issue 4 (Strategy 4a)
                │      └──▶ Issue 6 (Strategy 4b — extends 4a)
                ├──▶ Issue 5 (Strategy 4c)
                └──▶ Issue 7 (Strategy 4d)
                               └──▶ Issue 8 (UI updates — needs all strategies)
```

Issues 4, 5, and 7 can be worked in parallel once Issue 3 is complete.
Issue 6 depends on Issue 4 (extends 4a's pattern).
Issue 8 depends on all strategies being implemented.

## Testing Approach

- Engine unit tests in `src/engine/__tests__/` using Vitest
- **Bug fix regression tests** (Issue 1): compaction cost on non-LLM steps, Strategy 2 threshold enforcement, known-answer cost verification
- **Pipeline stage tests** (Issue 2): each stage tested in isolation with constructed `StepState` inputs. Verify immutability (input state not mutated). Verify all existing tests pass unchanged.
- **Retrieval model tests** (Issue 3): probability function (boundary values, linearity, cap), cost calculator, PRNG determinism (same seed = same results)
- **Strategy tests** (Issues 4-7): each strategy's compaction logic, external store population, interaction with retrieval
- **Integration tests**: run full simulation with known config + seed, assert properties (store size, retrieval count ranges, cost components present)
- No new UI component tests — manual verification sufficient at this stage

## Open Questions

None — Tim's answers during planning covered the key design decisions.
