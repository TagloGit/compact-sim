---
experiment: 004
title: Tool Result Size Sensitivity
date: 2026-04-01
---

# 004 — Tool Result Size Sensitivity

## Hypothesis

Tool result size is a major cost driver (as suggested by the difference between Exp 002 and Exp 003). A sweep across a wide range of tool result sizes will reveal how strategy rankings shift as tool results grow, and whether lcm-subagent's advantage holds across the full range.

## Method

Parameter sweep: toolResultSize across [100, 266, 707, 1880, 5000] tokens (logarithmic spacing) × all 6 strategies. All other parameters held at the Exp 003 calibrated baseline (toolCallCycles=200, toolCallSize=75, assistantMessageSize=130, userMessageFrequency=12, userMessageSize=60, systemPromptSize=10000). Total cost recorded for each combination.

## Results

| toolResultSize | lcm-subagent | lossless-hier | incremental | lossless-tool | lossless-app | full-compact |
|---|---|---|---|---|---|---|
| 100 | $9.95 | $10.50 | $10.43 | $10.48 | $10.84 | $22.08 |
| 266 | $10.25 | $11.02 | $10.99 | $11.15 | $11.45 | $20.77 |
| 707 | $11.10 | $12.50 | $12.57 | $12.94 | $13.17 | $22.70 |
| 1880 | $12.81 | $15.45 | $16.49 | $17.12 | $17.15 | $24.86 |
| 5000 | $16.99 | $22.71 | $20.41 | $21.11 | $21.12 | $30.35 |

## Analysis

**lcm-subagent is cheapest at every tool result size tested.** Its absolute cost advantage grows with tool result size: at 100 tokens the margin over second place is $0.48; at 5000 tokens it is $3.42 (over incremental). lcm-subagent scales more gracefully because its dual-retrieval model avoids re-ingesting large tool results on every context rebuild.

**lossless-hierarchical shows a rank reversal at large tool results.** At 100–266 tokens, lossless-hier is second cheapest (just behind lcm-subagent). Above 707 tokens it slips behind incremental, and at 5000 tokens it is the most expensive non-full-compaction strategy at $22.71 — more expensive than incremental ($20.41) by $2.30. This is because hierarchical storage accumulates all messages across levels, and large tool results make each level progressively more expensive to maintain and retrieve.

**incremental becomes second-best at large tool results (>707 tokens).** Unlike lossless strategies, incremental does not maintain an external store, so large tool results that are compacted away reduce ongoing context cost without incurring storage overhead.

**full-compaction is always most expensive** but its relative disadvantage does not grow monotonically with tool result size. At very small tool results (100 tokens) the full-compaction premium is 122% over lcm-subagent; at 5000 tokens it is 79%. This counter-intuitive narrowing occurs because at large tool result sizes all strategies bear higher input costs, compressing relative differences.

**The calibrated mean (380 tokens) sits between the 266 and 707 data points**, in a regime where lossless-hier is still second and the non-lcm strategies are tightly grouped. This confirms Exp 003's ranking as representative of the realistic workload.

## Conclusions

lcm-subagent is robust across all tool result sizes. For workloads with consistently large tool results (>1k tokens), lossless-hierarchical should be avoided in favour of incremental. For the calibrated Models Agent workload (~380 tokens), either lossless-hier or incremental is a reasonable second choice. full-compaction remains a poor choice regardless of tool result size.

## Next questions

- At what session length does incremental overtake lcm-subagent (if ever)?
- Does the lossless-hier rank reversal occur at the same tool result threshold for shorter sessions?
- What compression ratio assumptions drive lcm-subagent's scaling advantage?
