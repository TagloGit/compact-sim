---
experiment: 001
title: Default Baseline
date: 2026-04-01
---

# 001 — Default Baseline

## Hypothesis

Running all six compaction strategies against the simulator's default configuration should establish a cost baseline and reveal the relative ranking of strategies before any calibration to real-world data.

## Method

All parameters left at simulator defaults: toolCallCycles=100, toolCallSize=200, toolResultSize=2000, assistantMessageSize=300, systemPromptSize=4000, contextWindow=200000. All six strategies run against this config and total cost compared.

## Results

| Strategy | Total Cost |
|---|---|
| lcm-subagent | $6.56 |
| incremental | $7.25 |
| lossless-hierarchical | $7.30 |
| lossless-tool-results | $7.54 |
| lossless-append | $7.56 |
| full-compaction | $12.61 |

## Analysis

lcm-subagent is cheapest at $6.56. full-compaction is the most expensive at $12.61 — 92% more than lcm-subagent. The four lossless variants cluster tightly between $7.25 and $7.56, suggesting that at default params the overhead differences between lossless approaches are modest. full-compaction stands apart as a clear outlier on the expensive end.

The ranking (lcm-subagent < incremental < lossless-hier < lossless-tool < lossless-app < full-compact) already hints at a structural advantage for strategies that use selective or dual-retrieval external storage, but default params are not realistic — toolResultSize=2000 is 5x the calibrated mean, and systemPromptSize=4000 is below real-world values.

## Conclusions

Even at uncalibrated defaults, full-compaction is clearly the worst-performing strategy. lcm-subagent leads the pack. These results are directionally useful but should not be treated as authoritative — default params do not reflect the Models Agent workload.

## Next questions

- Default params are not realistic. How do rankings change when calibrated to real conversations?
- Real Models Agent sessions have systemPrompt ~10k tokens, toolResultSize ~380 tokens avg, ~12 tool calls per user turn. What does that do to absolute costs and relative ordering?
