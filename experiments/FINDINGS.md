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

## Open Questions / Next Experiments

- **Tool result size sensitivity sweep** (Experiment 004): Real conversations range 5–6,804 tokens. Where do strategy crossovers occur?
- **Short session regime** (Experiment 005): At 80 cycles (typical session), does no-compaction context (~97k) still have meaningful cache effects? Does `lcm-subagent` still win?
- **Compression ratio sensitivity** (Experiment 006): How does `compressionRatio` affect `lcm-subagent` and `incremental` cost?
- **Threshold sensitivity** (Experiment 007): What's the optimal `compactionThreshold` for Models Agent sessions?
