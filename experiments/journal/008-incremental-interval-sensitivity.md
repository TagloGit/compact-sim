# Exp 008: incrementalInterval Sensitivity — Impact on Short and Medium Sessions

**Issue:** #74  
**Date:** 2026-04-01  
**Branch:** `experiment/008-incremental-interval-sensitivity`

---

## Hypothesis

The default `incrementalInterval` (30k tokens) fires compaction twice in an 80-cycle session. Reducing the interval causes more compactions (more overhead) but smaller peak context. Increasing it delays compaction, allowing more cache hits initially but larger context later. The optimal value depends on session length.

Expected: shorter interval preferred for long sessions (more frequent context reduction), longer interval preferred for short sessions (fewer compaction events = less overhead when context stays manageable).

## Engine Change

This experiment required adding support for `values: number[]` arrays in numeric sweep parameters. Previously, only `{min, max, steps, scale}` ranges were supported for numeric params. The engine was extended:

- `src/engine/sweep-types.ts`: Added `NumericValuesRange` interface
- `src/engine/sweep.ts`: Added handler in `expandParamValues` to detect and expand explicit values arrays

This is a general capability improvement — any numeric parameter can now use explicit discrete values in sweep configs. See commit `[engine] Add NumericValuesRange support for explicit values in numeric sweep params`.

## Method

Sweep `incrementalInterval` over [15000, 30000, 50000, 80000] × `toolCallCycles` [80, 150, 200] for `incremental` and `lcm-subagent`, calibrated baseline.

Config: `experiments/data/008/sweep-config.json`  
Results: `experiments/data/008/sweep-results.json`  
Analysis: `experiments/data/008/analyze.py`

## Results

### Full cost table (incremental vs lcm-subagent)

| cycles | interval | incremental | lcm-subagent | cheaper |
|---|---|---|---|---|
| 80 | 15,000 | $3.542 | $3.456 | lcm-subagent |
| 80 | 30,000 | $4.031 | $4.053 | incremental |
| 80 | 50,000 | $4.583 | $4.659 | incremental |
| 80 | 80,000 | $5.692 | $5.692 | tie |
| 150 | 15,000 | $7.198 | $6.602 | lcm-subagent |
| 150 | 30,000 | $8.129 | $7.786 | lcm-subagent |
| 150 | 50,000 | $9.388 | $9.301 | lcm-subagent |
| 150 | 80,000 | $11.510 | $11.649 | incremental |
| 200 | 15,000 | $10.147 | $8.837 | lcm-subagent |
| 200 | 30,000 | $11.428 | $10.491 | lcm-subagent |
| 200 | 50,000 | $13.074 | $12.582 | lcm-subagent |
| 200 | 80,000 | $15.390 | $15.300 | lcm-subagent |

### Best interval per strategy

| cycles | strategy | best interval | best cost |
|---|---|---|---|
| 80 | incremental | 15,000 | $3.542 |
| 80 | lcm-subagent | 15,000 | $3.456 |
| 150 | incremental | 15,000 | $7.198 |
| 150 | lcm-subagent | 15,000 | $6.602 |
| 200 | incremental | 15,000 | $10.147 |
| 200 | lcm-subagent | 15,000 | $8.837 |

### Compaction events

| cycles | interval | compactions |
|---|---|---|
| 80 | 15,000 | 5 |
| 80 | 30,000 | 2 |
| 80 | 50,000 | 1 |
| 80 | 80,000 | 1 |
| 150 | 15,000 | 10 |
| 150 | 30,000 | 5 |
| 150 | 50,000 | 3 |
| 150 | 80,000 | 2 |
| 200 | 15,000 | 14 |
| 200 | 30,000 | 7 |
| 200 | 50,000 | 4 |
| 200 | 80,000 | 2 |

Both strategies fire identical compaction counts for any given (cycles, interval) pair.

## Analysis

### The "smaller interval always wins" result — and its limitations

The model shows shorter intervals are always cheaper: 15k beats 30k beats 50k beats 80k at every session length. The mechanism is: more frequent compaction → smaller average context size → lower per-turn input token cost. Since the model prices compaction cheaply ($0.80/M input, $4/M output), the context-reduction benefit always outweighs the compaction overhead.

**This result is a probable modelling artefact.** In practice, more frequent compaction has costs the model cannot represent:
1. **Latency**: Each compaction adds a round-trip to a smaller LLM. At 14 compactions in a 200-cycle session, this adds meaningful wall-clock time.
2. **Quality degradation**: Compacting every 15k tokens means summaries of summaries accumulate quickly. The incremental meta-compaction path (compacting accumulated summaries when they exceed `summaryAccumulationThreshold`) doesn't capture the quality loss from over-summarisation.
3. **The 15k interval fires 14 compactions at 200 cycles**: This is one compaction every ~14 cycles (~25 tool calls), which is quite aggressive.

The practical recommendation is **not** to set `incrementalInterval` to 15k without validating compaction quality. The 30k default is more defensible.

### The interesting finding: incremental wins at 80 cycles with intervals ≥ 30k

At 80 cycles with intervals of 30k and 50k, incremental is cheaper than lcm-subagent. This is consistent with the Exp 007 crossover finding: below ~89 cycles, lcm-subagent's retrieval overhead tips the balance. At interval=15k with 80 cycles, the additional compactions change the picture (5 compactions vs 2), giving lcm-subagent enough context-reduction benefit to win.

### The 80k tie

At 80k interval, both strategies produce essentially the same cost for any session length. With only 1–2 compactions regardless of length, the strategies converge to near-identical behaviour.

### Crossover in the interval dimension

At 150 cycles, lcm-subagent wins at intervals ≤ 50k but loses at 80k. The longer the interval, the less context compression occurs — and lcm-subagent's retrieval overhead dominates when compaction is infrequent. This is a second dimension of the crossover: beyond a session length threshold *and* below an interval threshold, lcm-subagent wins.

## Conclusions

1. **The model always prefers shorter intervals** — an artefact of cheap compaction cost with no quality penalty. Do not interpret this as a recommendation to set `incrementalInterval` to 15k in production.
2. **30k (the default) is a reasonable practical choice**: well-understood behaviour, 2–7 compactions across typical session lengths, avoids quality-degradation risks.
3. **lcm-subagent remains the preferred strategy** at standard interval settings for sessions ≥ 100 cycles. The result confirms Exp 007.
4. **Both strategies converge at large intervals (80k)** — with only 1–2 compactions, the strategies are nearly equivalent.
5. **Engine change**: Added `NumericValuesRange` to support explicit `values` arrays for numeric sweep parameters — a general capability improvement now available for all future sweeps.

## Modelling Gap Identified

The simulation cannot capture latency-vs-cost trade-offs for compaction frequency. A future engine enhancement could add a `compactionLatencyMs` parameter and a `totalLatency` metric, allowing the researcher to evaluate cost-latency Pareto frontiers.

## Next Questions

- How does the crossover shape (both session length and interval dimensions) change with different `toolResultSize` values?
- Phase 2: explore `pRetrieveMax` sensitivity — how sensitive is lcm-subagent's advantage to retrieval success rate?
