# Findings

Accumulated knowledge from experiment iterations. Read this at the start of every session.

---

## Calibration: Models Agent Reference Conversation Parameters

Derived from analysis of 7 real Models Agent conversation XML files (see `experiments/data/calibration.json` and `experiments/analyze_calibration.py`).

| Parameter | Value | Notes |
|---|---|---|
| `systemPromptSize` | **10,000 tokens** | Mean 10,331; range 9,425–10,848 |
| `toolCallSize` | **75 tokens** | Mean 73; range 16–1,598 |
| `toolResultSize` | **380 tokens** | Mean 380; range 5–6,804 (high variance) |
| `assistantMessageSize` | **130 tokens** | Mean 128; short narrative steps between calls |
| `userMessageFrequency` | **every 12 cycles** | Mean 11.5; range 0–56 calls per user turn |
| `userMessageSize` | **60 tokens** | Mean 56; most queries are brief |
| `reasoningOutputSize` | **500 tokens** | Default (not measurable from XML) |

**Key characteristics of Models Agent sessions:**
- Strongly tool-heavy: ~11.5 tool calls per user message
- Tool results dominate per-cycle token cost (380/1,090 = 35% of per-cycle tokens)
- System prompt is large and stable (10k tokens → prime cache hit candidate)
- Per-cycle token growth: ~1,090 tokens/cycle (tool_call 75 + tool_result 380 + assistant 130 + reasoning 500 + user amortised 5)
- Typical session: 80 tool cycles (563 total calls / 7 conversations)
- Long sessions: 200+ cycles possible (one reference session had 87 calls across only 2 user turns)

**Context growth rate:** At ~1,090 tokens/cycle, a 200k context window fills (to 85% = 170k) in ~147 cycles.  
At typical session length (80 cycles): total context = 80 × 1,090 + 10,000 ≈ **97k tokens** — just at the "100k degradation threshold".

---

## Strategy Performance: Calibrated Models Agent Config (Experiment 003)

Config: 200 cycles, toolResultSize=380, toolCallSize=75, assistantMessageSize=130, systemPromptSize=10,000.

| Strategy | Total Cost | Compactions | Avg Cache Hit | Peak Context |
|---|---|---|---|---|
| `lcm-subagent` | **$10.49** | 7 | 97.2% | 43,352 |
| `lossless-hierarchical` | $11.34 | 7 | 97.2% | 43,352 |
| `incremental` | $11.43 | 7 | 97.7% | 58,089 |
| `lossless-tool-results` | $11.63 | 7 | 97.7% | 58,089 |
| `lossless-append` | $11.92 | 7 | 97.7% | 58,089 |
| `full-compaction` | $20.71 | 1 | 98.6% | 169,895 |

**Winner: `lcm-subagent`** — cheapest by 8% over nearest competitor (`lossless-hierarchical`), 81% cheaper than `full-compaction`.

---

## Strategy Ranking Stability

The ranking **lcm-subagent < lossless-hierarchical < incremental < lossless-tool-results < lossless-append < full-compaction** has been confirmed stable across three experiments with very different parameter regimes:

| Experiment | Cycles | Tool Result Size | lcm-subagent Cost | full-compaction Cost | Premium |
|---|---|---|---|---|---|
| 001 (default) | 100 | 2,000 tokens | $6.56 | $12.61 | +92% |
| 002 (heavy) | 200 | 4,000 tokens | $21.16 | $34.05 | +61% |
| 003 (calibrated) | 200 | 380 tokens | $10.49 | $20.71 | +97% |

**Conclusion: Strategy ranking can be trusted. `full-compaction` should not be used for Models Agent sessions.**

---

## Cost Structure Analysis

From Experiment 003 (calibrated config):

**Output cost is strategy-independent:** All strategies produce identical output cost ($3.15 per 200-cycle session at default pricing). This is the irreducible floor — ~30% of total cost for efficient strategies.

**Cached input cost is the primary differentiator:**
- `full-compaction`: $16.01 (77% of total) — large growing context is expensively re-read each turn
- `lcm-subagent`: $5.35 (51% of total) — compact context after each compaction

**Retrieval costs are small but matter at scale:**
- `lossless-append`: $0.49 retrieval (4.3% premium over `incremental`)
- `lossless-tool-results`: $0.20 retrieval (1.7% premium)
- `lossless-hierarchical`: $1.20 retrieval (net -0.8% vs `incremental` due to smaller context)
- `lcm-subagent`: $0.35 retrieval — cheaper than `lossless-hierarchical` despite identical context size

**Compaction cost is negligible:** ~$0.19–0.28 per session (1.4–2.5% of total cost).

---

## Key Recommendations

1. **Use `lcm-subagent`** for Models Agent sessions requiring compaction. Consistently cheapest, smallest peak context.
2. **Use `lossless-tool-results`** if retrieval of exact tool results is required and `lcm-subagent`'s retrieval model isn't suitable. Only 10.8% more expensive.
3. **Avoid `full-compaction`** for sessions expected to exceed ~150 cycles. ~97% cost premium vs `lcm-subagent`.
4. **For short sessions (<80 cycles):** No compaction fires with default 200k window. Strategy choice doesn't affect cost — use whichever is simplest to implement.

---

## Tool Result Size Sensitivity (Experiment 004)

Sweep: toolResultSize ∈ {100, 266, 707, 1880, 5000}, all strategies, 200 cycles, calibrated config.

| toolResultSize | lcm-subagent | lossless-hier | incremental | lossless-tool | lossless-app | full-compact |
|---|---|---|---|---|---|---|
| 100 | **$9.95** | $10.50 | $10.43 | $10.48 | $10.84 | $22.08 |
| 266 | **$10.25** | $11.02 | $10.99 | $11.15 | $11.45 | $20.77 |
| 380 (cal.) | **$10.49** | $11.34 | $11.43 | $11.63 | $11.92 | $20.71 |
| 707 | **$11.10** | $12.50 | $12.57 | $12.94 | $13.17 | $22.70 |
| 1880 | **$12.81** | $15.45 | $16.49 | $17.12 | $17.15 | $24.86 |
| 5000 | **$16.99** | $22.71 | $20.41 | $21.11 | $21.12 | $30.35 |

**Key findings:**
- `lcm-subagent` is cheapest at all tool result sizes (100–5,000). Cost advantage widens with size: 5% at 100 tokens → 17% at 5,000 tokens.
- `lossless-hierarchical` has a **U-shaped profile** relative to peers: competitive at 380–1,880 tokens but underperforms at extremes. At 5,000 tokens it becomes the most expensive lossless strategy.
- The Exp 003 ranking (lcm < hier < incremental < lossless-tool < lossless-app < full) only holds near the 380-token calibrated mean. Rankings among lossless strategies shift at extremes.
- For Models Agent (heavy-tail distribution up to 6,804 tokens), the real cost advantage of `lcm-subagent` is likely larger than the 8% computed at the mean.

---

## Short Session Regime (Experiment 005)

Config: calibrated baseline (Exp 003) with toolCallCycles=80.

| Strategy | Total Cost | Peak Context | Compactions |
|---|---|---|---|
| incremental | **$4.031** | 43,011 | 2 |
| lossless-tool-results | $4.051 | 43,011 | 2 |
| lcm-subagent | $4.053 | 43,011 | 2 |
| lossless-hierarchical | $4.122 | 43,011 | 2 |
| lossless-append | $4.151 | 43,011 | 2 |
| full-compaction | **$6.031** | 97,220 | 0 |

**Key findings:**
- Compaction fires at 80 cycles for all strategies except `full-compaction`. The trigger is `incrementalInterval` (30k tokens), not the context window threshold. At ~87k total tokens across 80 cycles, the interval is crossed ~2 times.
- `full-compaction` never compacts at 80 cycles (needs 170k context), and is 50% more expensive due to large growing context.
- The 5 compacting strategies cost nearly the same ($4.03–$4.15, a $0.12 spread). At 80 cycles, **`incremental` is the cheapest** — no retrieval overhead.
- **`lcm-subagent` adds only $0.022 vs incremental** at 80 cycles — negligible in absolute terms, but the advantage reverses vs the 200-cycle regime where `lcm-subagent` wins by $0.94.
- **Strategy selection crossover (lcm-subagent vs incremental):** occurs somewhere between 80 and 200 cycles. Worth pinpointing.

---

## Updated Recommendations

1. **Use `lcm-subagent`** for long Models Agent sessions (>~120 cycles). Cheapest across all tool result sizes, with the advantage growing as sessions lengthen and tool results get larger.
2. **For short sessions (<~80 cycles):** All compacting strategies are nearly equivalent. Use the simplest. `incremental` is cheapest by a hair; `lcm-subagent` adds negligible overhead.
3. **Avoid `full-compaction` regardless of session length.** Even at 80 cycles it's 50% more expensive.
4. **Avoid `lossless-hierarchical` for sessions with large tool results (>2k tokens)** — it becomes the most expensive lossless strategy in that regime.

---

## Open Questions / Next Experiments

- **Compression ratio sensitivity** (Experiment 006): How does `compressionRatio` affect `lcm-subagent` and `incremental` cost?
- **Threshold sensitivity** (Experiment 007): What's the optimal `compactionThreshold` for Models Agent sessions?
- **lcm-subagent vs incremental crossover** (new): At what session length (cycles) does `lcm-subagent` start beating `incremental`? Pinpoint this to guide strategy selection for short sessions.
- **incrementalInterval sensitivity** (new): The 30k default fires compaction early even in short sessions. Is this optimal for Models Agent?
