# 001 — Default Baseline: All Strategies at Default Config

## Hypothesis

With default simulation parameters, all six strategies will show measurable cost differences. `full-compaction` is expected to be most expensive due to rare compaction events that leave large un-cached context between compactions. Strategies with smaller peak context windows (hierarchical/lcm-subagent) should show cost savings.

## Method

All six strategies run with default config — only `selectedStrategy` overridden. This establishes a reference point before calibrating to the Models Agent profile.

**Config** (`experiments/data/001/config-*.json`): each file specifies only `{"selectedStrategy": "<name>"}` — all other parameters are defaults.

**Resolved defaults:**
| Parameter | Value |
|---|---|
| `toolCallCycles` | 100 |
| `toolCallSize` | 200 tokens |
| `toolResultSize` | 2,000 tokens |
| `assistantMessageSize` | 300 tokens |
| `reasoningOutputSize` | 500 tokens |
| `userMessageFrequency` | every 10 cycles |
| `userMessageSize` | 200 tokens |
| `systemPromptSize` | 4,000 tokens |
| `contextWindow` | 200,000 tokens |
| `compactionThreshold` | 85% (170k tokens) |
| `compressionRatio` | 10:1 |

## Results

| Strategy | Total Cost | Compactions | Avg Cache Hit | Peak Context |
|---|---|---|---|---|
| `full-compaction` | $12.61 | 1 | 96.3% | 168,200 |
| `incremental` | $7.25 | 10 | 93.2% | 59,380 |
| `lossless-append` | $7.56 | 10 | 93.2% | 59,380 |
| `lossless-hierarchical` | $7.30 | 10 | 87.8% | 35,556 |
| `lossless-tool-results` | $7.54 | 10 | 93.2% | 59,380 |
| `lcm-subagent` | $6.56 | 10 | 87.8% | 35,556 |

## Analysis

**`full-compaction` is dramatically more expensive (+72% vs. next best):** Only 1 compaction event occurs at the 85% threshold. The strategy waits until context fills to 170k tokens, then compacts everything to a ~17k summary. Between compaction and end-of-conversation, the large context (growing back from 17k to ~168k) is expensively re-read on each turn. The high cache hit rate (96.3%) shows the stable prefix is reused, but the absolute token count per turn is still large.

**Incremental strategies cluster tightly at $7.25–$7.56:** `incremental`, `lossless-append`, `lossless-tool-results` all share the same compaction pattern (35-interval incremental) and peak context (~59k). The lossless variants add small retrieval costs (+$0.3–$0.31) over pure incremental.

**`lcm-subagent` wins at $6.56 (cheapest):** Achieves the smallest peak context (same as hierarchical, 35k) with lower retrieval costs than `lossless-hierarchical` ($7.30). Lower cache hit rate (87.8% vs 93.2%) is more than compensated by the smaller context size per turn.

**`lossless-hierarchical` vs `lcm-subagent`:** Both achieve the same peak context and compaction count, but `lossless-hierarchical` costs more ($7.30 vs $6.56). The difference is retrieval overhead — hierarchical has more complex retrieval.

## Conclusions

1. **Full-compaction should be avoided for long sessions** — the delayed compaction approach is ~72% more expensive than alternatives at 100 cycles/default params.
2. **Context size reduction is the primary cost lever** — the gap between strategies correlates with their peak context size.
3. **Retrieval overhead is relatively small** — lossless variants cost only 4–15% more than their lossy equivalents, suggesting the lossless guarantee is cheap to achieve.
4. **`lcm-subagent` dominates at default params** — cheapest overall with smallest peak context.

## Next Questions

- How do these results change with realistic Models Agent parameters (smaller tool results, smaller assistant messages, larger system prompt)?
- At what conversation length does `full-compaction` become competitive (if ever)?
- How sensitive are results to `compressionRatio` and `compactionThreshold`?
