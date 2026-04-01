---
experiment: 003
title: Calibrated Baseline (Models Agent Reference)
date: 2026-04-01
---

# 003 — Calibrated Baseline (Models Agent Reference)

## Hypothesis

Calibrating the simulator to actual Models Agent session data will produce a meaningfully different cost picture than the default or semi-calibrated configs. Absolute costs will drop sharply (due to realistic small tool results) and strategy rankings may shift relative to Exp 002.

## Method

All parameters set from calibration of real Models Agent conversations: toolCallCycles=200, toolCallSize=75, toolResultSize=380, assistantMessageSize=130, userMessageFrequency=12, userMessageSize=60, systemPromptSize=10000. All six strategies run. This config is designated the canonical reference for future experiments.

## Results

| Strategy | Total Cost |
|---|---|
| lcm-subagent | $10.49 |
| lossless-hierarchical | $11.34 |
| incremental | $11.43 |
| lossless-tool-results | $11.63 |
| lossless-append | $11.92 |
| full-compaction | $20.71 |

## Analysis

Absolute costs are dramatically lower than Exp 002 ($10–12 vs $21–34) despite the same cycle count. The reduction comes entirely from realistic tool result sizes (380 vs 4000 tokens) — confirming that tool result size is the dominant cost driver in the Models Agent workload.

lossless-hierarchical recovers its second-place position (vs Exp 002 where it ranked fifth among non-full strategies). At 380-token tool results, the hierarchical store overhead is manageable and its efficient context management pays off. incremental is now third rather than second.

lcm-subagent leads by 8% over lossless-hier ($10.49 vs $11.34). This is a meaningful but not enormous margin. The four non-full strategies span only $1.43 ($10.49–$11.92), a tight cluster relative to full-compaction's $20.71 — nearly double the cheapest option.

The full-compaction premium is 97% over lcm-subagent. At realistic params, full-compaction costs approximately twice as much as the best alternative for a 200-cycle Models Agent session.

## Conclusions

This is the canonical reference result. Strategy ranking at calibrated params: lcm-subagent < lossless-hier < incremental < lossless-tool < lossless-app < full-compact. The practical gap between the top four strategies is modest (~14%); the gap to full-compaction is severe (~97%). Any of the top four strategies is a reasonable choice; full-compaction should be avoided for sessions of this length.

## Next questions

- How sensitive is the ranking to variation in tool result size? (Exp 004)
- At what session length (cycle count) does compaction start to matter, and do rankings change in short sessions? (Exp 005)
- What compression ratio assumptions most affect lcm-subagent's lead?
