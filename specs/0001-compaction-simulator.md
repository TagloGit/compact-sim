# 0001 — Compaction Strategy Simulator

## Problem

LLM agent conversations accumulate context over time — tool calls, results, reasoning, and messages. This context must be managed to control cost and maintain performance, but every compaction strategy involves trade-offs between information loss, compaction cost, and cache invalidation.

There is no intuitive way to compare these trade-offs across strategies. Raw numbers (cost per million tokens, compression ratios) don't convey the dynamic interplay of context growth, cache utilisation, compaction events, and cumulative spend over a real conversation. We need a simulation tool that makes these dynamics visible and quantifiable.

## Proposed Solution

A browser-based simulation application that models LLM agent conversations under different compaction strategies and visualises the cost, context size, and cache dynamics over time. The app has two modes:

1. **Interactive playback** — step through a single simulated conversation message-by-message, watching context grow, compaction events fire, cache state change, and costs accumulate. This is the primary mode for building intuition.

2. **Monte Carlo batch** — run hundreds of simulations with randomised parameters drawn from configurable distributions, producing statistical summaries for strategy comparison. This is the mode for quantitative analysis.

The simulation engine is assumption-driven — no real LLM calls are made. Conversations are generated from configurable parameters (message sizes, tool call frequency, compression ratios, etc.) and the engine models the cost and context implications of each strategy.

### Tech stack

- **React + TypeScript** — frontend framework with type safety
- **shadcn/ui + Tailwind** — component library for clean, configurable UI
- **Recharts** (or similar) — charting library for visualisations
- **Effect** — used for the simulation engine layer (typed errors, dependency injection for strategy/pricing/cache models, composable pipelines, fibers for Monte Carlo concurrency). Not used in the React UI layer.
- **Client-side simulation engine** — no backend; everything runs in the browser
- **Vite** — build tool

### Incremental delivery ("tracer bullet")

The app will be built incrementally, proving the full stack end-to-end with the simplest scenario first, then expanding:

1. **V1**: Strategy 1 (full compaction at threshold), fixed parameters exposed as UI controls, interactive playback with visualisations
2. **V2**: Strategy 2 (incremental compaction), Strategy 3 (tool result compression) as orthogonal toggle
3. **V3**: Strategy 4 variants (lossless with retrieval)
4. **V4**: Monte Carlo batch mode with statistical output tables
5. **V5**: Strategy 5 (agent-controlled discard), additional visualisations, import/export

## Domain Model

### Message types

The simulation models individual messages as the atomic unit. Each message has a type and a token size:

| Message type | Description |
|---|---|
| `system` | System prompt — fixed size, always at front of context |
| `user` | User message — infrequent, small |
| `assistant` | Assistant text output (non-reasoning) |
| `reasoning` | Extended thinking / chain-of-thought output — persists in context on subsequent turns, so contributes to both output cost and context growth pressure |
| `tool_call` | Tool invocation by the assistant |
| `tool_result` | Result returned by a tool |
| `summary` | Compaction summary that replaces other messages |

### Conversation generation model

A conversation is driven by **tool call cycles**. The user configures a target number of tool call cycles (N). Each cycle produces:

- 1 `tool_call` message (token size from distribution)
- 1 `tool_result` message (token size from distribution)
- Assistant `reasoning` tokens (from distribution, can be zero)
- Assistant `assistant` message tokens (from distribution, small — the "glue" between tool calls)

User messages appear at a configurable frequency (e.g. every K cycles) but are a minor contributor to context size. The first user message always appears at the start.

This means a typical conversation looks like:

```
[system] [user] [assistant+reasoning] [tool_call] [tool_result]
[assistant+reasoning] [tool_call] [tool_result]
[assistant+reasoning] [tool_call] [tool_result]
...
[user]  ← occasional user message
[assistant+reasoning] [tool_call] [tool_result]
...
```

**Total conversation length** is an emergent property of the number of tool cycles and the token size distributions.

### Context model

The **context** is the sequence of messages that would be sent to the LLM on the next API call. It differs from the full conversation because:

- Compacted messages are replaced by summaries
- Compressed tool results are smaller than originals
- Discarded messages are removed entirely

Context is modelled as an ordered list of message blocks. Each block has a token size and a type. The total context size is the sum of all block sizes.

### Cache model

Input caching applies to the stable prefix of the context:

- The context is a sequence of message blocks
- On each LLM call, the engine compares the current context prefix to the previous call's context
- All blocks that are identical and contiguous from the start are **cache hits**
- The first block that differs (and everything after it) is **cache miss**
- **Minimum cacheable prefix**: configurable (e.g. 2048 tokens) — if the stable prefix is below this, nothing is cached
- **Cache write cost**: configurable multiplier on base input price (e.g. 1.25x). Applied to all cache-miss tokens that will form part of the new cached prefix
- **Cache hit cost**: configurable fraction of base input price (e.g. 0.1x)
- **Cache never expires** within a conversation (simplification)
- After compaction, the prefix changes → cache invalidation from the compaction point onward
- First call after invalidation: changed portion is a cache miss (pays write cost). Second call onward: new prefix is cached (pays hit cost)

### Cost model

Each LLM call has the following cost components:

| Component | Calculation |
|---|---|
| Cached input | `cached_tokens * base_input_price * cache_hit_multiplier` |
| Cache write | `new_prefix_tokens * base_input_price * cache_write_multiplier` |
| Uncached input | `uncached_tokens * base_input_price` (tokens beyond the prefix that won't be cached, e.g. the latest messages) |
| Output | `output_tokens * output_price` |

Compaction calls use a separate (potentially cheaper) model with its own pricing:

| Component | Calculation |
|---|---|
| Compaction input | `context_to_compact_tokens * compaction_input_price` |
| Compaction output | `summary_tokens * compaction_output_price` |

Note: more aggressive compaction (shorter summaries) is actually cheaper in output tokens — the compaction LLM produces fewer tokens. This is a real dynamic we want to capture.

For Strategy 4d, sub-agent retrieval adds:

| Component | Calculation |
|---|---|
| Sub-agent input | `(sub_agent_system_prompt + expanded_content + query) * base_input_price` |
| Sub-agent output | `sub_agent_response_tokens * output_price` |

### Configurable parameters (V1)

These are exposed in the UI as controls. V1 uses fixed values (no distributions).

**Conversation shape:**

| Parameter | Default | Description |
|---|---|---|
| Tool call cycles | 50 | Number of tool call cycles in the conversation |
| Tool call size | 200 tokens | Size of each tool_call message |
| Tool result size | 2,000 tokens | Size of each tool_result message |
| Assistant message size | 300 tokens | Size of assistant text output per cycle |
| Reasoning output size | 500 tokens | Size of reasoning/thinking output per cycle (0 = no reasoning) |
| User message frequency | 10 | A user message appears every N cycles |
| User message size | 200 tokens | Size of each user message |
| System prompt size | 4,000 tokens | Fixed system prompt |

**Context & compaction:**

| Parameter | Default | Description |
|---|---|---|
| Context window | 200,000 tokens | Maximum context window size |
| Compaction threshold | 85% | Compact when context reaches this % of window |
| Compression ratio | 10:1 | How much smaller the summary is vs. source content |

**Pricing:**

| Parameter | Default | Description |
|---|---|---|
| Base input price | $5.00/M | Base cost per million input tokens |
| Output price | $25.00/M | Cost per million output tokens |
| Cache write multiplier | 1.25x | Multiplier on base input price for writing to cache |
| Cache hit multiplier | 0.10x | Multiplier on base input price for cache hits |
| Min cacheable tokens | 2,048 | Minimum prefix size before caching activates |
| Compaction input price | $0.80/M | Input cost for the compaction model |
| Compaction output price | $4.00/M | Output cost for the compaction model |

### Strategy definitions

**Strategy 1 — Full compaction at threshold:**
- When context size exceeds `compaction_threshold * context_window`:
  - All messages except system prompt are compacted — no "keep recent N" exception
  - A single summary message replaces all compacted messages
  - Summary size = `compacted_content_size / compression_ratio`
  - Context is now: `[system] [summary] [next new message...]`
  - Cache is fully invalidated (except system prompt)

**Strategy 2 — Incremental compaction at intervals** (V2):
- Configurable interval (e.g. every 30k tokens of new content since last compaction)
- Only new content since last compaction is summarised
- Summary is appended to accumulated summaries section
- Context: `[system] [summary_1] [summary_2] ... [recent raw content]`
- Cache invalidation only from the append point onward
- When accumulated summaries exceed a configurable threshold, fall back to Strategy 1 for the summary portion

**Strategy 3 — Tool result compression** (V2, orthogonal):
- Toggle on/off, combinable with any other strategy
- Each tool result is compressed at ingestion time
- Compressed size = `original_size / tool_compression_ratio`
- Zero LLM cost for compression (modelled as non-LLM method)
- Reduces the rate at which context grows, delaying compaction triggers

**Strategy 4a — Lossless append-only** (V3):
- Like Strategy 2, but original content stored in external store
- Summary includes IDs pointing to originals
- Agent can retrieve originals at configurable frequency
- Retrieval = sub-agent round-trip cost (see cost model)

**Strategy 4b — Lossless hierarchical** (V3):
- Like 4a, but summaries themselves can be re-summarised
- Creates DAG of summary → summary → original
- Retrieval may traverse multiple levels (higher cost per retrieval)
- Keeps active context smaller for longer

**Strategy 4c — Tool-results-only lossless** (V3):
- Only tool results get stored externally with IDs
- General conversation compacted normally (lossy)
- Combines naturally with Strategy 3

**Strategy 4d — Sub-agent retrieval (LCM model)** (V3):
- Based on Voltropy LCM paper
- Main agent cannot expand summaries directly — must spawn sub-agent
- Two retrieval tools: `lcm_grep` (cheaper, search-based) and `lcm_expand` (full expansion via sub-agent)
- Configurable mix of grep vs. expand usage
- Dual threshold model: τ_soft (async compaction) and τ_hard (blocking compaction)

**Strategy 5 — Agent-controlled discard** (V5):
- Agent periodically discards context segments
- Each discard event: removes X tokens, adds Y overhead tokens for the decision
- Configurable discard frequency, segment size, overhead
- Probabilistic "regret" penalty: chance that discarded content was needed, adding extra tool cycles
- Models the 13-15% longer trajectory finding

### Strategy composability

Strategies fall into two groups:

- **Primary strategies** (mutually exclusive): 1, 2, 4a, 4b, 4c, 4d — these define *what happens when context gets big*
- **Orthogonal modifiers** (can layer on top): 3 (tool compression), 5 (agent discard)

The UI should present this as: pick one primary strategy, then toggle orthogonal modifiers on/off.

## User Stories

- As a developer evaluating compaction approaches, I want to step through a simulated conversation and watch context grow, compact, and regrow, so that I can build intuition for how each strategy behaves dynamically.
- As a developer, I want to adjust simulation parameters (context window, compression ratio, tool result sizes, etc.) and immediately see how the simulation changes, so that I can explore the parameter space interactively.
- As a developer, I want to see cumulative cost broken down by component (cached input, uncached input, output, compaction) as the conversation progresses, so that I can understand where money is being spent.
- As a developer, I want to see cache utilisation over time (hit rate, invalidation events), so that I can understand the cache trade-off of each strategy.
- As a developer, I want to compare strategies side-by-side using Monte Carlo results with statistical summaries, so that I can make data-driven decisions about which strategy to implement.
- As a developer, I want to toggle tool result compression on/off with any primary strategy, so that I can evaluate it as an independent optimisation.

## Acceptance Criteria

### V1 (tracer bullet)

- [ ] Web app runs locally via `npm run dev` (or equivalent)
- [ ] Simulation engine generates a conversation from configurable parameters
- [ ] Strategy 1 (full compaction at threshold) is implemented in the engine
- [ ] All V1 parameters are exposed as UI controls that update the simulation
- [ ] Interactive playback: user can step forward/backward through messages
- [ ] Context stack visualisation: vertical stack showing each message as its own distinct block, colour-coded by type, with compacted messages visually distinguished (e.g. reduced opacity)
- [ ] Context size chart: line chart showing total context size over time (message index on x-axis), producing the characteristic "sawtooth" pattern on compaction
- [ ] Cost chart: cumulative cost breakdown over time (cached input, uncached input, output, compaction costs as stacked areas or lines)
- [ ] Cache hit rate indicator: shows what percentage of input tokens hit cache on each call
- [ ] All visualisations update as the user steps through the playback
- [ ] Changing a parameter resets and regenerates the simulation

### V2

- [ ] Strategy 2 (incremental compaction) implemented
- [ ] Strategy 3 (tool result compression) as orthogonal toggle
- [ ] Strategy selector in UI (pick primary strategy + toggle modifiers)
- [ ] Summary accumulation visible in context stack visualisation

### V3

- [ ] Strategy 4a, 4b, 4c, 4d implemented
- [ ] Retrieval events visible in playback (sub-agent cost appears in cost chart)
- [ ] External store size tracked and displayed

### V4

- [ ] Monte Carlo batch mode: run N simulations with parameter distributions
- [ ] Distribution configuration for key randomised parameters
- [ ] Results displayed as statistical summary tables (mean, median, P5, P95 for key metrics)
- [ ] Comparison across strategies in a single batch run

### V5

- [ ] Strategy 5 (agent-controlled discard) implemented
- [ ] Import/export of simulation configuration (JSON file)
- [ ] Any additional visualisations identified during development

## Out of Scope

- Real LLM calls or actual text summarisation
- Real or synthetic conversation data — all conversations are generated from parameter distributions
- Performance/accuracy degradation modelling (empirical and model-specific)
- Mobile or responsive design
- Multi-user or hosted deployment
- Provider-specific pricing presets (later enhancement)
- Embedding-based retrieval modelling for Strategy 4

