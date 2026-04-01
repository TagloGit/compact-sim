---
experiment: 002
title: Semi-calibrated Baseline
date: 2026-04-01
---

# 002 — Semi-calibrated Baseline

## Hypothesis

Increasing session length to 200 cycles and moving tool result size and system prompt closer to real-world values will amplify cost differences between strategies and push lcm-subagent's advantage further. Absolute costs should rise significantly with the longer session.

## Method

Config adjusted toward calibration but not fully there: toolCallCycles=200, toolResultSize=4000 (still above calibrated mean of 380), systemPromptSize=8000. All other params at simulator defaults. All six strategies run and total cost compared.

## Results

| Strategy | Total Cost |
|---|---|
| lcm-subagent | $21.16 |
| incremental | $24.48 |
| lossless-tool-results | $25.17 |
| lossless-append | $25.19 |
| lossless-hierarchical | $27.23 |
| full-compaction | $34.05 |

## Analysis

Absolute costs are approximately 3x those in Experiment 001, driven by the combination of double the cycle count and double the tool result size. lcm-subagent remains cheapest; full-compaction is most expensive at $34.05 — 61% above lcm-subagent.

A notable shift from Exp 001: lossless-hierarchical is now second-most expensive rather than second-cheapest. At toolResultSize=4000, hierarchical storage of all messages (including large tool results) becomes costly. lossless-hier's advantage over full-compaction is narrowing. incremental holds second place.

The tight clustering seen in Exp 001 among lossless strategies has started to break apart — lossless-hier is $2 more expensive than lossless-tool at this tool result size. This foreshadows the sensitivity analysis in Exp 004.

A key caveat: toolResultSize=4000 is 10x the calibrated mean of 380 tokens. These costs are substantially inflated compared to the realistic Models Agent workload.

## Conclusions

The semi-calibrated config confirms that strategy rankings are broadly stable as session length increases, but relative costs shift — particularly for lossless-hierarchical, which becomes comparatively more expensive as tool results grow. The 61% premium for full-compaction over lcm-subagent at this scale reinforces that full-compaction is a poor choice for long sessions.

## Next questions

- toolResultSize=4000 is an outlier. The calibrated mean is 380 tokens — what do costs look like at the true baseline?
- At realistic tool result sizes, does lossless-hier recover its relative position against incremental?
