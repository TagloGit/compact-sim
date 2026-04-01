# Experiment 005: Short Session Regime

**Issue:** #70  
**Date:** 2026-04-01  
**Status:** Complete

---

## Hypothesis

At typical session length (80 cycles), total context ≈ 97k tokens — well below the 170k compaction threshold. No compaction fires for any strategy. All strategies behave identically (no strategy divergence). Cost is dominated by output tokens and cached-input of the growing-but-never-compacted context.

## Method

All 6 strategies at calibrated config (Exp 003) but `toolCallCycles: 80`:
- toolCallSize=75, toolResultSize=380, assistantMessageSize=130, systemPromptSize=10,000
- Default pricing, compressionRatio=10, compactionThreshold=0.85

Config: `experiments/data/005/sweep-config.json`  
Results: `experiments/data/005/sweep-results.json` (6 runs: 6 strategies × 1 config)

## Results

### Compaction events

| Strategy | Compaction events |
|---|---|
| full-compaction | 0 |
| incremental | **2** |
| lossless-append | **2** |
| lossless-hierarchical | **2** |
| lossless-tool-results | **2** |
| lcm-subagent | **2** |

### Cost, context, and cache hit rate

| Strategy | Total Cost | Peak Context | Avg Cache Hit |
|---|---|---|---|
| incremental | **$4.031** | 43,011 | ~97% |
| lossless-tool-results | $4.051 | 43,011 | ~97% |
| lcm-subagent | $4.053 | 43,011 | ~97% |
| lossless-hierarchical | $4.122 | 43,011 | ~97% |
| lossless-append | $4.151 | 43,011 | ~97% |
| full-compaction | **$6.031** | 97,220 | 98.0% |

## Analysis

### Hypothesis was partially wrong

The hypothesis predicted no compaction would fire. This was wrong for 5 of 6 strategies. The error: compaction threshold (85% of 200k = 170k tokens) was confused with the **incrementalInterval** (30k tokens). The incremental family triggers compaction when accumulated new content exceeds `incrementalInterval` (default 30,000 tokens), not when the overall context window fills. At 80 cycles × ~1,090 tokens/cycle ≈ 87,200 tokens of content — this exceeds 30,000 tokens roughly twice, hence 2 compaction events.

`full-compaction` is the exception: it only triggers on context window fullness (170k threshold), which 80 cycles does not reach.

### Cost structure at 80 cycles

The 5 compacting strategies produce peak context of ~43k tokens (compaction keeps context controlled), while `full-compaction` grows to 97,220 tokens. This creates a $2.00 cost gap (~50% premium for full-compaction). 

Within the compacting strategies, costs cluster in a tight $0.12 band:
- `incremental` is cheapest ($4.031) because it compacts but has no retrieval overhead
- `lcm-subagent` costs only $0.022 more than `incremental` — nearly free overhead for the lossless benefit
- `lossless-hierarchical` and `lossless-append` add $0.09–0.12 in retrieval costs

### lcm-subagent vs incremental at 80 cycles

At 200 cycles (Exp 003), `lcm-subagent` was $0.94 cheaper than `incremental`. At 80 cycles, `incremental` is $0.022 cheaper than `lcm-subagent`. The crossover between these two strategies occurs somewhere between 80 and 200 cycles.

This makes sense: `lcm-subagent` earns its cost advantage through better context compaction efficiency over many cycles, but this only exceeds its retrieval overhead at longer sessions.

### Practical implication

For typical 80-cycle Models Agent sessions, **all compacting strategies are essentially equivalent in cost** ($4.03–$4.15). The strategy choice at this session length is governed by implementation simplicity and lossless retrieval requirements — not cost. `full-compaction` should still be avoided even at 80 cycles ($6.03 — 50% premium).

## Conclusions

1. **Hypothesis corrected:** At 80 cycles, 5 of 6 strategies do fire compaction (2 events each) via `incrementalInterval` logic, not context window threshold. `full-compaction` is the only strategy that doesn't compact.
2. **Costs are nearly identical** for the 5 compacting strategies ($4.03–$4.15), with `incremental` cheapest by a hair.
3. **full-compaction is 50% more expensive** even at 80 cycles — a strong argument against using it regardless of session length.
4. **lcm-subagent's cost advantage over incremental reverses at short sessions** — it adds $0.022 overhead vs incremental at 80 cycles. This is negligible in absolute terms but shows the retrieval model takes longer sessions to pay off.

## Next questions

- **Crossover point between lcm-subagent and incremental:** At what session length does lcm-subagent start beating incremental? Somewhere between 80 and 200 cycles — worth pinpointing.
- **Impact of `incrementalInterval`:** The 30k default determines when compaction fires for short sessions. Is this the right setting for Models Agent?
