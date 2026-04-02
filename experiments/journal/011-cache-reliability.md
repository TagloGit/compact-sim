# Experiment 011 — Cache Reliability Sensitivity

**Issue:** #98
**Date:** 2026-04-02
**Status:** Complete

## Hypothesis

Degrading cache reliability will **widen** lcm-subagent's advantage over large-context strategies. A cache miss at 170k tokens costs ~6x more than a miss at 27k tokens, so strategies with smaller context should be more robust to cache failures. However, frequent-compaction strategies may suffer disproportionately from post-invalidation misses.

**Null hypothesis:** Strategy rankings are unchanged at all realistic cacheReliability values (>=0.7).

## Method

Two sweeps using the calibrated baseline:

1. **Main sweep** (108 configs): 6 strategies x 6 cacheReliability values [1.0, 0.95, 0.9, 0.8, 0.7, 0.5] x 3 session lengths [100, 150, 200 cycles]
2. **Crossover sweep** (56 configs): 2 strategies (incremental, lcm-subagent) x 4 reliability values [1.0, 0.9, 0.8, 0.7] x 7 session lengths [60–120 cycles]

Config files: `experiments/data/011/sweep-config.json`, `experiments/data/011/crossover-sweep.json`

## Results

### Strategy rankings are stable

**lcm-subagent is cheapest at every (reliability, cycles) combination tested.** The null hypothesis is rejected — rankings do change slightly among mid-tier strategies — but the top recommendation (lcm-subagent) and bottom recommendation (avoid full-compaction) are completely robust.

Notable ranking shifts among mid-tier strategies:
- **lossless-hierarchical rises to #2** at rel<=0.9 (was #2–4 depending on cycles at rel=1.0). Its full-replacement compaction produces smaller, more cache-stable contexts.
- **incremental drops** at low reliability — its larger post-compaction context means cache misses are more expensive per step.

### Absolute cost impact is dramatic

| Strategy | Cost increase at rel=0.9 | Cost increase at rel=0.7 | Cost increase at rel=0.5 |
|---|---|---|---|
| full-compaction | +48–57% | +180–194% | +315–349% |
| incremental | +31–39% | +118–149% | +226–270% |
| lossless-hierarchical | +26–39% | +86–105% | +207–217% |
| lcm-subagent | +28–41% | +90–112% | +216–234% |

At rel=0.5 (every other cache check fails), costs increase 2–4.5x across all strategies. full-compaction is most sensitive (+315–349%), lossless-hierarchical and lcm-subagent are least sensitive (+203–234%).

### lcm-subagent advantage widens with unreliable caching

| cycles | lcm advantage at rel=1.0 | lcm advantage at rel=0.9 | lcm advantage at rel=0.7 |
|---|---|---|---|
| 100 | +0.5% | +2.9% | +13.1% |
| 150 | +4.2% | +8.9% | +16.1% |
| 200 | +8.2% | +7.2% | +21.7% |

At rel=1.0 and 100 cycles, lcm barely wins (0.5%). At rel=0.7 and 100 cycles, lcm wins by 13.1%. **Unreliable caching transforms a marginal advantage into a clear one.**

### Crossover shifts dramatically

| cacheReliability | Crossover point (lcm vs incremental) |
|---|---|
| 1.0 | ~89 cycles (between 80–90) |
| 0.9 | <60 cycles (lcm wins at all tested lengths) |
| 0.8 | <60 cycles |
| 0.7 | <60 cycles |

At rel<=0.9, there is **no crossover in the practical range** — lcm-subagent wins unconditionally from 60 cycles upward. The original ~89-cycle crossover was an artefact of perfect caching.

### full-compaction becomes catastrophic

| cycles | full-compact / lcm ratio at rel=1.0 | ratio at rel=0.7 | ratio at rel=0.5 |
|---|---|---|---|
| 100 | 1.69x | 2.49x | 2.23x |
| 150 | 2.16x | 3.08x | 3.07x |
| 200 | 1.97x | 2.73x | 2.65x |

At rel=0.7, full-compaction costs **3x** lcm-subagent for 150-cycle sessions ($49.13 vs $15.93). The large-context penalty compounds with cache unreliability.

### Cache hit rates

Cache hit rates degrade linearly with reliability parameter, as expected. At rel=0.5, all strategies converge to ~47–51% hit rates regardless of context management approach. The differentiation is in what a cache miss *costs* — and that's where context size matters.

## Analysis

### Why lcm-subagent's advantage widens

The mechanism is straightforward: **a cache miss at a larger context costs proportionally more.** At rel=1.0, all strategies get high cache hit rates (96–99%), so the cost penalty per miss is rare. As reliability drops, misses become common, and the cost per miss is proportional to context size. lcm-subagent maintains ~27k average context vs incremental's ~43k and full-compaction's ~80–170k.

### Why lossless-hierarchical rises

lossless-hierarchical uses full-replacement compaction (like lcm-subagent) rather than incremental compaction. This produces a smaller, more stable post-compaction context. The difference is invisible at rel=1.0 (where cache hits are guaranteed) but becomes meaningful at lower reliability.

### Practical implications

Real-world API caching is known to be erratic — sporadic misses, warm-up delays, and partial hits are common. A cacheReliability of 0.8–0.9 is likely more realistic than 1.0 for production workloads. At these values:

1. **lcm-subagent's advantage is stronger than previously estimated** — 7–17% vs 0.5–8.2% at perfect caching
2. **The crossover disappears** — no need to consider incremental for short sessions
3. **Absolute costs are 30–100% higher** than perfect-cache estimates — cost projections from earlier experiments are optimistic

## Conclusions

1. **Strategy rankings are robust to cache reliability.** lcm-subagent remains cheapest at all tested conditions. No recommendation change needed.
2. **lcm-subagent's advantage is larger than previously thought.** Under realistic caching (rel=0.8–0.9), the advantage over incremental grows from 0.5–8.2% to 3–17%.
3. **The ~89-cycle crossover is a perfect-cache artefact.** At rel<=0.9, lcm-subagent wins at all session lengths from 60 cycles upward.
4. **full-compaction is catastrophically bad with unreliable caching.** 2.5–3x more expensive than lcm-subagent at rel=0.7.
5. **Absolute cost estimates from prior experiments are optimistic.** Under realistic caching, costs are 30–100% higher. Prior strategy *rankings* remain valid; prior *absolute costs* should be treated as lower bounds.

## Next questions

- What is a realistic value for cacheReliability in practice? Measuring actual API cache hit rates would ground these findings.
- Does cache reliability interact with incrementalInterval? At shorter intervals, more compaction events create more cache invalidation — but each invalidation affects a smaller context.
- The cost increase at rel=0.5 seems extreme (2–4.5x). Is there a threshold below which cache reliability makes compaction strategies counterproductive vs simply not compacting?
