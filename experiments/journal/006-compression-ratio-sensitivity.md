# Exp 006: Compression Ratio Sensitivity

**Issue:** #71  
**Date:** 2026-04-01  
**Branch:** `experiment/006-compression-ratio-sensitivity`

---

## Hypothesis

The compression ratio (tokens-in / tokens-out for a compaction) significantly affects total cost for strategies with frequent compaction. Higher compression = smaller post-compaction context = lower cached-input per turn. However, diminishing returns are expected at very high ratios (more compaction overhead, retrieval misses). Optimal ratio hypothesised at 8–15×.

## Method

Sweep `compressionRatio` over [3, 5, 10, 15, 20] for `incremental` and `lcm-subagent` only (the two cheapest strategies), holding all other parameters at the calibrated baseline (Exp 003):

- `toolCallCycles`: 200
- `toolCallSize`: 75, `toolResultSize`: 380, `assistantMessageSize`: 130
- `userMessageFrequency`: 12, `userMessageSize`: 60
- `systemPromptSize`: 10,000
- `incrementalInterval`: 30,000

Config: `experiments/data/006/sweep-config.json`  
Results: `experiments/data/006/sweep-results.json`  
Analysis: `experiments/data/006/analyze.py`

## Results

| compressionRatio | incremental | lcm-subagent | difference | lcm_advantage% |
|---|---|---|---|---|
| 3 | $14.30 | $13.04 | $1.26 | 8.83% |
| 5 | $13.50 | $11.44 | **$2.06** | **15.23%** |
| 10 (baseline) | $11.43 | $10.49 | $0.94 | 8.20% |
| 15 | $10.74 | $10.21 | $0.52 | 4.88% |
| 20 | $10.39 | $10.08 | $0.31 | 3.00% |

Compaction events: **7 for both strategies at every ratio** — the ratio does not affect compaction frequency, only context size after each compaction.

Both strategies are minimised at ratio=20 (the highest tested), and cost continues to decrease monotonically with increasing ratio. No optimum was found within the tested range.

## Analysis

### Non-monotonic lcm-subagent advantage

The lcm-subagent advantage over incremental peaks at ratio=5 (15.23%) rather than at extreme ratios. At ratio=3, context post-compaction is still large (1/3 of original), so both strategies are expensive — but lcm-subagent's full-replacement approach discards more context than incremental's partial compaction, closing the gap. At ratio=10+, both strategies effectively shrink context enough that incremental catches up. The ratio=5 sweet spot may reflect the specific interaction between incremental's partial-compaction logic and lcm-subagent's full-replacement behaviour.

### Monotonic improvement with higher compression — a modelling limitation

Both strategies improve monotonically with higher compression. This is expected in the model because `compressionRatio` simply multiplies the context reduction without any countervailing cost:
- No penalty for information loss from over-compression
- No increase in retrieval probability or retrieval cost at higher compression
- No change in compaction frequency (the threshold is met by accumulation, not ratio)

In practice, higher compression ratios would imply:
- More information loss → higher retrieval failure rate → strategy degrades in quality
- The summary model being used needs to achieve the target ratio — not always possible for dense technical content

The model cannot evaluate quality-adjusted cost. The result "higher ratio always better" is a **direct artefact of this missing penalty**. The practical question — what compression ratio is achievable for the Models Agent's financial modelling content — is outside the model's scope.

### What compression ratio can actually achieve

Financial modelling content (structured schemas, formula results, model outputs) is moderately compressible. Very high compression (15–20×) on tool results would likely lose precision. A realistic target for a haiku/sonnet compaction model is probably 5–10×. The Exp 003 default of 10× was a reasonable choice.

## Conclusions

1. **lcm-subagent dominates at all compression ratios** — the ranking is stable.
2. **The lcm-subagent advantage is largest at intermediate compression (ratio=5)**, not at extremes.
3. **Higher compression always appears cheaper in the model, but this is an artefact** — the model doesn't penalise information loss. The default ratio=10 is a defensible practical choice.
4. **Compression ratio does not affect compaction frequency** — both strategies fire 7 compactions regardless of ratio at 200 cycles.

## Next Questions

- The model can't capture quality-adjusted cost. Is there a way to model retrieval success degradation as a function of compression ratio? (Would require adding a `pRetrieveMax` dependency on `compressionRatio`.)
- Confirmed: the crossover question (Exp 007) and interval sensitivity (Exp 008) are the higher-value next experiments.
