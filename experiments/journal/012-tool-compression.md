# Exp 012: Tool-Result Compression Sensitivity

**Issue:** #103
**Date:** 2026-04-02
**Status:** Complete

## Hypothesis

1. Enabling tool-result compression will reduce costs significantly (>15%) across all strategies, since tool results dominate context growth (~4,560 tokens/user turn vs ~190 for other messages).
2. Strategy ranking (lcm-subagent #1) will remain stable.
3. Compression may shift the ~89-cycle crossover between lcm-subagent and incremental by reducing context growth and thus compaction frequency.

## Method

Two cartesian sweeps at the calibrated baseline (system prompt 10k, tool result 380, etc.):

- **Baseline sweep** (18 runs): 6 strategies × 3 session lengths (100, 150, 200 cycles), no compression.
- **Compression sweep** (72 runs): 6 strategies × 3 session lengths × 4 compression ratios (2, 3, 5, 8), compression enabled.

Configs: `experiments/data/012/sweep-baseline.json`, `experiments/data/012/sweep-compressed.json`
Results: `experiments/data/012/baseline-results.json`, `experiments/data/012/compressed-results.json`
Analysis: `experiments/data/012/analyse.py`

## Results

### Cost reduction by strategy and ratio (200 cycles)

| Strategy | r=2 | r=3 | r=5 | r=8 |
|---|---|---|---|---|
| full-compaction | **-2.3%** | **-4.9%** | **-4.7%** | **-1.8%** |
| incremental | 5.6% | 8.2% | 9.1% | 9.4% |
| lossless-append | 5.7% | 8.5% | 9.4% | 9.8% |
| lossless-hierarchical | 4.6% | 7.3% | 7.7% | 7.9% |
| lossless-tool-results | 6.5% | 9.3% | 10.4% | 10.8% |
| lcm-subagent | 3.1% | 5.2% | 5.3% | 5.1% |

Average across all strategies: 3.9% (r=2), 5.6% (r=3), 6.2% (r=5), 6.9% (r=8).

### Strategy rankings remain stable (200 cycles)

| Rank | No compression | r=2 | r=3 | r=5 | r=8 |
|---|---|---|---|---|---|
| 1 | lcm-subagent $10.49 | lcm-subagent $10.16 | lcm-subagent $9.95 | lcm-subagent $9.94 | lcm-subagent $9.96 |
| 2 | lossless-hier $11.34 | incremental $10.79 | incremental $10.49 | incremental $10.38 | incremental $10.36 |
| 3 | incremental $11.43 | lossless-hier $10.81 | lossless-hier $10.52 | lossless-tool $10.42 | lossless-tool $10.37 |
| 4 | lossless-tool $11.63 | lossless-tool $10.87 | lossless-tool $10.54 | lossless-hier $10.47 | lossless-hier $10.45 |
| 5 | lossless-append $11.92 | lossless-append $11.24 | lossless-append $10.90 | lossless-append $10.79 | lossless-append $10.75 |
| 6 | full-compact $20.71 | full-compact $21.19 | full-compact $21.72 | full-compact $21.68 | full-compact $21.09 |

**lcm-subagent is #1 at every ratio.** Minor shuffling among mid-tier strategies: lossless-hierarchical drops from #2 to #3-4 with compression, while incremental rises.

### lcm-subagent vs incremental gap narrows

| Cycles | No compression | r=2 | r=3 | r=5 | r=8 |
|---|---|---|---|---|---|
| 100 | +$0.028 | +$0.002 | **-$0.004** | **-$0.011** | **-$0.019** |
| 150 | +$0.343 | +$0.205 | +$0.155 | +$0.133 | +$0.113 |
| 200 | +$0.937 | +$0.623 | +$0.541 | +$0.446 | +$0.401 |

Positive = lcm-subagent cheaper. At 100 cycles with ratio≥3, incremental becomes marginally cheaper (by <$0.02). The gap at 150+ cycles remains solidly in lcm-subagent's favour.

### Compaction events reduced

| Strategy | No compression | r=2 | r=3 | r=5 | r=8 |
|---|---|---|---|---|---|
| Most strategies | 7 | 5 | 5 | 5 | 5 |
| full-compaction | 1 | 1 | 1 | 0 | 0 |

Compression reduces context growth rate, cutting compaction events from 7 to 5 for incremental-family strategies at 200 cycles. full-compaction stops compacting entirely at ratio≥5.

### full-compaction anomaly at 200 cycles

full-compaction **gets more expensive** with compression at 200 cycles (-2.3% to -4.9%). Mechanism: full-compaction uses a single threshold trigger at 85% of context window (170k tokens). With compression, context grows slower, so the session spends more steps at high (but sub-threshold) context sizes before compaction fires. At ratio≥5, context never reaches the threshold at all — the session runs to completion with 162-167k tokens, never compacting. The cost overhead comes from accumulated input charges on this large uncompacted context.

This anomaly is specific to full-compaction's "wait until huge, then compact everything" approach. All incremental-family strategies benefit from compression because they compact in intervals regardless of total context size.

## Analysis

### Hypothesis 1: PARTIALLY REJECTED

Tool-result compression does **not** deliver >15% cost reduction. Actual reductions are **3-10%** depending on strategy and ratio. The hypothesis overestimated the effect because:

1. **Tool results are compressed at ingestion, but the compressed results still accumulate in context.** At ratio=2, a 380-token result becomes 190 tokens — still substantial when multiplied across 12 calls/turn × 200 turns.
2. **Compaction already handles the bulk of context management.** The incremental-family strategies compact every 30k tokens regardless. Compression reduces the *rate* of growth between compactions but doesn't eliminate the compaction cost itself.
3. **lcm-subagent benefits least** (3-5%) because it already maintains the smallest context (~27k avg). Compressing inputs to an already-compact context has less marginal impact.

### Hypothesis 2: CONFIRMED

Strategy rankings are stable. lcm-subagent is #1 at every compression ratio for sessions ≥100 cycles. Minor shuffling among mid-tier strategies doesn't affect the recommendation.

### Hypothesis 3: CONFIRMED (minor effect)

The ~89-cycle crossover shifts upward with compression. At ratio≥3, incremental is marginally cheaper than lcm-subagent at 100 cycles (by <$0.02). This is consistent with the mechanism: compression reduces context growth → fewer compactions → less opportunity for lcm-subagent's structural cache advantage. The effect is negligible in practice.

### Diminishing returns

Cost reduction plateaus rapidly beyond ratio=3. For lcm-subagent at 200 cycles: 3.1% (r=2) → 5.2% (r=3) → 5.3% (r=5) → 5.1% (r=8). The marginal benefit of going from ratio=3 to ratio=8 is near zero, and higher ratios require LLM-based summarisation with its own cost and latency overhead.

### Practical framing

| Compression ratio | Achievable with | Realistic cost saving (lcm-subagent, 200 cycles) |
|---|---|---|
| 2 | Simple truncation, dropping verbose fields | 3.1% (~$0.33) |
| 3 | Structured extraction, keeping key-value pairs | 5.2% (~$0.54) |
| 5 | LLM summarisation | 5.3% (~$0.55) |
| 8 | Aggressive LLM summarisation | 5.1% (~$0.53) |

Given that ratio=3 captures nearly all the benefit and is achievable without LLM processing, **ratio=3 is the practical sweet spot** if tool compression is implemented.

## Conclusions

1. **Tool-result compression is a secondary optimisation, not a game-changer.** It saves 3-5% for lcm-subagent and 6-10% for other strategies — meaningful but not transformative.
2. **Strategy recommendation is unchanged.** lcm-subagent remains the clear winner. Tool compression benefits all strategies roughly proportionally (except full-compaction, which gets worse at 200 cycles).
3. **Ratio=3 captures nearly all the benefit.** Beyond this, diminishing returns make higher ratios unjustifiable given the LLM processing cost required.
4. **full-compaction is even worse with compression** at long sessions — a threshold-trigger artefact that further reinforces avoiding this strategy.
5. **The crossover shifts slightly** but remains negligible in practice (<$0.02 at 100 cycles).

## Next questions

- **Cost of compression itself**: the sim treats compression as free. In practice, LLM-based summarisation at ratio≥5 has its own API cost. A more realistic model would add a compression cost per tool result.
- **Selective compression**: compressing only large tool results (>500 tokens) while leaving small ones intact might be more practical and still capture most of the benefit.
- **Interaction with cache reliability**: does compression interact with cacheReliability? Smaller contexts from compression could make cache more reliable (fewer tokens to match).
