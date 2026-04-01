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

## Cross-Experiment Conclusions

### Strategy recommendation for Models Agent

**Use `lcm-subagent` unconditionally.** It is the cheapest strategy for sessions ≥ 90 cycles, and the cost penalty at shorter sessions is negligible ($0.022). Avoid `full-compaction` in all cases.

| Session length | Recommended strategy | Rationale |
|---|---|---|
| Any length | `lcm-subagent` | Cheapest ≥90 cycles; negligible penalty <90 cycles |
| — | Avoid `full-compaction` | Always most expensive; 50–100% more than competitors |

### Parameter recommendations

| Parameter | Recommended value | Notes |
|---|---|---|
| `compressionRatio` | 10 (default) | Higher appears cheaper in model but is an artefact; 10× is achievable in practice |
| `incrementalInterval` | 30,000 (default) | 15k appears cheapest in model but is an artefact of cheap compaction; 30k avoids quality risk |

<<<<<<< HEAD
### Modelling limitations identified

1. **Compression ratio**: No quality penalty for over-compression. Model always prefers higher ratios.
2. **Compaction frequency**: No latency cost or quality-degradation cost for over-compaction. Model always prefers shorter intervals.
3. **Retrieval quality**: `pRetrieveMax` is fixed; should degrade with higher compression or more distant history.

### Open questions for future phases

- `pRetrieveMax` sensitivity: how sensitive is lcm-subagent's advantage to retrieval success rate?
- Crossover shift under different compression ratios or tool result sizes
- Latency modelling: compaction frequency trade-offs when wall-clock time matters

---

## Experiment Index

| Exp | Issue | Description | Status | Key finding |
|---|---|---|---|---|
| 001 | #66 | Default baseline | done | lcm-subagent cheapest; full-compaction 92% more expensive |
| 002 | #67 | Semi-calibrated (heavy tool results) | done | Same ranking; cost 3× higher with 4k tool results |
| 003 | #68 | Calibrated baseline (Models Agent params) | done | **Canonical reference**: lcm-subagent $10.49 vs full-compact $20.71 |
| 004 | #69 | Tool result size sensitivity (100–5000) | done | lcm-subagent cheapest at all sizes |
| 005 | #70 | Short session regime (80 cycles) | done | full-compaction never fires, 50% more expensive |
| 006 | #71 | Compression ratio sensitivity | done | lcm-subagent wins at all ratios; peak advantage at ratio=5 (15.23%); default ratio=10 recommended |
| 007 | #73 | lcm-subagent vs incremental crossover | done | Crossover at ~89 cycles; lcm-subagent wins unconditionally in practice |
| 008 | #74 | incrementalInterval sensitivity | done | 15k "cheapest" but artefact; 30k default recommended; engine change for NumericValuesRange |
