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

## Cross-Experiment Conclusions

### Strategy recommendations for Models Agent

| Session length | Recommended strategy | Rationale |
|---|---|---|
| Long (200+ cycles) | `lcm-subagent` | Clear cheapest; 9% cheaper than incremental |
| Medium (unknown crossover) | TBD — see Exp 007 | Crossover between ~80–200 cycles |
| Short (≤80 cycles) | Any except `full-compaction` | All similar; avoid full-compaction |

**Avoid `full-compaction` in all cases.** It is always the most expensive and provides no benefit when context is short.

### Open sensitivity questions

- **Crossover session length**: Where exactly does lcm-subagent become cheaper than incremental? (Exp 007 target)
- **Compression ratio**: How sensitive is cost to the compression ratio parameter? (Exp 006 target)
- **Incremental interval**: What's the optimal `incrementalInterval` for Models Agent session lengths? (Exp 008 target)

---

## Experiment Index

| Exp | Issue | Description | Status | Key finding |
|---|---|---|---|---|
| 001 | #66 | Default baseline | done | lcm-subagent cheapest; full-compaction 92% more expensive |
| 002 | #67 | Semi-calibrated (heavy tool results) | done | Same ranking; cost 3× higher with 4k tool results |
| 003 | #68 | Calibrated baseline (Models Agent params) | done | **Canonical reference**: lcm-subagent $10.49 vs full-compact $20.71 |
| 004 | #69 | Tool result size sensitivity (100–5000) | done | lcm-subagent cheapest at all sizes |
| 005 | #70 | Short session regime (80 cycles) | done | full-compaction never fires, 50% more expensive |
| 006 | #71 | Compression ratio sensitivity | backlog | — |
| 007 | #73 | lcm-subagent vs incremental crossover | backlog | — |
| 008 | #74 | incrementalInterval sensitivity | backlog | — |
