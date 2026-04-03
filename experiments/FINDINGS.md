# Findings

Accumulated knowledge from experiment iterations. Read this at the start of every session.

---

## Calibration Data

Derived from 7 real Models Agent reference conversations (XML format, `experiments/reference-conversations/`).

| Parameter | Value | Notes |
|---|---|---|
| `systemPromptSize` | ~10,000 tokens | Range 9,425–10,848 across sessions |
| `toolCallSize` | ~75 tokens avg | Mean 73, range 16–1,598 (most calls are compact) |
| `toolResultSize` | ~380 tokens avg | Mean 380, range 5–6,804 (high variance) |
| `assistantMessageSize` | ~130 tokens avg | Mean 128, range 7–2,986 |
| `userMessageSize` | ~60 tokens avg | Mean 56, range 2–470 |
| `userMessageFrequency` | ~12 tool calls/user turn | Mean 11.5 across sessions |

**Canonical calibrated config** (used as baseline from Exp 003 onward):
```json
{
  "toolCallCycles": 200,
  "toolCallSize": 75,
  "toolResultSize": 380,
  "assistantMessageSize": 130,
  "userMessageFrequency": 12,
  "userMessageSize": 60,
  "systemPromptSize": 10000
}
```

Token estimation methodology: 1 token ≈ 4 characters (from calibration script).

---

## Strategy Baselines (Exp 003 — Calibrated, 200 cycles)

Canonical reference costs at calibrated Models Agent parameters (200 tool-call cycles).

| Strategy | Total Cost | vs lcm-subagent | Compactions |
|---|---|---|---|
| `lcm-subagent` | $10.49 | — | several |
| `lossless-hierarchical` | $11.34 | +8% | several |
| `incremental` | $11.43 | +9% | several |
| `lossless-tool-results` | $11.63 | +11% | several |
| `lossless-append` | $11.92 | +14% | several |
| `full-compaction` | $20.71 | +97% | several |

**lcm-subagent is the cheapest strategy** at the calibrated baseline for 200-cycle (long) sessions. full-compaction is nearly 2× more expensive and should be avoided for long sessions.

---

## Strategy Baselines (Exp 005 — Calibrated, 80 cycles / Short Session)

At 80 tool-call cycles, most strategies do NOT trigger compaction (context stays below 85% threshold).

| Strategy | Total Cost | Peak Context | Compactions |
|---|---|---|---|
| `incremental` | $4.03 | 43,011 tokens | 2 |
| `lossless-tool-results` | $4.05 | 43,011 tokens | 2 |
| `lcm-subagent` | $4.05 | 43,011 tokens | 2 |
| `lossless-hierarchical` | $4.12 | 43,011 tokens | 2 |
| `lossless-append` | $4.15 | 43,011 tokens | 2 |
| `full-compaction` | $6.03 | 97,220 tokens | **0** |

**Key insight**: At 80 cycles, full-compaction never fires — it ends up with a 97k-token context and costs 50% more than competitors despite no compaction work. All other strategies behave nearly identically (cost spread < $0.12).

**Crossover observed**: incremental < lcm-subagent at 80 cycles, but lcm-subagent < incremental at 200 cycles. Crossover point is somewhere between 80–200 cycles (Exp 007 will characterise this).

---

## Tool Result Size Sensitivity (Exp 004)

Sweep over toolResultSize 100–5,000 tokens (log scale, 5 steps), all strategies at 200 cycles.

| toolResultSize | lcm-subagent | lossless-hier | incremental | lossless-tool | lossless-app | full-compact |
|---|---|---|---|---|---|---|
| 100 | $9.95 | $10.50 | $10.43 | $10.48 | $10.84 | $22.08 |
| 266 | $10.25 | $11.02 | $10.99 | $11.15 | $11.45 | $20.77 |
| 380 (baseline) | $10.49 | $11.34 | $11.43 | $11.63 | $11.92 | $20.71 |
| 707 | $11.10 | $12.50 | $12.57 | $12.94 | $13.17 | $22.70 |
| 1,880 | $12.81 | $15.45 | $16.49 | $17.12 | $17.15 | $24.86 |
| 5,000 | $16.99 | $22.71 | $20.41 | $21.11 | $21.12 | $30.35 |

**Key findings:**
1. **lcm-subagent dominates at all tool result sizes** (100–5,000 tokens).
2. At small results (≤266 tokens): ranking among mid-tier strategies shuffles slightly, but differences are small.
3. At large results (≥1,880 tokens): lossless-hierarchical becomes *more* expensive than incremental — hierarchical storage of large tool results becomes costly.
4. At very large results (5,000 tokens): lcm-subagent saves $3.4 over the next cheapest (incremental).
5. lcm-subagent advantage grows with tool result size.

**Models Agent tool result size** averages 380 tokens (well within the range where lcm-subagent wins clearly).

---

## Compression Ratio Sensitivity (Exp 006)

Sweep over `compressionRatio` [3, 5, 10, 15, 20] for `incremental` and `lcm-subagent` at the calibrated baseline (200 cycles).

| compressionRatio | incremental | lcm-subagent | difference | lcm_advantage% |
|---|---|---|---|---|
| 3 | $14.30 | $13.04 | $1.26 | 8.83% |
| 5 | $13.50 | $11.44 | **$2.06** | **15.23%** |
| 10 (baseline) | $11.43 | $10.49 | $0.94 | 8.20% |
| 15 | $10.74 | $10.21 | $0.52 | 4.88% |
| 20 | $10.39 | $10.08 | $0.31 | 3.00% |

Compaction events: 7 for both strategies at every ratio — ratio does not affect compaction frequency.

**Key findings:**
1. **lcm-subagent dominates at all compression ratios** — ranking is stable across the full range.
2. **Peak lcm-subagent advantage at ratio=5 (15.23%)**, not at extreme ratios.
3. **"Higher compression always cheaper" is a modelling artefact** — the model has no quality penalty for information loss. The default ratio=10 is a defensible practical choice.

---

## lcm-subagent vs Incremental Crossover (Exp 007)

Sweep over `toolCallCycles` [80–200] for `incremental` and `lcm-subagent`, calibrated baseline.

| toolCallCycles | incremental | lcm-subagent | cheaper | gap |
|---|---|---|---|---|
| 80 | $4.031 | $4.053 | incremental | $0.022 |
| 100 | $5.120 | $5.092 | **lcm-subagent** | $0.028 |
| 120 | $6.302 | $6.173 | lcm-subagent | $0.129 |
| 140 | $7.602 | $7.348 | lcm-subagent | $0.253 |
| 160 | $8.766 | $8.347 | lcm-subagent | $0.419 |
| 180 | $10.048 | $9.400 | lcm-subagent | $0.648 |
| 200 | $11.428 | $10.491 | lcm-subagent | $0.937 |

**Crossover at ~89 cycles** (between 80 and 100). lcm-subagent advantage widens monotonically past the crossover (~$0.045 per 10 additional cycles).

**Updated recommendation: use lcm-subagent unconditionally** for all Models Agent sessions. The penalty at short sessions ($0.022 at 80 cycles) is negligible; the benefit at 200 cycles is $0.94.

---

## incrementalInterval Sensitivity (Exp 008)

Sweep over `incrementalInterval` [15k, 30k, 50k, 80k] × `toolCallCycles` [80, 150, 200] for `incremental` and `lcm-subagent`.

| cycles | interval | incremental | lcm-subagent | cheaper |
|---|---|---|---|---|
| 80 | 15,000 | $3.542 | $3.456 | lcm-subagent |
| 80 | 30,000 | $4.031 | $4.053 | incremental |
| 80 | 50,000 | $4.583 | $4.659 | incremental |
| 80 | 80,000 | $5.692 | $5.692 | tie |
| 150 | 15,000 | $7.198 | $6.602 | lcm-subagent |
| 150 | 80,000 | $11.510 | $11.649 | incremental |
| 200 | 15,000 | $10.147 | $8.837 | lcm-subagent |
| 200 | 30,000 | $11.428 | $10.491 | lcm-subagent |
| 200 | 80,000 | $15.390 | $15.300 | lcm-subagent |

**Key findings:**
1. **Model always prefers interval=15k** — a modelling artefact (cheap compaction, no quality penalty). Do not treat as a production recommendation.
2. **30k (default) is the defensible practical choice** — avoids over-summarisation risks, 2–7 compactions per session.
3. **At 80k interval, strategies converge** — with only 1–2 compactions both strategies behave nearly identically.
4. Confirms Exp 007 crossover: incremental wins at 80 cycles with 30k+ intervals; lcm-subagent wins at 15k even for short sessions.

**Engine change (Exp 008):** Added `NumericValuesRange` to `sweep-types.ts` and handler in `sweep.ts` so numeric sweep params support `"values": [...]` arrays in addition to `{min, max, steps, scale}` ranges.

---

## pRetrieveMax Sensitivity (Exp 009)

Sweep over `pRetrieveMax` [0.0–1.0] × `toolCallCycles` [100, 150, 200] for `lcm-subagent` and `incremental`, calibrated baseline.

### Crossover thresholds

| toolCallCycles | pRetrieveMax where incremental wins | lcm advantage at default (0.2) |
|---|---|---|
| 100 | ~0.27 | +0.5% (negligible) |
| 150 | ~0.47 | +4.2% |
| 200 | ~0.77 | +8.2% |

**Key findings:**
1. **At pRetrieveMax=0, lcm-subagent still wins** (+3–11% by session length). The advantage is structural — full-replacement compaction produces a more cache-stable context prefix. Retrieval pricing is secondary.
2. **Default pRetrieveMax=0.2 is conservatively positioned.** The store fills gradually, so average p(retrieve) during a session is ~0.05–0.10. The recommendation is robust.
3. **Crossover threshold scales with session length.** Longer sessions → more compactions → more cache savings → more budget to absorb retrieval overhead.
4. **At 100-cycle sessions, the margin is thin** (0.5%). The recommendation holds but is nearly indifferent at this length.
5. **At ≥150 cycles, the recommendation is robust** — crossover at 0.47–0.77, far above operational range.

---

## compressedTokensCap Sensitivity (Exp 010)

Sweep over `compressedTokensCap` [20k–500k] × `toolCallCycles` [100, 150, 200] for `lcm-subagent` and `incremental`, pRetrieveMax=0.2 (default).

| cap | lcm(100) | adv(100) | lcm(150) | adv(150) | lcm(200) | adv(200) |
|---|---|---|---|---|---|---|
| 20,000 | $5.175 | -1.1% LOSE | $7.870 | +3.2% | $10.575 | +7.5% |
| 50,000 | $5.148 | -0.5% LOSE | $7.842 | +3.5% | $10.547 | +7.7% |
| 100,000 (default) | $5.092 | **+0.5%** | $7.786 | +4.2% | $10.491 | +8.2% |
| 200,000 | $5.002 | +2.3% | $7.647 | +5.9% | $10.346 | +9.5% |
| 500,000 | $4.988 | +2.6% | $7.592 | +6.6% | $10.227 | +10.5% |

Incremental cost is constant (cap-insensitive by design).

**Key findings:**
1. **Effect is modest**: 25× cap range → only ~3.4% lcm-subagent cost swing. Cap is a secondary lever vs pRetrieveMax.
2. **Mechanism**: larger cap → retrieval probability ramps more slowly as store fills → lower average retrieval cost → larger lcm advantage.
3. **Default cap=100k sits at the crossover for 100-cycle sessions** (+0.5%). At cap<100k, lcm marginally loses at 100 cycles.
4. **At ≥150 cycles, recommendation is cap-insensitive** — lcm wins even at cap=20k (+3.2% at 150 cycles).

---

## Cache Reliability Sensitivity (Exp 011)

Sweep over `cacheReliability` [1.0, 0.95, 0.9, 0.8, 0.7, 0.5] × `toolCallCycles` [100, 150, 200] × all 6 strategies, calibrated baseline.

### Strategy rankings at each reliability level (200 cycles)

| cacheReliability | #1 | #2 | #3 | #4 | #5 | #6 |
|---|---|---|---|---|---|---|
| 1.0 | lcm-subagent $10.49 | lossless-hier $11.34 | incremental $11.43 | lossless-tool $11.63 | lossless-app $11.92 | full-compact $20.71 |
| 0.9 | lcm-subagent $14.77 | lossless-hier $15.77 | incremental $15.92 | lossless-tool $17.52 | lossless-app $17.77 | full-compact $31.92 |
| 0.7 | lcm-subagent $22.27 | lossless-hier $23.27 | lossless-tool $26.84 | lossless-app $27.09 | incremental $28.45 | full-compact $60.85 |
| 0.5 | lcm-subagent $35.00 | lossless-hier $36.00 | incremental $42.32 | lossless-tool $42.63 | lossless-app $42.88 | full-compact $92.59 |

**lcm-subagent is cheapest at every (reliability, cycles) combination.** Rankings are stable. lossless-hierarchical rises to consistent #2 under unreliable caching.

### lcm-subagent advantage widens

| cycles | advantage at rel=1.0 | advantage at rel=0.9 | advantage at rel=0.7 |
|---|---|---|---|
| 100 | +0.5% | +2.9% | +13.1% |
| 150 | +4.2% | +8.9% | +16.1% |
| 200 | +8.2% | +7.2% | +21.7% |

### Crossover shift

| cacheReliability | Crossover (lcm vs incremental) |
|---|---|
| 1.0 | ~89 cycles |
| 0.9 | <60 cycles (lcm wins at all tested lengths) |
| 0.8 | <60 cycles |
| 0.7 | <60 cycles |

**The ~89-cycle crossover is a perfect-cache artefact.** Under realistic caching (rel<=0.9), lcm-subagent wins unconditionally.

### full-compaction penalty

| cycles | ratio at rel=1.0 | ratio at rel=0.7 | ratio at rel=0.5 |
|---|---|---|---|
| 100 | 1.69x | 2.49x | 2.23x |
| 150 | 2.16x | 3.08x | 3.07x |
| 200 | 1.97x | 2.73x | 2.65x |

full-compaction costs 2.5–3x more than lcm-subagent at rel=0.7.

**Key findings:**
1. **Strategy rankings are completely stable** — lcm-subagent wins at all reliability levels, session lengths, and strategy comparisons.
2. **lcm-subagent's advantage is larger under realistic caching** — 7–17% vs 0.5–8.2% at perfect cache.
3. **The ~89-cycle crossover disappears** at rel<=0.9 — lcm-subagent wins unconditionally.
4. **Absolute costs are 30–100% higher** than perfect-cache estimates at rel=0.8–0.9. Prior rankings remain valid; prior absolute costs are lower bounds.
5. **Mechanism**: a cache miss at large context costs proportionally more. lcm-subagent's ~27k average context vs incremental's ~43k makes it more robust to failures.

---

## Tool-Result Compression Sensitivity (Exp 012)

Sweep over `toolCompressionRatio` [2, 3, 5, 8] (enabled) vs no compression, all 6 strategies × `toolCallCycles` [100, 150, 200], calibrated baseline.

### Cost reduction (%) vs no compression at 200 cycles

| Strategy | r=2 | r=3 | r=5 | r=8 |
|---|---|---|---|---|
| full-compaction | **-2.3%** | **-4.9%** | **-4.7%** | **-1.8%** |
| incremental | 5.6% | 8.2% | 9.1% | 9.4% |
| lossless-append | 5.7% | 8.5% | 9.4% | 9.8% |
| lossless-hierarchical | 4.6% | 7.3% | 7.7% | 7.9% |
| lossless-tool-results | 6.5% | 9.3% | 10.4% | 10.8% |
| lcm-subagent | 3.1% | 5.2% | 5.3% | 5.1% |

### Strategy rankings (200 cycles) — stable at all ratios

lcm-subagent is #1 at every compression ratio. full-compaction remains last (and gets *worse* with compression at 200 cycles).

### lcm-subagent vs incremental gap narrows

| Cycles | No compression | r=3 | r=8 |
|---|---|---|---|
| 100 | +$0.028 (lcm wins) | -$0.004 (inc wins) | -$0.019 (inc wins) |
| 150 | +$0.343 | +$0.155 | +$0.113 |
| 200 | +$0.937 | +$0.541 | +$0.401 |

At 100 cycles with ratio≥3, incremental becomes marginally cheaper (<$0.02). Gap remains solidly positive at 150+ cycles.

### Compaction events drop from 7 to 5 (200 cycles, incremental-family strategies)

Slower context growth reduces compaction frequency. full-compaction stops compacting entirely at ratio≥5.

**Key findings:**
1. **Tool compression is a secondary optimisation (3–10% savings), not transformative.** The >15% hypothesis was rejected.
2. **lcm-subagent benefits least** (3–5% at 200 cycles) because it already maintains the smallest context. Diminishing returns beyond ratio=3.
3. **full-compaction gets worse** at 200 cycles — a threshold-trigger artefact. Compression slows context growth, delaying or preventing the single compaction event, resulting in more steps at high context size.
4. **Ratio=3 captures nearly all the benefit** and is achievable with structured extraction (no LLM needed). Practical sweet spot.
5. **Strategy rankings unchanged.** Tool compression is orthogonal to strategy choice — it helps all strategies proportionally (except full-compaction).

---

## Summary Growth Dynamics (Exp 013)

Three sweeps testing whether logarithmic summary growth (vs fixed convergence) changes strategy rankings or absolute costs. Calibrated baseline, `summaryGrowthCoefficient`=1000 default.

### Fixed vs Logarithmic cost impact (200 cycles)

| Strategy | Fixed | Logarithmic | % Change |
|---|---|---|---|
| lcm-subagent | $10.49 | $10.81 | +3.1% |
| lossless-hierarchical | $11.34 | $11.67 | +2.9% |
| incremental | $11.43 | $12.30 | +7.6% |
| lossless-tool-results | $11.63 | $12.21 | +5.0% |
| lossless-append | $11.92 | $12.79 | +7.3% |
| full-compaction | $20.71 | $20.71 | 0.0% |

**Rankings stable.** lcm-subagent #1 under both models. Full-replacement strategies (lcm-subagent, lossless-hierarchical) are most resilient to summary growth.

### lcm-subagent advantage widens

| Cycles | Fixed Advantage | Logarithmic Advantage |
|---|---|---|
| 100 | 0.5% | 1.5% |
| 150 | 4.2% | 6.6% |
| 200 | 8.2% | 12.1% |

### Coefficient sensitivity (logarithmic model, 200 cycles)

| Coefficient | lcm-subagent | incremental | lcm advantage |
|---|---|---|---|
| 500 | $10.49 | $11.43 | 8.2% |
| 1000 | $10.81 | $12.30 | 12.1% |
| 1500 | $11.39 | $13.77 | 17.3% |
| 2000 | $11.96 | $13.81 | 13.4% |

Cost swing: 14% (lcm) vs 21% (incremental) across coefficient range. Significant but doesn't affect rankings.

### Growth model × interval interaction

Under logarithmic growth, incremental's optimal interval shifts from 15k to 30k (+28% cost penalty at 15k). lcm-subagent's optimal stays at 15k regardless. This eliminates the "15k is cheapest" artefact from Exp 008 — it was a double artefact (no quality penalty AND fixed convergence).

**Key findings:**
1. **Phase 1-3 conclusions are fully robust** under more realistic summary growth.
2. **lcm-subagent advantage amplified** — 12.1% over incremental at 200 cycles (vs 8.2% under fixed).
3. **30k interval recommendation validated and strengthened** — 15k is harmful under realistic growth.
4. **Coefficient is a secondary concern** — affects absolute costs 10–24% but never changes rankings.

---

## contextWindow × compactionThreshold Sensitivity (Exp 014)

Sweep over `contextWindow` [30k–500k] and `compactionThreshold` [0.50–0.95] for lcm-subagent, plus cross-strategy validation at [64k, 128k, 200k], calibrated baseline.

### lcm-subagent: contextWindow has zero effect at ≥50k

| contextWindow | 100c Cost | 200c Cost | Peak Context | Compactions (200c) |
|---|---|---|---|---|
| 30,000 | $4.29 | $8.69 | 25,440 | 15 |
| 40,000 | $4.73 | $9.62 | 33,990 | 9 |
| 50,000 | $5.09 | $10.40 | 42,426 | 7 |
| **≥64,000** | **$5.09** | **$10.49** | **43,352** | **7** |

lcm-subagent's peak context is 43,352 tokens. The compaction threshold at 64k × 0.85 = 54,400 is never reached. The incrementalInterval (30k) is the sole compaction driver.

Below ~50k, the window threshold fires, forcing more compaction and lower costs — but this is the same modelling artefact as Exp 008 (no quality/latency penalty for compaction).

### compactionThreshold: irrelevant at standard windows

At 200k window, all thresholds [0.70–0.95] produce identical costs. At 40k window, threshold has effect (23% cost spread, 0.50–0.95) — same artefact.

### Cross-strategy window sensitivity (200 cycles)

| Strategy | 64k | 128k | 200k | Sensitivity |
|---|---|---|---|---|
| **lcm-subagent** | **$10.49** | **$10.49** | **$10.49** | None |
| lossless-hierarchical | $11.34 | $11.34 | $11.34 | None |
| full-compaction | **$11.31** | $16.26 | $20.71 | **−45%** |
| incremental | $11.36 | $11.43 | $11.43 | Marginal |
| lossless-tool-results | $11.56 | $11.63 | $11.63 | Marginal |
| lossless-append | $11.85 | $11.92 | $11.92 | Marginal |

**full-compaction is massively window-sensitive** — at 64k it compacts 5× instead of once, reducing cost 45%. At 64k, all strategies converge to a narrow $10.49–$11.85 range (13% spread vs 97% at 200k). But lcm-subagent remains #1 at every window.

**Key findings:**
1. **contextWindow is a non-decision for lcm-subagent** — use whatever the API provides. The incrementalInterval is the binding compaction constraint.
2. **compactionThreshold is similarly irrelevant** — context never approaches the threshold at standard windows.
3. **full-compaction's poor performance is partly a window artefact** — at 64k it approaches parity with other strategies ($11.31 vs $11.43 incremental). But lcm-subagent still wins.
4. **Strategy rankings stable** across all window sizes and thresholds.

---

## Cross-Experiment Conclusions

### Strategy recommendation for Models Agent

**Use `lcm-subagent` unconditionally.** Across 14 experiments spanning Phase 1 (baselines and parameter sweeps), Phase 2 (retrieval stress tests), Phase 3 (cache and ingestion), and Phase 4 (deployment optimisation), lcm-subagent is the cheapest strategy in every realistic scenario.

| Session length | Strategy | Cost advantage over next-best | Confidence |
|---|---|---|---|
| ≥150 cycles | `lcm-subagent` | 4–11% over incremental | High — robust to all tested perturbations |
| 90–150 cycles | `lcm-subagent` | 0.5–4% over incremental | Medium — thin but consistent advantage |
| <90 cycles | `lcm-subagent` (or any except full-compaction) | Negligible | Low — nearly indifferent at this length |
| Any length | Avoid `full-compaction` | 50–100% more expensive | Very high |

**Why lcm-subagent wins** (Exp 009 insight): The advantage is structural — full-replacement compaction produces a more cache-stable context prefix. This drives cache reuse savings that persist even with retrieval disabled. Retrieval pricing amplifies but does not create the advantage.

### Implementation parameters for Models Agent

| Parameter | Recommended value | Notes |
|---|---|---|
| `selectedStrategy` | `lcm-subagent` | Use unconditionally |
| `contextWindow` | API default (128k–200k) | Non-decision: lcm-subagent's peak context (43k) never reaches window threshold. incrementalInterval drives compaction (Exp 014) |
| `compactionThreshold` | 0.85 (default) | Non-decision: irrelevant for lcm-subagent at any standard window (Exp 014) |
| `compressionRatio` | 10 (default) | Higher appears cheaper in model but is a modelling artefact; 10× is practically achievable |
| `incrementalInterval` | 30,000 (default) | 15k appears cheapest but is a modelling artefact; 30k avoids over-summarisation risk |
| `pRetrieveMax` | 0.2 (default) | Well within safe zone; recommendation flips only at 0.27–0.77 depending on session length |
| `compressedTokensCap` | 100,000 (default) | Secondary lever; 25× variation → 3.4% cost swing; default well-positioned |
| `toolCompressionEnabled` | true (if practical) | 3–5% savings for lcm-subagent; secondary optimisation |
| `toolCompressionRatio` | 3 | Sweet spot: captures nearly all benefit without requiring LLM summarisation |

### Modelling limitations (do not over-interpret)

1. **Compression ratio**: No quality penalty for over-compression — model always prefers higher ratios. Real-world compression quality degrades before 10×.
2. **Compaction frequency**: No latency or quality-degradation cost for over-compaction — model always prefers shorter intervals. Real compaction has latency overhead.
3. **Retrieval quality**: `pRetrieveMax` is fixed and doesn't degrade with store size. Exp 009 showed the recommendation remains robust unless average retrieval rates are implausibly high (>30–80% of steps).
4. **Conversation determinism**: Simulated conversations are deterministic averages. Real conversations have higher variance in tool result sizes and cycle counts.
5. **Cache model at default is optimistic** (#93, investigated in Exp 011): The `cacheReliability` parameter now allows probabilistic cache degradation. At rel=1.0 (default), absolute costs are optimistic. Exp 011 confirmed that unreliable caching **widens** lcm-subagent's advantage (from 0.5–8.2% to 3–17% over incremental) and eliminates the ~89-cycle crossover. Strategy *rankings* are robust; absolute *cost estimates* from prior experiments should be treated as lower bounds. A realistic production value of rel=0.8–0.9 increases costs 30–100%.
6. **Reasoning output uncalibrated** (#94): `reasoningOutputSize` defaults to 500 tokens; analysis of 127 Models Agent JSON conversations shows mean=265, and only 47% of turns include thinking. The sim overcharges reasoning ~3-4x. Affects absolute costs (all strategies equally), not rankings.
7. **Summary convergence ceiling** (#95, investigated in Exp 013): ~~At ratio=10 with 30k interval, summary converges to ~3.3k tokens.~~ Now configurable via `summaryGrowthModel` ('fixed' | 'logarithmic') and `summaryGrowthCoefficient` (default 1000). Exp 013 confirmed: logarithmic growth increases costs 1.5–7.6% depending on strategy, with incremental-family strategies hit hardest (7.6% at 200 cycles). Strategy *rankings* are completely stable — lcm-subagent wins at all growth models and coefficients. The 30k interval recommendation is validated and strengthened: under logarithmic growth, 15k becomes 24–28% more expensive for incremental (a double artefact eliminated). `summaryGrowthCoefficient` sensitivity is 10–24% across the 500–2000 range — needs real-world calibration for accurate absolute costs but doesn't affect rankings.
8. **Tool compression is free in the model** (#103, Exp 012): `toolCompressionEnabled` reduces tool result tokens at ingestion with no processing cost. In practice, ratio≥5 requires LLM summarisation with its own API cost. The sim's 3–5% savings for lcm-subagent at ratio=3+ may be partially offset by compression costs. Ratio=3 is achievable with structured extraction (no LLM), making it the practical recommendation.

### Cost structure insight (post-Phase 2 review)

Cost breakdown at calibrated baseline (200 cycles) reveals **why** full-compaction loses:

| Component | full-compaction | lcm-subagent |
|---|---|---|
| Cached input | $16.01 (77%) | $5.35 (51%) |
| Output | $3.15 (15%) | $3.15 (30%) |
| Cache write | $0.73 (4%) | $0.65 (6%) |
| Uncached input | $0.63 (3%) | $0.72 (7%) |
| Compaction | $0.19 (1%) | $0.28 (3%) |
| Retrieval | $0.00 (0%) | $0.35 (3%) |
| **Total** | **$20.71** | **$10.49** |

The entire difference is **cached input volume**: average context 80k vs 27k. Even at 90% cache discount, sending 80k cached tokens per turn costs far more than 27k. Compaction and retrieval costs are noise (< 4% combined). **The cheapest strategy is the one that keeps context smallest.**

### Reasoning calibration data (from JSON conversation logs)

Source: 127 conversations at `%APPDATA%/models-ai-agent/conversations/`. 15 had reasoning enabled.

| Parameter | Calibrated value | Current default | Source |
|---|---|---|---|
| `reasoningOutputSize` | 265 (mean) | 500 | 143 thinking blocks across 15 conversations |
| reasoning frequency | 47% of turns | 100% (implicit) | Not yet modelled — no parameter exists |
| `assistantMessageSize` (reasoning-on) | 87 (mean) | 130 | 303 assistant turns in reasoning-on conversations |

Thinking/assistant ratio: 3.0x (vs implied 3.8x at defaults). Heavy-tailed distribution: P90=566.

### Open questions for future investigation

- **Realistic cacheReliability value**: What is the actual API cache hit rate in production? Measuring this would ground Exp 011's findings and give accurate absolute cost projections.
- **Cache reliability × incrementalInterval interaction**: At shorter intervals, more compaction events create more cache invalidation — but each invalidation affects a smaller context. May shift the "30k is safest" recommendation.
- **Reasoning frequency impact** (#94): Does modelling reasoning on only 47% of turns shift any strategy rankings, or just absolute costs?
- ~~**Summary growth models** (#95): Does allowing summary size to grow sublinearly over long sessions change the balance between in-context retention vs retrieval?~~ **Answered (Exp 013):** No — rankings stable, lcm advantage widens (8.2%→12.1%). 30k interval validated.
- **summaryGrowthCoefficient calibration**: Real compaction outputs needed to calibrate coefficient (currently untested range 500–2000). Affects absolute costs 10–24% but not rankings.
- **Growth model × cacheReliability interaction**: Exp 011 showed reliability widens lcm advantage; Exp 013 showed growth model does too. Combined effect may compound.
- **Cost of tool compression itself**: Exp 012 treats compression as free. In practice, LLM-based summarisation at ratio≥5 has its own API cost. A more realistic model would add a per-result compression cost, which could erode or eliminate the 5% savings at high ratios.
- **Selective tool compression**: Compressing only large tool results (>500 tokens) while leaving small ones intact might be more practical and still capture most benefit.
- **Latency modelling**: When wall-clock time matters, compaction frequency trade-offs may flip. Would require engine changes.
- **Crossover shift under combined conditions**: The ~89-cycle crossover may shift under elevated pRetrieveMax + small cap + high compression simultaneously.
- **Compaction cost should vary with method**: At 1.1x compression, programmatic (free) methods may suffice; at 10x, LLM synthesis is needed. The sim charges the same rate regardless.

---

## Programme Status (2026-04-03)

**14 experiments complete (Phases 1-3 + two Phase 4 experiments).** The core research question — which compaction strategy to use for the Models Agent — is answered with high confidence. lcm-subagent wins unconditionally in every tested scenario.

**Phase 4 pivot (Tim direction, 2026-04-02):** The research focus shifts from *which strategy* to *how to implement lcm-subagent*. The guiding question: "What can we simulate to inform the real-world implementation?" This includes implementation variants, optimal configuration, context quality modelling, and summary growth dynamics. See #108 for the full Phase 4 epic.

**Phase 4 progress:**
- Exp 013 (summary growth dynamics) — validated all Phase 1-3 conclusions as robust under logarithmic growth. lcm-subagent advantage amplified from 8.2% to 12.1% at 200 cycles.
- Exp 014 (contextWindow × compactionThreshold) — both parameters are non-decisions for lcm-subagent. incrementalInterval is the sole compaction driver. Full-compaction's poor performance is partly a window artefact.

**Wrap-up backlog (complete before Phase 4 experiments):**
- ~~**#96 (Update defaults)** — DONE; DEFAULT_CONFIG now uses calibrated Models Agent values~~
- ~~**#95 (Summary growth model)** — DONE; `summaryGrowthModel` + `summaryGrowthCoefficient` added (PR #117)~~
- **#94 (Reasoning calibration)** — MEDIUM; model fidelity improvement

---

## Experiment Index

| Exp | Issue | Description | Status | Key finding |
|---|---|---|---|---|
| 001 | #66 | Default baseline | done | lcm-subagent cheapest; full-compaction 92% more expensive |
| 002 | #67 | Semi-calibrated (heavy tool results) | done | Same ranking; cost 3× higher with 4k tool results |
| 003 | #68 | Calibrated baseline (Models Agent params) | done | **Canonical reference**: lcm-subagent $10.49 vs full-compact $20.71 |
| 004 | #69 | Tool result size sensitivity (100–5000) | done | lcm-subagent cheapest at all sizes |
| 005 | #70 | Short session regime (80 cycles) | done | full-compaction never fires, 50% more expensive |
| 006 | #71 | Compression ratio sensitivity | done | lcm-subagent wins at all ratios; peak at ratio=5 (15.23%); default ratio=10 recommended |
| 007 | #73 | lcm-subagent vs incremental crossover | done | Crossover at ~89 cycles; lcm-subagent wins unconditionally in practice |
| 008 | #74 | incrementalInterval sensitivity | done | 15k "cheapest" is a model artefact; 30k default recommended; engine: NumericValuesRange |
| 009 | #86 | pRetrieveMax sensitivity | done | lcm-subagent wins structurally (cache, not retrieval); robust at ≥150 cycles; thin margin at 100 cycles |
| 010 | #88 | compressedTokensCap sensitivity | done | Secondary lever (3.4% swing vs 25× cap range); default 100k well-positioned; ≥150 cycles cap-insensitive |
| — | #90 | Phase 2 synthesis | done | Cross-experiment conclusions updated; implementation parameters documented |
| 011 | #98 | Cache reliability sensitivity | done | Rankings stable; lcm advantage widens (3–17% vs 0.5–8.2%); ~89-cycle crossover disappears at rel<=0.9 |
| 012 | #103 | Tool-result compression sensitivity | done | Secondary lever (3–10% savings); ratio=3 sweet spot; rankings stable; full-compaction worse |
| 013 | #119 | Summary growth dynamics | done | Rankings stable under logarithmic growth; lcm advantage widens (8.2%→12.1%); 30k interval validated |
| 014 | #121 | contextWindow × compactionThreshold sensitivity | done | contextWindow and threshold are non-decisions for lcm-subagent; incrementalInterval drives compaction; full-compaction penalty is partly a window artefact |
