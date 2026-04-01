# 002 — Semi-Calibrated Baseline: All Strategies at 200-Cycle Heavy Config

## Hypothesis

A longer, heavier conversation (200 cycles, large tool results) will amplify the cost differences seen in Experiment 001, particularly penalising `full-compaction` further. Strategies with aggressive context reduction (hierarchical, lcm-subagent) should extend their lead.

## Method

All six strategies run with a manually estimated "heavy" config — intended to approximate a long Models Agent session with large data payloads. Parameters were estimated before reference conversation analysis was completed.

**Config** (`experiments/data/002/config-*.json`):
| Parameter | Value |
|---|---|
| `toolCallCycles` | 200 |
| `toolCallSize` | 150 tokens |
| `toolResultSize` | 4,000 tokens |
| `assistantMessageSize` | 500 tokens |
| `reasoningOutputSize` | 1,000 tokens |
| `userMessageFrequency` | every 20 cycles |
| `systemPromptSize` | 8,000 tokens |
| All other params | default |

**Note:** This config was estimated before reference conversation analysis. The `toolResultSize` (4,000) is ~10× higher than the actual mean (380) from reference data. See Experiment 003 for calibrated results.

## Results

| Strategy | Total Cost | Compactions | Avg Cache Hit | Peak Context |
|---|---|---|---|---|
| `full-compaction` | $34.05 | 7 | 94.8% | 168,250 |
| `incremental` | $24.48 | 35 | 92.5% | 84,540 |
| `lossless-append` | $25.19 | 35 | 92.5% | 84,540 |
| `lossless-hierarchical` | $27.23 | 35 | 87.3% | 41,715 |
| `lossless-tool-results` | $25.17 | 35 | 92.5% | 84,540 |
| `lcm-subagent` | $21.16 | 35 | 87.3% | 41,715 |

## Analysis

**Rankings preserved, gaps widened:** The same ordering holds as in Experiment 001. With 2× cycles and ~2× per-turn token cost, total costs roughly tripled (scaling expected). `full-compaction` premium grew from 72% to 61% over next-best, slightly narrowing in relative terms as it now triggers 7 compactions instead of 1.

**`full-compaction` behaviour:** With 4,000-token tool results and 200 cycles, each cycle produces ~5,700 tokens (tool_call + tool_result + assistant + reasoning). At 200k × 85% = 170k threshold, the first compaction fires at ~cycle 28 (170k / 5,700). This gives 7 compactions for 200 cycles (200 / 28 ≈ 7). Between compactions, the re-growing context is expensive due to high per-turn input cost.

**Incremental strategies cluster tightly ($24.48–$25.19):** The three incremental-base strategies (`incremental`, `lossless-append`, `lossless-tool-results`) again cluster within 3% of each other. The retrieval overhead of lossless variants is proportionally larger at high tool result sizes but still small in absolute terms.

**`lossless-hierarchical` is now worse than `lcm-subagent` by a larger margin** ($27.23 vs $21.16, +29%). Both achieve identical peak context (41,715) and compaction counts (35). The difference is in retrieval cost structure — hierarchical accumulates expensive multi-level retrieval.

**Config calibration problem:** The `toolResultSize: 4000` is ~10× the reference mean (380 tokens). This exaggerates the tool-result-dominant cost structure and likely understates the relative importance of the system prompt and assistant messages.

## Conclusions

1. **Strategy ranking is stable across config changes** — same order in 001 and 002, suggesting the relative ordering is robust.
2. **lcm-subagent consistently cheapest** by meaningful margins (21% over incremental at 200 cycles).
3. **The semi-calibrated config overestimates tool result sizes** — real Models Agent tool results average 380 tokens, not 4,000. Experiment 003 uses properly calibrated parameters.
4. **Compaction count matters more than peak context size alone** — `full-compaction` achieves high cache hit rates but its large absolute context per turn dominates cost.

## Next Questions

- With calibrated params (380-token tool results), does the strategy ranking hold?
- Given that 4k-token tool results aren't typical, what is the realistic cost regime for the Models Agent?
- What does a realistic 200-cycle Models Agent session actually cost per strategy?
