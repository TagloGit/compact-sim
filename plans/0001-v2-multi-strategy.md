# 0001 — V2 Multi-Strategy — Implementation Plan

## Overview

Add Strategy 2 (incremental compaction at intervals) and Strategy 3 (tool result compression as orthogonal toggle) to the simulator. This requires making the engine strategy-pluggable, adding a strategy selector to the UI with conditional parameter visibility, and implementing both new strategies.

See [spec](../specs/0001-compaction-simulator.md) — V2 acceptance criteria.

## Files to Touch

### Engine

- `src/engine/types.ts` — Add `selectedStrategy` and `toolCompressionEnabled`/`toolCompressionRatio` to `SimulationConfig`. Add `StrategyType` union type.
- `src/engine/strategy.ts` — Extract strategy registry. Add `strategy2` (incremental compaction). Add `getStrategy(type)` lookup function.
- `src/engine/simulation.ts` — Use selected strategy from config instead of hardcoded `strategy1`. Apply tool result compression at ingestion when enabled.

### UI

- `src/components/controls/ParameterPanel.tsx` — Add strategy dropdown at the top. Add Strategy 2–specific params (incremental interval, summary accumulation threshold). Add Strategy 3 toggle + compression ratio. Show/hide strategy-specific params based on selection.
- `src/App.tsx` — Replace hardcoded strategy description with dynamic text based on `config.selectedStrategy`.

### Tests

- `src/engine/__tests__/strategy.test.ts` — Tests for Strategy 2 compaction logic.
- `src/engine/__tests__/simulation.test.ts` — Tests for tool result compression and strategy selection wiring.

## Order of Operations

### Issue 1: Make strategy selection pluggable + UI selector

**Goal:** Wire up strategy selection end-to-end without implementing new strategies yet. After this, the dropdown exists and switching between strategies works (only Strategy 1 available initially).

**Engine changes:**

1. Add to `types.ts`:
   - `StrategyType = 'full-compaction' | 'incremental'` union type
   - `selectedStrategy: StrategyType` to `SimulationConfig` (default: `'full-compaction'`)
   - Strategy 2–specific params to `SimulationConfig` (with defaults), so the type is complete from the start:
     - `incrementalInterval: number` — tokens of new content before compaction fires (default: 30,000)
     - `summaryAccumulationThreshold: number` — when accumulated summaries exceed this token count, re-compact them into one (default: 50,000)
   - Strategy 3 params:
     - `toolCompressionEnabled: boolean` (default: `false`)
     - `toolCompressionRatio: number` (default: 5)

2. Add to `strategy.ts`:
   - `getStrategy(type: StrategyType): CompactionStrategy` function that returns the right implementation
   - For now, both `'full-compaction'` and `'incremental'` return `strategy1` (placeholder)

3. Update `simulation.ts`:
   - Import `getStrategy` instead of `strategy1`
   - Resolve strategy via `getStrategy(config.selectedStrategy)` at the top of the simulation loop

**UI changes:**

4. Update `ParameterPanel.tsx`:
   - Add a "Strategy" section at the top of the panel (above "Conversation Shape")
   - Strategy dropdown (`<Select>`) with options: "1 — Full compaction" and "2 — Incremental compaction"
   - Tool compression toggle (checkbox/switch) + ratio slider, always visible (orthogonal to primary strategy)
   - Strategy 2 params (`incrementalInterval`, `summaryAccumulationThreshold`) shown only when `selectedStrategy === 'incremental'`
   - Strategy 1 has no unique params beyond the shared compaction threshold + compression ratio

5. Update `App.tsx`:
   - Replace hardcoded `"Strategy 1 — Full compaction at threshold"` with a dynamic description derived from `config.selectedStrategy`
   - Include a note about tool compression if enabled

**Tests:** Verify `getStrategy` returns valid strategies for all types.

### Issue 2: Strategy 2 — Incremental compaction

**Goal:** Implement the incremental compaction strategy per the spec.

**Behaviour (from spec):**

- Track "new content since last compaction" — token count of messages added since the last compaction event (or start of conversation)
- When new content exceeds `incrementalInterval`:
  - Only the new content since the last compaction is summarised
  - Summary is appended to a summaries section in context
  - Context becomes: `[system] [summary_1] [summary_2] ... [summary_N] [recent raw content]`
  - Cache invalidation only from the new summary's insert point onward (prior summaries remain cached)
- When accumulated summary tokens exceed `summaryAccumulationThreshold`:
  - All summaries are re-compacted into a single summary (Strategy 1–style for the summary portion)
  - This is a "meta-compaction" — summary of summaries

**Key design decisions:**

- The `CompactionStrategy.evaluate()` interface takes `(context, config)` and returns `CompactionResult`. Strategy 2 needs to know which messages are "new since last compaction". Two approaches:
  - **Option A:** Track state externally — the simulation runner passes additional context (e.g. last compaction index) to the strategy. Requires changing the interface.
  - **Option B:** Track state via message IDs — summary messages act as markers. The strategy can identify new content as "everything after the last summary message (or system prompt if no summaries)". No interface change needed.
  - **Recommended: Option B** — simpler, no interface change, summaries already exist in the context message list.

**Engine changes:**

1. Implement `strategy2` in `strategy.ts`:
   - Find the last summary message in context (or system prompt if none)
   - Calculate tokens of messages after that point ("new content")
   - If new content > `config.incrementalInterval`, compact only those messages into a new summary
   - Check if total summary tokens > `config.summaryAccumulationThreshold` → if so, re-compact all summaries into one
   - Return `CompactionResult` with the updated context

2. Update `getStrategy` to return `strategy2` for `'incremental'`.

3. Update `simulation.ts` post-compaction context building:
   - Currently hardcoded to `[system, summary]` after compaction. Strategy 2 produces `[system, summary_1, ..., summary_N, recent...]`. The runner should use the `newContext` from the `CompactionResult` directly rather than reconstructing it.
   - Review the compaction cost calculation — for incremental, only the new content is the compaction input (not the full context).

**Tests:**

- Incremental compaction fires at the right interval
- Multiple summaries accumulate in context
- Summary re-compaction triggers when threshold exceeded
- Cache prefix preserved for earlier summaries after incremental compaction
- Compaction cost calculated on new content only (not full context)

### Issue 3: Strategy 3 — Tool result compression (orthogonal toggle)

**Goal:** Implement tool result compression as a toggle combinable with any primary strategy.

**Behaviour (from spec):**

- When `toolCompressionEnabled` is true, each `tool_result` message has its token size reduced at ingestion: `compressed_size = original_size / toolCompressionRatio`
- Zero LLM cost for compression (modelled as non-LLM method, e.g. truncation/extraction)
- Effect: context grows slower → compaction triggers are delayed → more cache stability → lower cost
- Combinable with Strategy 1 or 2

**Engine changes:**

1. Update `simulation.ts` — in the message processing loop, before adding a message to the conversation:
   - If `config.toolCompressionEnabled` and message type is `tool_result`:
     - Create a modified message with `tokens: Math.ceil(message.tokens / config.toolCompressionRatio)`
   - Use the (possibly compressed) message for all subsequent processing

2. No changes to `strategy.ts` or `cache.ts` — compression is transparent to strategies.

**UI changes:**

- Already handled in Issue 1 (toggle + ratio in ParameterPanel).

**Tests:**

- Tool results are compressed when enabled
- Compression ratio applied correctly (ceil division)
- Context grows slower with compression enabled
- Compaction fires later (or fewer times) compared to no compression
- Compression + Strategy 1 works
- Compression + Strategy 2 works

## Dependencies

```
Issue 1 (pluggable strategy + UI)
  ├──▶ Issue 2 (Strategy 2 implementation)
  └──▶ Issue 3 (Strategy 3 implementation)
```

Issues 2 and 3 can be worked in parallel once Issue 1 is complete.

## Testing Approach

- Engine unit tests in `src/engine/__tests__/` using Vitest
- Each strategy gets targeted tests for its compaction logic
- Integration-style tests: run full simulation with known config, assert snapshot properties
- No new UI component tests — manual verification sufficient at this stage
