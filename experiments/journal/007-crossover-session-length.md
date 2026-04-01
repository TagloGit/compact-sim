# Exp 007: lcm-subagent vs Incremental — Crossover Session Length

**Issue:** #73  
**Date:** 2026-04-01  
**Branch:** `experiment/007-crossover-session-length`

---

## Hypothesis

Exp 005 showed incremental is slightly cheaper at 80 cycles ($4.031 vs $4.053). Exp 003 showed lcm-subagent is cheaper at 200 cycles ($10.49 vs $11.43). There is a crossover between 80 and 200 cycles. The crossover is where the retrieval overhead of lcm-subagent is first outweighed by its more aggressive context reduction.

## Method

Sweep `toolCallCycles` over [80, 100, 120, 140, 160, 180, 200] for `incremental` and `lcm-subagent` only, all other parameters at calibrated baseline:

- `toolCallSize`: 75, `toolResultSize`: 380, `assistantMessageSize`: 130
- `userMessageFrequency`: 12, `userMessageSize`: 60
- `systemPromptSize`: 10,000
- `compressionRatio`: 10, `incrementalInterval`: 30,000

Config: `experiments/data/007/sweep-config.json`  
Results: `experiments/data/007/sweep-results.json`  
Analysis: `experiments/data/007/analyze.py`

## Results

| toolCallCycles | incremental | lcm-subagent | cheaper | difference |
|---|---|---|---|---|
| 80 | $4.031 | $4.053 | incremental | $0.022 |
| 100 | $5.120 | **$5.092** | lcm-subagent | $0.028 |
| 120 | $6.302 | **$6.173** | lcm-subagent | $0.129 |
| 140 | $7.602 | **$7.348** | lcm-subagent | $0.253 |
| 160 | $8.766 | **$8.347** | lcm-subagent | $0.419 |
| 180 | $10.048 | **$9.400** | lcm-subagent | $0.648 |
| 200 | $11.428 | **$10.491** | lcm-subagent | $0.937 |

Compaction events: identical for both strategies at every cycle count (2, 3, 4, 5, 5, 6, 7 respectively).

**Crossover:** between 80 and 100 cycles. Linear interpolation estimates ~88.8 cycles.

## Analysis

### Crossover mechanism

Both strategies trigger the same number of compactions at every cycle count. The cost difference is therefore driven entirely by how each strategy handles context between compactions, not by compaction frequency:

- **lcm-subagent** does full replacement (drops everything, resyncs from external store). This maximises context reduction per compaction event but incurs retrieval overhead on every subsequent turn.
- **incremental** accumulates partial summaries between full meta-compaction events, leaving more residual context but with zero retrieval overhead.

At low cycle counts (≤80), the retrieval overhead in lcm-subagent tips the balance toward incremental. Past ~89 cycles, the context-reduction benefit dominates.

### Practical implication

The Models Agent uses sessions that typically span 50–200+ tool-call cycles based on the reference conversations. The crossover at ~89 cycles means:

- **Short sessions (< ~90 cycles):** incremental is marginally preferred, but the difference is tiny ($0.022 at 80 cycles).
- **Medium/long sessions (> ~90 cycles):** lcm-subagent wins with increasing margin — $0.94 cheaper at 200 cycles.

Given that the margin at the crossover is very small in both directions, and lcm-subagent's advantage grows rapidly with session length, **lcm-subagent is the pragmatic recommendation for all Models Agent sessions regardless of length**. The cost penalty for using lcm-subagent on a short session is negligible.

### Widening gap

The advantage is not static: the lcm-subagent/incremental cost gap grows from $0.028 at 100 cycles to $0.937 at 200 cycles — roughly $0.045 per additional 10-cycle increment in the 100–200 range. This compounding effect means that for very long sessions (300–400 cycles), lcm-subagent could be $2–4 cheaper than incremental.

## Conclusions

1. **Crossover at ~89 cycles** (between 80 and 100 in the discrete sweep).
2. **lcm-subagent's advantage is monotonically widening** with session length from the crossover onward.
3. **Practical recommendation: use lcm-subagent unconditionally** for Models Agent sessions. The penalty for short sessions ($0.022) is negligible, and the benefit for longer sessions is substantial.
4. Both strategies fire identical compaction event counts — the difference is purely in per-turn context management overhead.

## Next Questions

- How does the crossover shift with different `compressionRatio` values? At ratio=5 (where lcm-subagent advantage is highest at 200 cycles), the crossover might be even earlier.
- How does `incrementalInterval` interact with the crossover? Exp 008 addresses this.
