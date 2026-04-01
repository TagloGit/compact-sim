# Research Plan

## Objective

Maximise performance vs. cost for Models Agent tasks exceeding 100k tokens total context. Performance degrades notably beyond this threshold — compaction strategies aim to keep context effective while controlling cost.

## Phase 1: Baselines & orientation

- [ ] Run all 6 strategies with default config — establish baseline costs and behaviour
- [ ] Study reference conversations to derive realistic Models Agent config parameters
- [ ] Identify which config parameters have the most impact on cost (sensitivity analysis)

## Phase 2: Strategy comparison

- [ ] Compare strategies across conversation shapes (tool-heavy vs chat-heavy)
- [ ] Find crossover points — at what conversation length does each strategy win?
- [ ] Evaluate cache utilisation — which strategies preserve input caching best?

## Phase 3: Deep dives

- [ ] Incremental vs full compaction — when is the complexity worth it?
- [ ] Lossless strategies — cost of retrieval errors, sensitivity to retrieval probability
- [ ] Compression ratio impact — how much does summary quality matter?

## Phase 4: Recommendations

- [ ] Synthesise findings into actionable recommendation for Models Agent
- [ ] Identify the top 2-3 strategies worth prototyping in production

## Questions that emerge

(Agent adds new questions here as research progresses)
