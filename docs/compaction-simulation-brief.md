# Context Compaction Simulation Brief

This document describes the compaction strategies under consideration for LLM agent context management, and frames a simulation exercise to evaluate their cost and performance trade-offs. It is intended to seed a standalone simulation tool — no conclusions are drawn here.

## Background

LLM agents accumulate context over the course of a conversation: user messages, assistant responses, tool calls, tool results, and system instructions. As context grows, two problems emerge:

1. **Performance degradation** — Research (Chroma 2025, 18 frontier models) shows measurable degradation at every context length increment, with significant drops above 100k tokens and severe degradation above 200k.
2. **Cost escalation** — Every LLM call re-sends the full accumulated context as input. Larger context means higher per-call cost, compounded across many calls per conversation.

Compaction aims to reduce context size while preserving the information the agent needs to continue working effectively. Every compaction strategy involves trade-offs between information loss, cost of the compaction itself, and disruption to input caching.

## Input caching

Most LLM providers offer input caching: if the prefix of a request matches a previous request exactly (byte-identical), the cached portion is charged at ~25% of the normal input rate. This means:

- A stable context prefix saves ~75% on input costs for most calls
- Any change to the prefix (even a single character) fully invalidates the cache from that point forward
- Compaction inherently invalidates at least part of the cache, since it modifies context
- The cost of cache invalidation depends on how much of the prefix changes and how many subsequent calls occur before the new prefix is itself cached

This creates a fundamental tension: compacting improves per-call cost (smaller context) but destroys cache savings until the new context stabilises. The simulation must model this trade-off explicitly.

## Compaction strategies

### Strategy 1: Full compaction (on-demand or at threshold)

**Trigger**: User request, or context reaching a size threshold (e.g. 80% of window).

**Mechanism**: The entire conversation history is summarised in a single pass. The summary replaces all prior context. Conversation continues with the summary as the new prefix.

**Characteristics**:
- Single compaction event, relatively infrequent
- Full cache invalidation on each compaction
- Summary quality depends on conversation length at time of compaction — longer conversations are harder to summarise well
- After compaction, context is small and grows again from near-zero
- Simplest to implement

**Cache dynamics**: Long stable periods (good cache utilisation) punctuated by full invalidation events. After compaction, the new small prefix caches quickly.

### Strategy 2: Incremental compaction at intervals

**Trigger**: Context grows by a fixed increment (e.g. every 50k tokens of new content).

**Mechanism**: Only the new content since the last compaction is summarised. The new summary is appended to the accumulated summaries from previous compactions. The raw content that was just summarised is discarded.

So context structure is: `[system prompt] [accumulated summaries] [raw recent content]`

**Characteristics**:
- Compaction happens more frequently but is cheaper per event (smaller input to summarise)
- Each compaction invalidates from the point where new summary text is appended
- Accumulated summaries grow over time — eventually the summaries themselves may need compaction (falling back to Strategy 1 for the summary portion)
- The "recent content" window is bounded, keeping the active working context fresh
- Moderate implementation complexity

**Cache dynamics**: Moderate invalidation on each compaction (only from the append point onward). The system prompt and older summaries remain cached. More frequent invalidation events than Strategy 1, but each event invalidates less.

**Key simulation parameters**:
- Compaction interval (tokens of new content before triggering)
- Summary compression ratio (how much smaller the summary is vs. raw content)
- At what accumulated summary size does a full re-compaction become necessary?

### Strategy 3: Tool result compression at ingestion

**Trigger**: Immediately, when a tool result is received.

**Mechanism**: Before a tool result enters the conversation context, it is compressed. This could range from simple truncation to LLM-based summarisation to complete removal (keeping only the tool call signature). The original result may be stored externally for retrieval.

**Characteristics**:
- Prevents context bloat rather than remediating it
- Tool results are typically the largest context consumers (often 10x-100x larger than user/assistant messages)
- Compression ratios of 10:1 to 20:1 are achievable
- Can use non-LLM methods (truncation, extraction) for zero additional LLM cost
- Orthogonal to other strategies — can be combined with any of them

**Cache dynamics**: Minimal impact. Tool results appear at the end of context (after the cached prefix). Compressing them before insertion means the prefix is never modified. The only cost consideration is the compression operation itself.

**Key simulation parameters**:
- Distribution of tool result sizes (highly variable in practice)
- Compression method and ratio
- Whether original results are stored externally (storage cost) or discarded
- Frequency of tool calls per conversation

### Strategy 4: Lossless compaction with retrievable context

**Trigger**: At intervals (like Strategy 2) or continuously.

**Mechanism**: Context is summarised, but the original content is stored externally with an identifier. The summary includes these identifiers. The agent has a tool to retrieve original content by ID when it needs more detail.

Context structure: `[system prompt] [summary with IDs] [raw recent content]`

External store: `{ID → original content}`

**Characteristics**:
- No permanent information loss — everything is retrievable
- Agent can "zoom in" on any past context when needed
- Retrieval adds a tool call (cost + latency) but only when actually needed
- Summary can be more aggressive (higher compression ratio) since detail is recoverable

**Sub-variants**:

**4a: Append-only summaries, no re-compaction of summaries**
- New summaries appended to old summaries (like Strategy 2)
- IDs always point to original raw content
- Simple ID structure, no nesting
- Eventually requires full re-compaction when summaries grow too large

**4b: Re-compactable summaries (hierarchical)**
- Old summaries can themselves be re-summarised
- Creates a tree of IDs: current summary → previous summary → original content
- Agent may need to traverse multiple levels to reach original detail
- Keeps active context smaller for longer
- More complex implementation and retrieval patterns

**4c: Tool-results-only lossless**
- Only tool calls and tool results get IDs and are stored externally
- General conversation (user messages, assistant reasoning) is summarised normally and not retrievable
- Simpler than full lossless — tool results are the biggest items and most likely to need re-examination
- Combines well with Strategy 3 (compress at ingestion, store original externally)

**4d: Context retrieval performed by sub-agents**
- As detailed in Voltropy paper at https://papers.voltropy.com/LCM
- Agent uses sub-agent to retrieve old context from data store. From the paper: "lcm_expand(summary_id). Expands a summary node into its constituent messages, reversing the compaction that created it. Because expansion can recover arbitrarily large volumes of earlier conversation, this tool is restricted to sub-agents spawned via the Task tool; the main agent cannot call it directly. This restriction prevents uncontrolled context growth in the primary interaction loop. When the main agent needs to inspect compacted history, it delegates the expansion to a sub-agent, which processes the expanded content in its own context window and returns only the relevant findings."
- This approach also provides a grep tool to search the full immutable message history which is available to the main agent as well as sub-agents

**Cache dynamics**: Similar to Strategy 2 for append-only variant. Each compaction appends summary text, invalidating from that point. Retrieval tool calls appear at the end of context (minimal cache impact). For the hierarchical variant, re-compaction of summaries causes deeper cache invalidation.

**Key simulation parameters**:
- Retrieval frequency (how often does the agent actually need to look back?)
- Cost of retrieval tool calls vs. cost of keeping content in context
- ID overhead in summaries (small but non-zero)
- For hierarchical variant: depth of ID tree, traversal cost

### Strategy 5: Agent-controlled discard

**Trigger**: Agent decides, using a dedicated tool.

**Mechanism**: The agent is given a tool (e.g. `discard_context`) that allows it to mark context segments as discardable, optionally providing a replacement summary. Discarded content is removed from context immediately.

**Characteristics**:
- Agent can discard context it knows is no longer relevant (e.g. passing test results, superseded tool outputs)
- No unnecessary compaction of still-relevant context
- Risk of the agent misjudging what's needed later
- Adds cognitive overhead — agent must decide what to discard, which consumes reasoning tokens
- Research (JetBrains) suggests LLM-driven summarisation causes 13-15% longer trajectories

**Cache dynamics**: Each discard modifies context, causing partial cache invalidation. Frequent small discards could cause frequent small invalidations. Batching discards would reduce this but delays the benefit.

**Key simulation parameters**:
- How often the agent would use the tool (frequency)
- Size of discarded segments
- Overhead tokens consumed by the discard decision itself
- Error rate (discarding something that was actually needed)

## Combined strategies

These strategies are not mutually exclusive. Likely production configurations would combine several:

| Combination | Description |
|---|---|
| 3 + 1 | Tool result compression at ingestion, full compaction at threshold |
| 3 + 2 | Tool result compression at ingestion, incremental compaction at intervals |
| 3 + 4c | Tool result compression at ingestion with external storage, lossless retrieval of originals |
| 3 + 2 + 1 | Tool compression, incremental compaction, with full re-compaction as backstop |
| 3 + 4a + 1 | Tool compression, append-only lossless, with full re-compaction of summaries as backstop |

The simulation should support composing strategies to evaluate combined effects.

## Aims of the simulation exercise

The simulation should answer:

### Primary questions

1. **How does each strategy (and combination) affect total conversation cost?**
   - Input token cost (accounting for cache hit rates)
   - Output token cost (agent responses)
   - Compaction cost (LLM calls for summarisation, if used)
   - Retrieval cost (for lossless strategies — additional tool call round-trips)
   - Total number of turns for task completion (sensitivity - does compression get to result earlier or later?)

2. **How does each strategy affect context size over time?**
   - Peak context size reached
   - Average context size across conversation
   - Time (in tokens generated) before hitting various thresholds (100k, 150k, 200k)

3. **What is the cache utilisation under each strategy?**
   - Percentage of input tokens that hit cache vs. cold
   - Cache invalidation frequency and magnitude
   - Net cost impact of caching (savings from hits minus cost of invalidation)

### Secondary questions

4. **How sensitive are results to conversation shape?**
   - Tool-heavy vs. conversation-heavy sessions
   - Short tool results vs. very long tool results
   - Few long tool calls vs. many short tool calls

5. **Where are the crossover points?**
   - At what conversation length does Strategy 2 become cheaper than Strategy 1?
   - At what tool result size does Strategy 3 pay for itself?
   - At what retrieval frequency does Strategy 4 become more expensive than keeping content in context?

6. **What are the optimal parameters for each strategy?**
   - Compaction interval for Strategy 2
   - Compression ratio assumptions for Strategy 3
   - Re-compaction threshold for accumulated summaries

### Non-goals

The simulation does not need to:
- Perform actual LLM summarisation or measure summary quality
- Use conversation data, either real or synthetic - it's purely assumption-based
- Model performance/accuracy degradation (this is empirical and model-specific)
- Implement any agent logic

### Modelling approach

The simulation should be assumption-driven with Monte Carlo randomisation for variable parameters:

**Example Fixed inputs (configurable)**:
- Context window size (e.g. 200k tokens)
- LLM input cost per token (cached vs. uncached)
- LLM output cost per token
- Compaction LLM input/output cost (may use a cheaper model)
- Target conversation length (total tokens generated before session ends, or total turns before session ends if that's a better metric)

**Example Randomised inputs (distributions configurable)**:
- Size of each user message
- Size of each assistant response
- Size of each tool result
- Frequency of tool calls
- For lossless strategies: frequency of retrieval requests

**Example Outputs**:
- Visual playback of individual simulation (e.g. user can set configuration, then watch how context size changes and where cost is being incurred)
- Static outputs generated by Monte Carlo simulation of variables

Exact details of approach and outputs will be agreed in planning phase.
