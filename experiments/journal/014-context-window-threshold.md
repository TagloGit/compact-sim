# Experiment 014: contextWindow × compactionThreshold Sensitivity

**Issue:** #121
**Date:** 2026-04-03
**Phase:** 4 (Optimal configuration for lcm-subagent deployment)

## Hypothesis

Smaller context windows will reduce lcm-subagent cost by keeping average context smaller (reducing the dominant cached-input cost component). Below some threshold, increased compaction frequency will erode cache stability, creating a cost minimum at ~100–128k rather than the default 200k.

## Method

Five sweeps were run, all using calibrated Models Agent parameters:

**Sweep 1a** — contextWindow [64k, 100k, 128k, 200k, 500k] × toolCallCycles [100, 150, 200], lcm-subagent only.

**Sweep 1b** — contextWindow [30k, 35k, 40k, 45k, 50k, 64k] × toolCallCycles [100, 150, 200], lcm-subagent only. Follow-up after Sweep 1a showed no variation — needed smaller windows.

**Sweep 2a** — compactionThreshold [0.70–0.95] × toolCallCycles [100, 150, 200] at 200k window, lcm-subagent.

**Sweep 2b** — compactionThreshold [0.50–0.95] × toolCallCycles [100, 150, 200] at 40k window, lcm-subagent.

**Sweep 3** — All 6 strategies × contextWindow [64k, 128k, 200k] × toolCallCycles [100, 150, 200].

Configs and raw output: `experiments/data/014/`.

## Results

### Sweep 1: contextWindow sensitivity (lcm-subagent)

| contextWindow | 100 cycles | 150 cycles | 200 cycles | Peak Context | Compactions (200c) |
|---|---|---|---|---|---|
| 30,000 | $4.29 | $6.50 | $8.69 | 25,440 | 15 |
| 35,000 | $4.51 | $6.88 | $9.19 | 29,650 | 12 |
| 40,000 | $4.73 | $7.17 | $9.62 | 33,990 | 9 |
| 45,000 | $4.98 | $7.49 | $10.03 | 38,044 | 8 |
| 50,000 | $5.09 | $7.74 | $10.40 | 42,426 | 7 |
| **≥64,000** | **$5.09** | **$7.79** | **$10.49** | **43,352** | **7** |

**All windows ≥64k produce identical results.** lcm-subagent's peak context (43,352) never reaches the compaction threshold at 64k (64k × 0.85 = 54,400). The incrementalInterval (30k) is the sole compaction driver.

Below ~50k, the window threshold fires before incrementalInterval, forcing more frequent compaction:
- 30k window: 17% cheaper ($8.69 vs $10.49 at 200 cycles), but 15 compactions (vs 7)
- This is the same **modelling artefact** identified in Exp 008: the model has no quality/latency penalty for compaction, so more compaction is always cheaper

### Sweep 2: compactionThreshold sensitivity

**At 200k window:** Completely flat. All thresholds [0.70–0.95] produce identical costs. Context never approaches the threshold.

**At 40k window:** Threshold has a clear effect:

| Threshold | 100c Cost | 200c Cost | Peak Context | Compactions (200c) |
|---|---|---|---|---|
| 0.50 | $4.01 | $8.12 | 19,955 | 23 |
| 0.70 | $4.40 | $8.95 | 27,711 | 13 |
| 0.85 | $4.73 | $9.62 | 33,990 | 9 |
| 0.95 | $4.96 | $10.00 | 37,988 | 8 |

Lower thresholds = more compaction = cheaper, with 23% cost spread across the range. Same modelling artefact applies: the model always prefers more compaction.

### Sweep 3: Cross-strategy contextWindow sensitivity (key finding)

**200 cycles:**

| Strategy | 64k | 128k | 200k | Window-sensitive? |
|---|---|---|---|---|
| **lcm-subagent** | **$10.49** | **$10.49** | **$10.49** | No |
| lossless-hierarchical | $11.34 | $11.34 | $11.34 | No |
| full-compaction | **$11.31** | $16.26 | $20.71 | **YES — 45% swing** |
| incremental | $11.36 | $11.43 | $11.43 | Marginal |
| lossless-tool-results | $11.56 | $11.63 | $11.63 | Marginal |
| lossless-append | $11.85 | $11.92 | $11.92 | Marginal |

**Full-compaction is massively window-sensitive.** At 64k, it compacts 5× instead of once, reducing cost from $20.71 to $11.31 (−45%). At 64k, full-compaction ($11.31) is comparable to incremental ($11.36) — the penalty nearly disappears.

**lcm-subagent and lossless-hierarchical are completely window-insensitive** — both use full-replacement compaction driven by incrementalInterval, keeping peak context at 43,352 regardless of window.

**Rankings at 64k/200 cycles:** All strategies converge to $10.49–$11.85 (13% spread vs 97% spread at 200k). lcm-subagent is still #1 at every window.

**150 cycles:**

| Strategy | 64k | 128k | 200k |
|---|---|---|---|
| **lcm-subagent** | **$7.79** | **$7.79** | **$7.79** |
| incremental | $8.13 | $8.13 | $8.13 |
| lossless-tool-results | $8.23 | $8.23 | $8.23 |
| lossless-hierarchical | $8.26 | $8.26 | $8.26 |
| lossless-append | $8.47 | $8.47 | $8.47 |
| full-compaction | **$8.52** | **$11.91** | **$16.83** |

At 150 cycles, full-compaction's penalty shrinks from 116% (200k) to 9% (64k).

## Analysis

### Why contextWindow doesn't matter for lcm-subagent

lcm-subagent uses full-replacement compaction triggered by incrementalInterval (30k new tokens). At the calibrated baseline, context grows at ~455 tokens/cycle (75 tool call + 380 tool result). After compaction, it resets to system prompt (10k) + summary (~3.3k) ≈ 13.3k. It takes ~37 cycles to accumulate 30k new tokens, at which point context is ~43k — well below any window threshold ≥54k.

The contextWindow parameter is irrelevant for lcm-subagent. The incrementalInterval is the binding constraint.

### Why full-compaction is window-sensitive

Full-compaction has no incrementalInterval. It only compacts when context hits `contextWindow × compactionThreshold`. At 200k/0.85 (threshold 170k), context must grow to 170k before compacting — which takes ~350 cycles. In a 200-cycle session, it fires at most once, running most steps at high context (average ~80k).

At 64k/0.85 (threshold 54.4k), compaction fires every ~97 cycles, keeping average context much smaller. This eliminates full-compaction's primary weakness.

### Modelling artefact warning

The model shows that smaller windows and lower thresholds are always cheaper for lcm-subagent. This is the same artefact identified in Exp 008: the simulation has no quality penalty for compaction. In practice:
- 15 compactions per 200-cycle session (30k window) means compacting every ~13 cycles — aggressive enough to risk severe information loss
- 23 compactions (40k/0.50 threshold) is unrealistic for quality conversation maintenance
- The "cheaper at small windows" finding is a modelling artefact, not a deployment recommendation

### Real deployment insight

For lcm-subagent, **contextWindow doesn't matter** at any value ≥ 50k. Set it to whatever the API supports (typically 128k or 200k). The incrementalInterval is the only knob that matters.

For full-compaction, contextWindow matters enormously — but this doesn't change the recommendation since lcm-subagent is still cheaper at every window.

## Conclusions

1. **Hypothesis rejected.** contextWindow has zero effect on lcm-subagent cost at ≥50k (not the expected convex minimum). The incrementalInterval (30k) is the sole compaction driver, keeping peak context at 43k — far below any practical window threshold.

2. **compactionThreshold is similarly irrelevant** for lcm-subagent at standard windows. At 200k window, the entire 0.70–0.95 range produces identical results.

3. **Full-compaction's poor performance is partly a window artefact.** At 64k, its cost drops 45% and approaches parity with incremental strategies. But lcm-subagent still wins at every window size.

4. **Strategy rankings are stable** across all contextWindow values. lcm-subagent is #1 at 64k, 128k, and 200k.

5. **Implementation recommendation: contextWindow and compactionThreshold are non-decisions** for Models Agent deployment with lcm-subagent. Use whatever the API provides (128k or 200k). The strategy's compaction is driven entirely by incrementalInterval, which was already validated at 30k (Exp 008).

## Next questions

- Does the window insensitivity hold under logarithmic summary growth? (probably yes, since Exp 013 showed peak context only rises ~3% under logarithmic growth)
- At what incrementalInterval does the window threshold start to matter for lcm-subagent? (would need interval > ~43k, above the recommended 30k)
- Would a "hybrid trigger" — compact at min(incrementalInterval, windowThreshold) — be worth modelling? (probably not, given both are already redundant)
