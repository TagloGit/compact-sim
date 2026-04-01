# 003 — Calibrated Baseline: All Strategies at Models Agent Parameters

## Hypothesis

With parameters calibrated from real Models Agent reference conversations — smaller tool results (380 vs 4,000 tokens), smaller assistant messages (130 vs 500), larger system prompt (10,000 vs 8,000) — the strategy ranking from Experiments 001–002 will hold but absolute costs will differ. The smaller per-cycle context growth will push `full-compaction`'s single compaction event later into the conversation, potentially changing its relative performance. `lcm-subagent` is expected to remain cheapest.

## Method

All six strategies run with parameters derived from analysis of 7 reference Models Agent conversations (see `experiments/data/calibration.json`).

**Config** (`experiments/data/003/config-*.json`):
| Parameter | Value | Source |
|---|---|---|
| `toolCallCycles` | 200 | Long session; ensures compaction triggers |
| `toolCallSize` | 75 tokens | Reference mean: 73 tokens |
| `toolResultSize` | 380 tokens | Reference mean: 380 tokens |
| `assistantMessageSize` | 130 tokens | Reference mean: 128 tokens |
| `reasoningOutputSize` | 500 tokens | Default (not directly measurable) |
| `userMessageFrequency` | 12 cycles | Reference mean: 11.5 cycles |
| `userMessageSize` | 60 tokens | Reference mean: 56 tokens |
| `systemPromptSize` | 10,000 tokens | Reference mean: 10,331 tokens |
| `contextWindow` | 200,000 tokens | Default |
| `compactionThreshold` | 85% (170k) | Default |

**Per-cycle token growth:** ~1,090 tokens (tool_call 75 + tool_result 380 + assistant 130 + reasoning 500 + user amortised 5).

**Expected first compaction (full-compaction):** (170,000 - 10,000) / 1,090 ≈ cycle 147 — so only 1 compaction in 200 cycles.

## Results

| Strategy | Total Cost | Compactions | Avg Cache Hit | Peak Context |
|---|---|---|---|---|
| `full-compaction` | $20.71 | 1 | 98.6% | 169,895 |
| `incremental` | $11.43 | 7 | 97.7% | 58,089 |
| `lossless-append` | $11.92 | 7 | 97.7% | 58,089 |
| `lossless-hierarchical` | $11.34 | 7 | 97.2% | 43,352 |
| `lossless-tool-results` | $11.63 | 7 | 97.7% | 58,089 |
| `lcm-subagent` | $10.49 | 7 | 97.2% | 43,352 |

**Cost breakdown (final cumulative):**

| Strategy | Cached Input | Cache Write | Uncached Input | Output | Compaction | Retrieval |
|---|---|---|---|---|---|---|
| `full-compaction` | $16.01 | $0.73 | $0.63 | $3.15 | $0.19 | $0 |
| `incremental` | $6.67 | $0.65 | $0.71 | $3.15 | $0.25 | $0 |
| `lossless-append` | $6.67 | $0.65 | $0.71 | $3.15 | $0.25 | $0.49 |
| `lossless-hierarchical` | $5.35 | $0.65 | $0.72 | $3.15 | $0.28 | $1.20 |
| `lossless-tool-results` | $6.67 | $0.65 | $0.71 | $3.15 | $0.25 | $0.20 |
| `lcm-subagent` | $5.35 | $0.65 | $0.72 | $3.15 | $0.28 | $0.35 |

## Analysis

**Strategy ranking is stable for the third time.** The ordering lcm-subagent < lossless-hierarchical < incremental < lossless-tool-results < lossless-append < full-compaction holds across all three experiments. This gives high confidence the ranking is robust.

**`full-compaction` is now +97% over `lcm-subagent`** (vs +61% in exp 002). The penalty is larger in relative terms because with calibrated params, `full-compaction` fires only once (at cycle ~147). For the first 147 cycles, the context grows unchecked to ~170k tokens. Each turn's cached-input cost is proportional to context size, so the large-context phase dominates total cost. The $16.01 cached-input cost reflects this: a 169,895-token context is read (at 10% of base price) ~93 times after compaction fires at cycle ~147.

Wait — examining more carefully: the cached-input cost of $16.01 represents the total across all 200 cycles, not just post-compaction. The high cache-hit rate (98.6%) shows the system prompt + early messages form a very stable prefix. But the sheer volume of tokens being re-read per step drives the cost up.

**Output cost is strategy-independent.** All strategies show $3.15 output cost — the agent generates the same token volume regardless of compaction strategy. Output is 30% of total cost for efficient strategies, 15% for full-compaction. This sets a floor: even with perfect compaction, cost ≥ $3.15 for this conversation profile.

**`incremental` vs `lcm-subagent`:** Both have 7 compaction events. `incremental` costs $11.43, `lcm-subagent` $10.49 (-8.2%). The difference is purely the smaller peak context (43k vs 58k) driving lower cached-input cost ($5.35 vs $6.67). `lcm-subagent` achieves this smaller context by replacing the full conversation with a compact summary + external store at each compaction, whereas `incremental` accumulates multiple summaries.

**Retrieval cost tradeoff:** `lossless-hierarchical` spends $1.20 on retrieval vs `lcm-subagent`'s $0.35 — both achieve identical peak context (43,352). The hierarchical multi-level retrieval is 3.4× more expensive than the lcm grep/expand approach. This makes `lcm-subagent` strictly better than `lossless-hierarchical` at these parameters.

**Lossless variants vs. `incremental`:**
- `lossless-append` (+$0.49 retrieval): +4.3% cost over `incremental` for lossless guarantees
- `lossless-tool-results` (+$0.20 retrieval): +1.7% cost over `incremental`
- `lossless-hierarchical` (+$1.20 retrieval, -$1.32 cached input): net -$0.09 vs incremental

**Calibration impact on cost structure:** Compared to experiment 002 (4,000-token tool results), costs are ~55% lower despite 200 cycles. The real Models Agent has much smaller tool results than the experiment 002 estimate — this is the key calibration finding.

## Conclusions

1. **`lcm-subagent` is the recommended strategy** for Models Agent sessions: consistently cheapest across all tested configurations, with a compact peak context (43k vs 58–170k for alternatives).

2. **`full-compaction` is strongly contraindicated** for long Models Agent sessions (+97% cost penalty). Its single late compaction wastes input budget on large-context turns.

3. **Strategy ranking is robustly stable** across 3 experiments with very different parameter regimes (100–200 cycles, 380–4,000 token tool results). The ordering can be trusted.

4. **Output cost is the irreducible floor** (~$3.15 per 200-cycle session at default pricing). This is strategy-independent — any compaction improvement can only reduce the input-side costs.

5. **Lossless variants are affordable:** `lossless-tool-results` adds only 1.7% over `incremental` for full tool-result losslessness. Worth it if retrieval quality matters.

6. **Realistic Models Agent context grows slowly:** ~1,090 tokens/cycle means 200 cycles reaches ~228k tokens total generated. A single 200k window session would trigger `full-compaction` only once (at cycle ~147). Incremental strategies are more aggressive, firing every ~27 cycles.

## Next Questions

1. **How sensitive is the ranking to `toolResultSize`?** Real conversations show tool results range 5–6,804 tokens (mean 380). A sweep over tool result sizes would show where the strategy crossovers occur.
2. **What is the effect of shorter sessions (80 cycles)?** At the typical reference conversation length (80 cycles), no strategy hits the 170k threshold — what happens to the cost ranking when compaction never fires?
3. **How do parameters like `compressionRatio` and `compactionThreshold` affect `lcm-subagent` and `incremental` costs?** These are the two top strategies to optimise.
4. **Does tool result size distribution matter?** The mean is 380 but the range is 5–6,804. High variance could change cache behaviour significantly.
