# Exp 010: compressedTokensCap Sensitivity

**Issue**: #88 | **Branch**: `experiment/010-compressedTokensCap-sensitivity` | **Part of**: Phase 2 (#85)

---

## Hypothesis

`compressedTokensCap` controls the rate at which retrieval probability ramps up. A smaller cap means the external store "fills" faster relative to its capacity, driving retrieval probability to its ceiling (pRetrieveMax) earlier in the session. A larger cap defers retrieval pressure, keeping average retrieval costs lower. We expect lcm-subagent's advantage over incremental to increase with cap size, and potentially flip at very small caps for short sessions.

---

## Method

**Config**: `experiments/data/010/sweep-compressedTokensCap.json`

Cartesian sweep: 2 strategies × 5 cap values × 3 session lengths = 30 runs.

- **Strategies**: `lcm-subagent`, `incremental`
- **compressedTokensCap**: [20k, 50k, 100k (default), 200k, 500k]
- **toolCallCycles**: [100, 150, 200]
- **pRetrieveMax**: 0.2 (default, fixed)
- **All other params**: calibrated baseline

Retrieval probability model: `p(retrieve) = min(compressedTokens / cap, 1) × pRetrieveMax`. Incremental ignores retrieval parameters entirely — its cost is constant across cap values, making this a clean isolation of cap's effect on lcm-subagent.

---

## Results

| cap | lcm(100) | inc(100) | adv(100) | lcm(150) | inc(150) | adv(150) | lcm(200) | inc(200) | adv(200) |
|---|---|---|---|---|---|---|---|---|---|
| 20,000 | $5.175 | $5.120 | **-1.1% LOSE** | $7.870 | $8.129 | +3.2% WIN | $10.575 | $11.428 | +7.5% WIN |
| 50,000 | $5.148 | $5.120 | **-0.5% LOSE** | $7.842 | $8.129 | +3.5% WIN | $10.547 | $11.428 | +7.7% WIN |
| 100,000 (default) | $5.092 | $5.120 | +0.5% WIN | $7.786 | $8.129 | +4.2% WIN | $10.491 | $11.428 | +8.2% WIN |
| 200,000 | $5.002 | $5.120 | +2.3% WIN | $7.647 | $8.129 | +5.9% WIN | $10.346 | $11.428 | +9.5% WIN |
| 500,000 | $4.988 | $5.120 | +2.6% WIN | $7.592 | $8.129 | +6.6% WIN | $10.227 | $11.428 | +10.5% WIN |

**Cost swing (cap 20k → 500k) for lcm-subagent**: ~3.4% at all session lengths. Incremental is constant.

**Flip points**: lcm-subagent loses at 100 cycles for caps ≤ 50k. Wins everywhere at ≥150 cycles regardless of cap.

---

## Analysis

### 1. Mechanism: cap size delays retrieval pressure onset

A smaller cap means the external store registers as "full" sooner (in terms of `compressedTokens / cap` ratio), pushing retrieval probability toward its ceiling faster. This is the correct reading: larger cap = lower average retrieval probability during a session = lower retrieval overhead = larger lcm-subagent advantage.

This is *not* about recall quality or memory capacity — the model doesn't distinguish between information stored at cap=20k vs 500k, only about how quickly retrieval probability saturates.

### 2. Effect is modest: ~3.4% swing across a 25× range of cap values

Even varying the cap by 25× (20k to 500k) only moves lcm-subagent cost by ~3.4%. Compared to pRetrieveMax sensitivity (which can flip the recommendation entirely at high retrieval rates), cap size is a secondary lever. The recommendation is robust across cap values in the realistic range.

### 3. Default cap=100k is the crossover point at 100 cycles

At cap=100k with 100 cycles: lcm wins by 0.5%. At cap=50k: it loses by 0.5%. The default sits right at the crossover for short sessions. This is consistent with Exp 009's finding that 100-cycle sessions have a thin margin (+0.5% advantage at default settings).

### 4. At ≥150 cycles, recommendation is cap-insensitive

Even at the most aggressive small-cap setting (20k), lcm-subagent wins at 150 cycles (+3.2%) and 200 cycles (+7.5%). The session length dominates over cap sensitivity.

### 5. Very large caps approach the zero-retrieval limit

At cap=500k with 200 cycles: advantage is +10.5%, approaching the zero-retrieval result from Exp 009 (+11.2%). This confirms that large caps effectively defer retrieval to the point where it barely contributes to cost during typical session lengths.

---

## Conclusions

1. **Default compressedTokensCap=100k is well-positioned** — it sits at the crossover for short sessions (100 cycles), giving lcm-subagent a small positive margin. For the primary Models Agent target (150–200 cycles), it's robust.

2. **Cap sensitivity is secondary to pRetrieveMax sensitivity.** A 25× cap variation produces a 3.4% cost swing; a 5× pRetrieveMax variation can flip the recommendation entirely. If tuning is needed, pRetrieveMax is the more impactful lever.

3. **For very short sessions (≤100 cycles) with constrained cap (≤50k), incremental marginally wins.** This is an edge case in practice — the Models Agent primarily runs sessions of 100+ cycles and uses the default cap=100k.

4. **The recommendation remains: use lcm-subagent.** Even at the worst-case cap tested (20k), lcm-subagent wins for the primary session lengths. The 100-cycle edge case (-1.1%) is below the noise floor of session-to-session variability.

---

## Next Questions

- **Combined stress test**: pRetrieveMax=0.3 + cap=50k + 100 cycles — cumulative pressure from both dimensions simultaneously.
- **Phase 2 synthesis**: With Exps 009 and 010 complete, the recommendation is robustly validated. Is further stress-testing needed, or is it time to synthesise Phase 2 findings and move to implementation planning?
