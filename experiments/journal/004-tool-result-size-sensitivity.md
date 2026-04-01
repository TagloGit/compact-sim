# Experiment 004: Tool Result Size Sensitivity

**Issue:** #69  
**Date:** 2026-04-01  
**Status:** Complete

---

## Hypothesis

Real Models Agent tool results range 5–6,804 tokens (mean 380). Larger tool results may change the cost ranking by shifting the balance between context-size savings (hierarchical/lcm) and retrieval overhead. Specifically:
- At low tool result sizes: lcm-subagent likely wins (retrieval overhead dominates lossless-hierarchical)
- At high tool result sizes: lossless strategies may benefit more from external store
- Crossover point between lcm-subagent and incremental/lossless variants expected

## Method

Parameter sweep: `toolResultSize` ∈ {100, 266, 707, 1880, 5000} (log scale, 5 steps), all 6 strategies, other parameters fixed at calibrated baseline (Exp 003):
- 200 cycles, toolCallSize=75, assistantMessageSize=130, systemPromptSize=10,000
- Default pricing, compressionRatio=10, compactionThreshold=0.85

Config: `experiments/data/004/sweep-config.json`  
Results: `experiments/data/004/sweep-results.json` (30 runs: 6 strategies × 5 sizes)

## Results

### toolResultSize values generated (log-scale)

100, 266, 707, 1880, 5000 tokens

### Cost table (USD, 200 cycles)

| toolResultSize | lcm-subagent | lossless-hier | incremental | lossless-tool | lossless-app | full-compact |
|---|---|---|---|---|---|---|
| 100 | **$9.95** | $10.50 | $10.43 | $10.48 | $10.84 | $22.08 |
| 266 | **$10.25** | $11.02 | $10.99 | $11.15 | $11.45 | $20.77 |
| 380 (Exp 003) | **$10.49** | $11.34 | $11.43 | $11.63 | $11.92 | $20.71 |
| 707 | **$11.10** | $12.50 | $12.57 | $12.94 | $13.17 | $22.70 |
| 1880 | **$12.81** | $15.45 | $16.49 | $17.12 | $17.15 | $24.86 |
| 5000 | **$16.99** | $22.71 | $20.41 | $21.11 | $21.12 | $30.35 |

### Crossover findings

All crossovers involve `lossless-hierarchical`:

- **At size 100–266:** `incremental` and `lossless-tool-results` are cheaper than `lossless-hierarchical`
- **At size 707–1880:** `lossless-hierarchical` is cheaper than `incremental`, `lossless-tool-results`, and `lossless-append`
- **At size 5000:** `lossless-hierarchical` becomes the most expensive of the lossless strategies — surpassing even `lossless-append`

`lossless-hierarchical` shows a **U-shaped cost profile** relative to other lossless strategies: competitive at mid-range (380–1880 tokens) but underperforms at both extremes.

## Analysis

### lcm-subagent dominance is robust

`lcm-subagent` remains cheapest at every tested tool result size. Its cost advantage grows with tool result size: 5% at 100 tokens, 8% at 380 tokens (calibrated), 17% at 5000 tokens. The widening gap is driven by `lcm-subagent`'s efficient dual-retrieval model (grep + expand), which scales better than the hierarchical retrieval overhead.

### lossless-hierarchical's non-monotonic behaviour

The hierarchical strategy's retrieval cost model becomes expensive at two extremes:
- **Small tool results (100 tokens):** The per-retrieval overhead is disproportionate to the value of stored content.
- **Large tool results (5000 tokens):** The hierarchical store accumulates many large entries, and the cost of maintaining/querying multiple levels grows faster than for flat append or incremental strategies.

At the calibrated mean (380 tokens), it sits in its sweet spot — hence the Exp 003 finding that it was the second-cheapest.

### full-compaction cost structure

`full-compaction` cost grows roughly linearly with `toolResultSize` because larger tool results mean a larger context that's re-read every turn without compaction. From $20.77 at 266 tokens to $30.35 at 5000 tokens (+46%). Still consistently the most expensive.

### Practical implications for Models Agent

The real tool result distribution has mean=380 (mid-range sweet spot) but heavy right tail to 6,804 tokens. For sessions with predominantly large tool results (>1,000 tokens), `lcm-subagent`'s advantage grows substantially. For sessions with tiny tool results (<300 tokens), the strategy gap narrows but `lcm-subagent` still leads.

## Conclusions

1. **`lcm-subagent` is robustly cheapest across all realistic tool result sizes** (100–5,000 tokens).
2. **`lossless-hierarchical`** is competitive only in the 380–1,880 token range; it underperforms at both small and very large tool results.
3. **The Exp 003 strategy ranking** (lcm-subagent < lossless-hier < incremental < lossless-tool < lossless-app < full-compact) is only valid near the 380-token calibrated mean. The ranking among lossless strategies shifts at extremes.
4. **For Models Agent's heavy-tail tool results** (sessions with results up to 6,804 tokens), the real average cost premium for `lcm-subagent` is likely larger than the 8% computed at mean=380.

## Next questions

- **Compression ratio sensitivity (Exp 006):** Does `compressionRatio` matter for `lcm-subagent`? Given its dominance grows with tool result size, optimising compression could further widen the gap.
- **Threshold sensitivity (Exp 007):** At what `compactionThreshold` does the number of compaction events change, and how does this interact with tool result size?
- **Mixed tool result sizes:** The simulation uses a single fixed `toolResultSize`. Real sessions mix tiny and large results. How should a practitioner parameterise this?
