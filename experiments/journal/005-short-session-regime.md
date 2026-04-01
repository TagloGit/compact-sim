---
experiment: 005
title: Short Session Regime (No Compaction)
date: 2026-04-01
---

# 005 — Short Session Regime (No Compaction)

## Hypothesis

At short session lengths, context may never grow large enough to cross the compaction threshold. If compaction never fires, strategies that manage context actively will offer no advantage over doing nothing — and full-compaction, which fires least frequently, might paradoxically become more expensive by building a larger context before eventually triggering.

## Method

toolCallCycles reduced to 80, all other parameters held at the Exp 003 calibrated baseline (toolCallSize=75, toolResultSize=380, assistantMessageSize=130, userMessageFrequency=12, userMessageSize=60, systemPromptSize=10000). All six strategies run and total cost and peak context size recorded.

## Results

| Strategy | Total Cost | Peak Context (tokens) |
|---|---|---|
| incremental | $4.03 | 43,011 |
| lossless-tool-results | $4.05 | 43,011 |
| lcm-subagent | $4.05 | 43,011 |
| lossless-hierarchical | $4.12 | 43,011 |
| lossless-append | $4.15 | 43,011 |
| full-compaction | $6.03 | 97,220 |

## Analysis

**No compaction fires for any strategy except full-compaction.** At 80 cycles with calibrated parameters, the peak context for all non-full strategies is 43,011 tokens — well below the 85% threshold of a 200,000-token context window (170,000 tokens). Context never grows large enough to trigger active compaction.

**Full-compaction's peak context is 97,220 tokens** — more than double the other strategies. This is because full-compaction's threshold and cadence settings differ; it fires once late in the session but at a point where context has already grown substantially, resulting in a high-cost final section.

**incremental edges out lcm-subagent by $0.002 ($4.031 vs $4.053).** This margin is effectively zero — within rounding error. The "win" for incremental is not meaningful; at this session length all five compacting strategies perform identically from a compaction perspective (none fires), and the tiny cost differences reflect minor implementation details in how each strategy accounts for retrieval overhead even when retrieval never occurs.

**The practical implication:** for short sessions where compaction never triggers, strategy selection is irrelevant except for avoiding full-compaction. full-compaction costs 50% more than the next most expensive strategy ($6.03 vs $4.15) because it allows context to grow to nearly 100k tokens before acting.

**The crossover question:** somewhere between 80 and 200 cycles, compaction starts firing for the non-full strategies and lcm-subagent begins pulling ahead. Finding that crossover point would help characterise the minimum session length where strategy choice matters.

## Conclusions

For sessions of 80 cycles or fewer under the calibrated Models Agent config, no active compaction fires and strategy choice is largely irrelevant. The single actionable conclusion is to avoid full-compaction even in short sessions, as it builds a disproportionately large context before triggering. For the realistic 200-cycle session (Exp 003), active compaction is firing and strategy differences are meaningful.

## Next questions

- What is the crossover cycle count where compaction first fires for non-full strategies? (Likely between 80 and 120 cycles given the 43k peak at 80 cycles and a 170k threshold.)
- At the crossover point, which strategy first gains a cost advantage?
- Does full-compaction ever become competitive with other strategies at any session length?
